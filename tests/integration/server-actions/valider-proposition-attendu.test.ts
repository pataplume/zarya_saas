/**
 * B3 — Détection période + MAJ `crm.document_attendu` (chemin réel, server action).
 *
 * Couvre ce que les tests unitaires (`match-document-attendu.test.ts`) ne peuvent pas :
 *  1. À la validation, l'attente couverte passe à `recu` + le doc.document est lié
 *     (`document_attendu_id`), et un `crm.evenement` `document_recu` est émis.
 *  2. Pas d'appariement (fréquence incompatible) → doc créé, événement émis,
 *     attente INTACTE.
 *  3. SCOPE : l'attente d'un AUTRE client (même cabinet) n'est jamais touchée.
 *
 * On teste la VRAIE `validerPropositionAction` (apps/web) contre la base de test ;
 * `@zarya/auth` mocké et `next/cache` stubé (cf. valider-proposition.test.ts).
 *
 * Références : KICKOFF § BLOC B / B3 · doc.md §6.3 · doc-schema.md §14.3 · ADR 0012.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedProposition,
  seedTwoCabinets,
  seedUploadBrut,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { validerPropositionAction } = await import(
  "../../../apps/web/app/(app)/app/documents/validation/actions"
);

const sql = createServiceClient();

// Insère une attente avec fréquence/catégorie/libellé maîtrisés (le helper générique
// ne les expose pas). Renvoie l'id.
async function insertAttendu(
  cabinet_id: string,
  client_id: string,
  fields: { type_document: string; frequence: string; categorie?: string | null },
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.document_attendu (id, cabinet_id, client_id, type_document, frequence, categorie)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${fields.type_document},
            ${fields.frequence}::crm.frequence_service, ${fields.categorie ?? null})
  `;
  return id;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("validerPropositionAction — B3 période & document_attendu", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientA2: TestClient;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientA2 = await seedClient(sql, cabinetA.id);
  });

  afterEach(() => {
    authState.user = null;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  async function seedChain(cabinet_id: string, uploaded_par: string) {
    const upload = await seedUploadBrut(sql, cabinet_id, uploaded_par);
    const fichier = await seedFichierPhysique(sql, cabinet_id, upload.id);
    const prop = await seedProposition(sql, cabinet_id, fichier.id);
    return { upload, fichier, prop };
  }

  test("MATCH : attente couverte → recu + lien + événement document_recu", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const attenduId = await insertAttendu(cabinetA.id, clientA.id, {
      type_document: "Relevé bancaire UBS",
      frequence: "mensuelle",
      categorie: "bancaire",
    });
    const { prop } = await seedChain(cabinetA.id, user.id);

    const result = await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: clientA.id,
        type: "releve_bancaire",
        categorie: "bancaire",
        periode: "2026-04",
        libelle: "Relevé UBS avril 2026",
      }),
    );
    expect(result).toEqual({ success: true });

    const [doc] = await sql`
      SELECT id, document_attendu_id, periode FROM doc.document
      WHERE proposition_classement_id = ${prop.id}
    `;
    expect(doc?.document_attendu_id).toBe(attenduId);

    const [att] = await sql`
      SELECT statut_periode_courante, derniere_periode_recue, derniere_reception
      FROM crm.document_attendu WHERE id = ${attenduId}
    `;
    expect(att?.statut_periode_courante).toBe("recu");
    expect(att?.derniere_periode_recue).toBe("2026-04");
    expect(att?.derniere_reception).not.toBeNull();

    const [evt] = await sql`
      SELECT type, client_id, ressource_type, ressource_id, metadata
      FROM crm.evenement
      WHERE ressource_id = ${doc?.id} AND type = 'document_recu'
    `;
    expect(evt?.client_id).toBe(clientA.id);
    expect(evt?.ressource_type).toBe("doc.document");
    expect(evt?.metadata?.document_attendu_id).toBe(attenduId);
    expect(evt?.metadata?.periode).toBe("2026-04");

    await cleanupTestUsers(sql, user);
  });

  test("NO MATCH : fréquence incompatible → doc + événement, attente intacte", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    // Attente annuelle ; le doc est mensuel (2026-04) → pas d'appariement.
    const attenduId = await insertAttendu(cabinetA.id, clientA2.id, {
      type_document: "Déclaration TVA annuelle",
      frequence: "annuelle",
      categorie: "fiscal",
    });
    const { prop } = await seedChain(cabinetA.id, user.id);

    const result = await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: clientA2.id,
        type: "releve_bancaire",
        categorie: "bancaire",
        periode: "2026-04",
        libelle: "Relevé mensuel",
      }),
    );
    expect(result).toEqual({ success: true });

    const [doc] = await sql`
      SELECT id, document_attendu_id FROM doc.document WHERE proposition_classement_id = ${prop.id}
    `;
    expect(doc?.document_attendu_id).toBeNull();

    const [att] = await sql`
      SELECT statut_periode_courante FROM crm.document_attendu WHERE id = ${attenduId}
    `;
    expect(att?.statut_periode_courante).toBeNull(); // intacte

    // L'événement document_recu est tout de même émis (réception classée).
    const [evt] = await sql`
      SELECT metadata FROM crm.evenement
      WHERE ressource_id = ${doc?.id} AND type = 'document_recu'
    `;
    expect(evt?.metadata?.document_attendu_id).toBeNull();

    await cleanupTestUsers(sql, user);
  });

  test("SCOPE : l'attente d'un autre client n'est jamais touchée", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    // Attente du clientA2, compatible (mensuelle/bancaire) — mais le doc est pour clientA.
    const attenduAutreClient = await insertAttendu(cabinetA.id, clientA2.id, {
      type_document: "Relevé bancaire",
      frequence: "mensuelle",
      categorie: "bancaire",
    });
    const { prop } = await seedChain(cabinetA.id, user.id);

    await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: clientA.id,
        type: "releve_bancaire",
        categorie: "bancaire",
        periode: "2026-05",
        libelle: "Relevé mai clientA",
      }),
    );

    const [att] = await sql`
      SELECT statut_periode_courante FROM crm.document_attendu WHERE id = ${attenduAutreClient}
    `;
    expect(att?.statut_periode_courante).toBeNull(); // appartient à clientA2, jamais touchée

    await cleanupTestUsers(sql, user);
  });
});
