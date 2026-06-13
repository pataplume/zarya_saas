/**
 * C1.2 — Isolation du dossier client (/app/clients/[id]).
 *
 * Le `db` applicatif (service role, postgres-js) BYPASSE la RLS (ADR 0005 addendum) :
 * la séparation entre cabinets sur le chemin app repose ENTIÈREMENT sur le filtre
 * (cabinet_id, client_id) discipliné dans `getDossierClient`. Ce test garde ce contrat :
 *
 *  - getDossierClient(cabinetA, clientA) → non-null, agrégats + sections scopés au client A ;
 *  - getDossierClient(cabinetA, clientB) → null (client d'un AUTRE cabinet invisible) ;
 *  - symétrie (cabinetB ne voit pas clientA) + scope croisé interne (factures/échéances/etc.
 *    d'un autre client n'apparaissent jamais dans le dossier de A).
 *
 * Si un helper oubliait un filtre, le test vire au rouge. BLOQUANT en CI.
 *
 * Inspiré de :
 * - tests/integration/server-actions/dashboard-client-data.test.ts
 * - tests/integration/multi-tenant-isolation/client-contact-data-isolation.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getDossierClient,
  getDossierCoordonnees,
  getDossierDocuments,
  getDossierFactures,
  getDossierSalaires,
} from "../../../apps/web/lib/dossier-client-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedContact,
  seedDocument,
  seedEcheance,
  seedFacture,
  seedFichierPhysique,
  seedFournisseur,
  seedPeriode,
  seedPropositionFacture,
  seedService,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let clientB: TestClient;

// Données minimales rattachées au client A (repérées par id pour l'anti-fuite).
let serviceA: { id: string };
let echeanceA: { id: string };
let periodeA: { id: string };
let factureA: { id: string };
// Sections C1.3–C1.5 : documents, factures validées, contacts du client A.
let documentA: { id: string };
let factureValideeA: { id: string };
let contactA: { id: string };

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;

  clientA = await seedClient(sql, cabinetA.id);
  clientB = await seedClient(sql, cabinetB.id);

  // Données distinctes pour le client A (cabinet A).
  serviceA = await seedService(sql, cabinetA.id, clientA.id);
  echeanceA = await seedEcheance(sql, cabinetA.id, clientA.id);
  periodeA = await seedPeriode(sql, cabinetA.id, clientA.id);
  factureA = await seedPropositionFacture(sql, cabinetA.id, clientA.id);

  // C1.3 — un document validé du client A.
  const fichierA = await seedFichierPhysique(sql, cabinetA.id);
  documentA = await seedDocument(sql, cabinetA.id, clientA.id, fichierA.id);

  // C1.4 — une facture validée (avec fournisseur) du client A.
  const fournisseurA = await seedFournisseur(sql, cabinetA.id, clientA.id);
  factureValideeA = await seedFacture(sql, cabinetA.id, clientA.id, fournisseurA.id);

  // C1.5 — un contact du client A.
  contactA = await seedContact(sql, cabinetA.id, clientA.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("getDossierClient — scope (cabinet_id, client_id)", () => {
  test("dossier de A : non-null avec les bonnes données scopées", async () => {
    const d = await getDossierClient(cabinetA.id, clientA.id);
    expect(d).not.toBeNull();
    if (!d) return;

    // Identité scopée au bon client.
    expect(d.identite.id).toBe(clientA.id);
    expect(d.identite.id).not.toBe(clientB.id);

    // Service du client A présent ; aucun service d'un autre client.
    expect(d.services_actifs.some((s) => s.id === serviceA.id)).toBe(true);

    // Échéance ouverte du client A présente.
    expect(d.echeances.some((e) => e.id === echeanceA.id)).toBe(true);

    // Période salaire courante = celle du client A.
    expect(d.periode_salaire_courante?.id).toBe(periodeA.id);

    // Proposition de facture 'a_valider' comptée (≥ 1).
    expect(d.nb_factures_a_valider).toBeGreaterThanOrEqual(1);
  });

  test("sections C1.3–C1.5 du client A : contiennent ses données scopées", async () => {
    const [documents, factures, salaires, coordonnees] = await Promise.all([
      getDossierDocuments(cabinetA.id, clientA.id),
      getDossierFactures(cabinetA.id, clientA.id),
      getDossierSalaires(cabinetA.id, clientA.id),
      getDossierCoordonnees(cabinetA.id, clientA.id),
    ]);

    // Documents : le document validé du client A présent.
    expect(documents.some((doc) => doc.id === documentA.id)).toBe(true);

    // Factures : la facture validée du client A présente, et la proposition à valider.
    expect(factures.validees.some((f) => f.id === factureValideeA.id)).toBe(true);
    expect(factures.a_valider.some((p) => p.id === factureA.id)).toBe(true);

    // Salaires : la période du client A présente.
    expect(salaires.some((p) => p.id === periodeA.id)).toBe(true);

    // Coordonnées : le contact + le service du client A présents.
    expect(coordonnees.contacts.some((c) => c.id === contactA.id)).toBe(true);
    expect(coordonnees.services_actifs.some((s) => s.id === serviceA.id)).toBe(true);
  });

  test("dossier d'un client d'un AUTRE cabinet (clientB) avec le scope de A : null", async () => {
    // Cœur du test : le client B n'appartient pas au cabinet A → invisible (404 indistinct).
    expect(await getDossierClient(cabinetA.id, clientB.id)).toBeNull();
  });

  test("anti-fuite sections : le scope (cabinetB, clientB) ne voit aucune donnée de A", async () => {
    // Le client B (bare) ne possède ni document ni facture ni période ni contact :
    // chaque section doit être vide et NE JAMAIS contenir une donnée du client A.
    const [documents, factures, salaires, coordonnees] = await Promise.all([
      getDossierDocuments(cabinetB.id, clientB.id),
      getDossierFactures(cabinetB.id, clientB.id),
      getDossierSalaires(cabinetB.id, clientB.id),
      getDossierCoordonnees(cabinetB.id, clientB.id),
    ]);

    expect(documents.some((doc) => doc.id === documentA.id)).toBe(false);
    expect(factures.validees.some((f) => f.id === factureValideeA.id)).toBe(false);
    expect(factures.a_valider.some((p) => p.id === factureA.id)).toBe(false);
    expect(salaires.some((p) => p.id === periodeA.id)).toBe(false);
    expect(coordonnees.contacts.some((c) => c.id === contactA.id)).toBe(false);
    expect(coordonnees.services_actifs.some((s) => s.id === serviceA.id)).toBe(false);
  });

  test("anti-fuite sections : scoper sur (cabinetB, clientA) ne renvoie rien de A", async () => {
    // Cross-tenant : le cabinet B tente de lire les sections du client A. Le filtre
    // (cabinet_id, client_id) doit renvoyer des collections vides (clientA ∉ cabinetB).
    const [documents, factures, salaires, coordonnees] = await Promise.all([
      getDossierDocuments(cabinetB.id, clientA.id),
      getDossierFactures(cabinetB.id, clientA.id),
      getDossierSalaires(cabinetB.id, clientA.id),
      getDossierCoordonnees(cabinetB.id, clientA.id),
    ]);

    expect(documents).toHaveLength(0);
    expect(factures.validees).toHaveLength(0);
    expect(factures.a_valider).toHaveLength(0);
    expect(salaires).toHaveLength(0);
    expect(coordonnees.contacts).toHaveLength(0);
    expect(coordonnees.services_actifs).toHaveLength(0);
  });

  test("symétrie : le scope du cabinet B ne résout pas le client A", async () => {
    expect(await getDossierClient(cabinetB.id, clientA.id)).toBeNull();
  });

  test("le client B (bare, cabinet B) est résolu par son propre cabinet, sans données de A", async () => {
    const d = await getDossierClient(cabinetB.id, clientB.id);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.identite.id).toBe(clientB.id);
    // Aucune donnée du client A ne fuit dans le dossier de B.
    expect(d.services_actifs.some((s) => s.id === serviceA.id)).toBe(false);
    expect(d.echeances.some((e) => e.id === echeanceA.id)).toBe(false);
    expect(d.periode_salaire_courante?.id).not.toBe(periodeA.id);
    expect(d.nb_factures_a_valider).toBe(0);
    expect(factureA.id).toBeDefined();
  });
});
