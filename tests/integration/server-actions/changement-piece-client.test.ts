/**
 * G3b — server actions client : déclarer un changement + attacher une pièce (DB réelle).
 *
 * `@zarya/auth` mocké (requireClientContact). Vérifie : déclaration changement (salaire.changement
 * + compteur période + événement + garde éditable), attache pièce (lien doc.document scopé client +
 * événement), anti-fuite. Réf : salaire.md §7.5-7.6 ; KICKOFF G3.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedEmploye,
  seedFichierPhysique,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
  client_id: null as null | string,
}));
vi.mock("@zarya/auth", () => ({
  requireClientContact: async () => {
    if (!authState.user || !authState.client_id) throw new Error("ForbiddenError");
    return { user: authState.user, client_id: authState.client_id };
  },
}));

const { declarerChangementClientAction, attacherPieceClientAction } = await import(
  "../../../apps/web/app/(app)/espace/validations/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let employeA: { id: string };
let periodeId: string;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  employeA = await seedEmploye(sql, cabinetA.id, clientA.id);
  periodeId = (await seedPeriode(sql, cabinetA.id, clientA.id)).id;
});

afterEach(() => {
  authState.user = null;
  authState.client_id = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function actorClient(cabinet_id: string, client_id: string) {
  authState.user = {
    id: randomUUID(),
    app_metadata: { cabinet_id, role: "client_contact", client_id },
  };
  authState.client_id = client_id;
}
function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("declarerChangementClientAction (G3b)", () => {
  test("crée le changement + incrémente le compteur + événement", async () => {
    actorClient(cabinetA.id, clientA.id);
    const res = await declarerChangementClientAction(
      {},
      fd({
        periode_id: periodeId,
        type: "changement_salaire",
        date_effet: "2026-05-15",
        employe_id: employeA.id,
        montant_impact: "200",
        description: "Augmentation annuelle",
      }),
    );
    expect(res.success).toBe(true);

    const [ch] = await sql`
      SELECT type, source, montant_impact FROM salaire.changement
      WHERE periode_id = ${periodeId} AND employe_id = ${employeA.id}`;
    expect(ch?.type).toBe("changement_salaire");
    expect(ch?.source).toBe("client_dashboard");
    expect(Number(ch?.montant_impact)).toBe(200);

    const [p] =
      await sql`SELECT nb_changements_declares FROM salaire.periode WHERE id = ${periodeId}`;
    expect(p?.nb_changements_declares).toBeGreaterThanOrEqual(1);

    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${periodeId} AND type = 'changement_declare'`;
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  test("rejette un type invalide", async () => {
    actorClient(cabinetA.id, clientA.id);
    const res = await declarerChangementClientAction(
      {},
      fd({ periode_id: periodeId, type: "n_importe_quoi", date_effet: "2026-05-15" }),
    );
    expect(res.error).toBeTruthy();
  });
});

describe("attacherPieceClientAction (G3b)", () => {
  test("rattache un document du client à la période", async () => {
    const fp = await seedFichierPhysique(sql, cabinetA.id);
    const doc = await seedDocument(sql, cabinetA.id, clientA.id, fp.id);
    actorClient(cabinetA.id, clientA.id);

    const res = await attacherPieceClientAction(
      {},
      fd({
        periode_id: periodeId,
        document_id: doc.id,
        categorie: "heures",
        type_libre: "Décompte heures",
      }),
    );
    expect(res.success).toBe(true);

    const [pc] = await sql`
      SELECT document_id, source, categorie FROM salaire.piece
      WHERE periode_id = ${periodeId} AND document_id = ${doc.id}`;
    expect(pc?.source).toBe("client_dashboard");
    expect(pc?.categorie).toBe("heures");
  });

  test("anti-fuite : un document d'un autre client est refusé", async () => {
    const clientB = await seedClient(sql, cabinetB.id);
    const fpB = await seedFichierPhysique(sql, cabinetB.id);
    const docB = await seedDocument(sql, cabinetB.id, clientB.id, fpB.id);
    actorClient(cabinetA.id, clientA.id); // client A tente d'attacher le doc de B
    const res = await attacherPieceClientAction(
      {},
      fd({ periode_id: periodeId, document_id: docB.id }),
    );
    expect(res.error).toMatch(/introuvable/i);
  });
});
