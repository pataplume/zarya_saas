/**
 * Robustesse classification : (1) un échec du mode LIVE ne fait pas DISPARAÎTRE le document
 * (repli stub → proposition toujours créée) ; (2) reprocessPendingDocuments reclasse les
 * uploads bloqués en 'recu' (classification jamais aboutie).
 *
 * Réf : incident prod « IK_MODEL_CHAT_SMALL absent » → docs invisibles.
 */
import { randomUUID } from "node:crypto";
import { type Classifier, classifyDocument } from "@zarya/extraction";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { reprocessPendingDocuments } from "../../../apps/web/lib/reprocess-documents";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedFichierPhysique,
  seedTwoCabinets,
  seedUploadBrut,
  type TestCabinet,
} from "../helpers/seed";

// Classifieur LIVE qui échoue (simule IK_MODEL_CHAT_SMALL absent / 429 / coupure).
const throwingLive: Classifier = {
  mode: "live",
  classify: async () => {
    throw new Error("IK_MODEL_CHAT_SMALL absent");
  },
};

describe("Robustesse classification (repli live→stub + reclassement)", () => {
  let sql: postgres.Sql;
  let cab: TestCabinet;
  let cabB: TestCabinet;

  beforeAll(async () => {
    sql = createServiceClient();
    const r = await seedTwoCabinets(sql);
    cab = r.cabinetA;
    cabB = r.cabinetB;
  }, 60_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cab.id, cabB.id);
    await sql.end();
  });

  test("échec LIVE → repli stub : une proposition est créée (doc non perdu)", async () => {
    const fp = await seedFichierPhysique(sql, cab.id);
    const res = await classifyDocument(
      { cabinet_id: cab.id, fichier_physique_id: fp.id, nom_fichier: "facture-2026.pdf" },
      throwingLive,
    );
    expect(res.proposition_id).toBeTruthy();

    const [prop] = (await sql`
      SELECT id FROM doc.proposition_classement WHERE id = ${res.proposition_id}
    `) as unknown as { id: string }[];
    expect(prop?.id).toBe(res.proposition_id);

    // Deux invocations tracées : l'échec live + le succès stub (fallback).
    const invs = (await sql`
      SELECT status, model_used FROM extraction.invocation
      WHERE input_document_id = ${fp.id} ORDER BY created_at ASC
    `) as unknown as { status: string; model_used: string }[];
    expect(invs.length).toBe(2);
    expect(invs[0]?.status).toBe("unknown_error");
    expect(invs[1]?.model_used).toBe("stub");
    expect(invs[1]?.status).toBe("success");
  });

  test("reprocessPendingDocuments reclasse un upload bloqué en 'recu'", async () => {
    const upload = await seedUploadBrut(sql, cab.id, randomUUID());
    await seedFichierPhysique(sql, cab.id, upload.id);
    // L'upload est 'recu' sans proposition (classification jamais aboutie).

    const res = await reprocessPendingDocuments({ cabinet_id: cab.id });
    expect(res.reclasses).toBeGreaterThanOrEqual(1);

    const [row] = (await sql`
      SELECT statut::text AS statut FROM doc.upload_brut WHERE id = ${upload.id}
    `) as unknown as { statut: string }[];
    // Mode stub (défaut test) → file de validation.
    expect(row?.statut).toBe("a_valider");

    const props = (await sql`
      SELECT pc.id FROM doc.proposition_classement pc
      JOIN doc.fichier_physique fp ON fp.id = pc.fichier_physique_id
      WHERE fp.upload_brut_id = ${upload.id}
    `) as unknown as { id: string }[];
    expect(props.length).toBe(1);
  });
});
