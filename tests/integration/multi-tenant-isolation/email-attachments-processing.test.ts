/**
 * Test d'intégration — ingestion email : doc.email_brut (recu) → pièces jointes → ingestion.
 *
 * Vérifie l'orchestration de processPendingEmails : appel Graph (listAttachments/download),
 * FILTRAGE des pièces (≠ inline, type autorisé, taille plausible), transition de statut de
 * l'email (recu → traite/ignore), et appel du cœur d'ingestion avec la bonne source.
 * Le cœur d'ingestion réel (storage + classif) est injecté (spy) pour rester déterministe.
 *
 * Réf : maillon « email → document → classification ».
 */
import { randomUUID } from "node:crypto";
import type { AttachmentMeta } from "@zarya/integrations";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type GraphAttachmentSource,
  type ProcessEmailsDeps,
  processPendingEmails,
} from "../../../apps/web/lib/process-emails";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const PDF_BYTES = Buffer.from("%PDF-1.4 fake", "utf8");

function fakeGraph(attachments: AttachmentMeta[]): GraphAttachmentSource {
  return {
    listAttachments: vi.fn(async () => attachments),
    downloadAttachment: vi.fn(async () => PDF_BYTES),
  };
}

async function seedEmailAvecPieces(
  sql: ReturnType<typeof createServiceClient>,
  cabinet_id: string,
  hasAttachments: boolean,
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.email_brut (id, cabinet_id, message_id, subject, from_address, has_attachments, statut)
    VALUES (${id}, ${cabinet_id}, ${`msg-${id}`}, 'Facture', 'client@pme.ch', ${hasAttachments}, 'recu')
  `;
  return id;
}

describe("Ingestion email — pièces jointes → documents", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let ingestSpy: ReturnType<typeof vi.fn>;
  let deps: ProcessEmailsDeps;

  beforeEach(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    ingestSpy = vi.fn(async () => ({ status: "recu" as const, fichier_physique_id: randomUUID() }));
    deps = { ingest: ingestSpy };
  });

  afterAll(async () => {
    await sql.end();
  });

  test("email avec PDF → pièce ingérée (source email_microsoft), email passe 'traite'", async () => {
    const emailId = await seedEmailAvecPieces(sql, cabinetA.id, true);
    deps.makeGraphClient = () =>
      fakeGraph([
        {
          id: "att-1",
          name: "facture.pdf",
          contentType: "application/pdf",
          size: 12000,
          isInline: false,
          isFile: true,
        },
      ]);

    const res = await processPendingEmails({ cabinet_id: cabinetA.id, deps });

    expect(res.traite).toBe(1);
    expect(res.documents).toBe(1);
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    expect(ingestSpy.mock.calls[0]?.[0]).toMatchObject({
      cabinet_id: cabinetA.id,
      source: "email_microsoft",
      nom_fichier: "facture.pdf",
      type_mime: "application/pdf",
    });
    const [row] = await sql<{ statut: string }[]>`
      SELECT statut::text AS statut FROM doc.email_brut WHERE id = ${emailId}
    `;
    expect(row?.statut).toBe("traite");
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  });

  test("pièces inline / images minuscules / types interdits → ignorées (email 'ignore')", async () => {
    const emailId = await seedEmailAvecPieces(sql, cabinetA.id, true);
    deps.makeGraphClient = () =>
      fakeGraph([
        {
          id: "sig",
          name: "logo.png",
          contentType: "image/png",
          size: 800,
          isInline: true,
          isFile: true,
        },
        {
          id: "small",
          name: "icon.png",
          contentType: "image/png",
          size: 1000,
          isInline: false,
          isFile: true,
        },
        {
          id: "cal",
          name: "invite.ics",
          contentType: "text/calendar",
          size: 5000,
          isInline: false,
          isFile: true,
        },
        { id: "ref", name: "lien", contentType: null, size: null, isInline: false, isFile: false },
      ]);

    const res = await processPendingEmails({ cabinet_id: cabinetA.id, deps });

    expect(res.ignore).toBe(1);
    expect(res.documents).toBe(0);
    expect(ingestSpy).not.toHaveBeenCalled();
    const [row] = await sql<{ statut: string }[]>`
      SELECT statut::text AS statut FROM doc.email_brut WHERE id = ${emailId}
    `;
    expect(row?.statut).toBe("ignore");
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  });

  test("email sans pièce jointe → 'ignore', aucun appel Graph", async () => {
    await seedEmailAvecPieces(sql, cabinetA.id, false);
    const make = vi.fn(() => fakeGraph([]));
    deps.makeGraphClient = make;

    const res = await processPendingEmails({ cabinet_id: cabinetA.id, deps });

    expect(res.ignore).toBe(1);
    expect(make).not.toHaveBeenCalled();
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  });
});
