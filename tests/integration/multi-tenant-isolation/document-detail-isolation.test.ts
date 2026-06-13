/**
 * C2.3 — Isolation de la fiche document (/app/documents/[id]).
 *
 * Le `db` applicatif (service role, postgres-js) BYPASSE la RLS (ADR 0005 addendum) :
 * la séparation entre cabinets sur le chemin app repose ENTIÈREMENT sur le filtre
 * (cabinet_id, document_id) discipliné dans `getDocumentDetail`. Ce test garde ce contrat :
 *
 *  - getDocumentDetail(cabinetA, docA) → non-null, avec les champs extraits de la
 *    proposition de facture liée ;
 *  - le payload sérialisé NE contient JAMAIS d'IBAN en clair (Vault) ;
 *  - getDocumentDetail(cabinetB, docA) → null (document d'un AUTRE cabinet invisible,
 *    404 indistinct).
 *
 * Si un filtre était oublié, le test vire au rouge. BLOQUANT en CI.
 *
 * Inspiré de : tests/integration/multi-tenant-isolation/dossier-client-isolation.test.ts.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getDocumentDetail } from "../../../apps/web/lib/document-detail-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedInvocation,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;

// Document facture du client A + sa proposition_facture (avec champs extraits).
let documentA: { id: string };
const IBAN_TEMOIN = "CH9300762011623852957"; // IBAN factice — NE doit jamais sortir.
const FOURNISSEUR_NOM = "Garage Helvétia SA";
const NUMERO_FACTURE = "F-2026-0042";

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;

  clientA = await seedClient(sql, cabinetA.id);

  // doc.document de type facture pour le client A.
  const fichierA = await seedFichierPhysique(sql, cabinetA.id);
  const docId = randomUUID();
  await sql`
    INSERT INTO doc.document
      (id, cabinet_id, client_id, fichier_physique_id, type, categorie, libelle, statut_classement, periode)
    VALUES (
      ${docId}, ${cabinetA.id}, ${clientA.id}, ${fichierA.id},
      'facture', 'commercial', ${`Facture ${FOURNISSEUR_NOM}`}, 'valide_humain', '2026-05'
    )
  `;
  documentA = { id: docId };

  // proposition_facture liée (input via document_id = document.id). On y place un
  // fournisseur proposé + montants + provenance par champ + une anomalie + un IBAN
  // TÉMOIN dans qr_facture_data : on vérifie qu'il ne fuit JAMAIS dans le détail.
  const inv = await seedInvocation(sql, cabinetA.id);
  const propId = randomUUID();
  await sql`
    INSERT INTO facture.proposition_facture
      (id, cabinet_id, client_id, document_id, extraction_invocation_id, statut,
       fournisseur_propose_data, numero_facture_propose, date_emission_proposee,
       total_ht_propose, total_tva_propose, total_ttc_propose, montant_a_payer_propose,
       devise_proposee, qr_facture_detecte, qr_facture_data, confiance_globale,
       confiance_par_champ, anomalies_detectees)
    VALUES (
      ${propId}, ${cabinetA.id}, ${clientA.id}, ${documentA.id}, ${inv.id}, 'a_valider',
      ${sql.json({ raison_sociale: FOURNISSEUR_NOM, iban: IBAN_TEMOIN })},
      ${NUMERO_FACTURE}, '2026-05-12',
      100.00, 8.10, 108.10, 108.10,
      'CHF', true, ${sql.json({ iban: IBAN_TEMOIN })}, 0.92,
      ${sql.json({ fournisseur: { source: "ia", confiance: 0.9 }, montants: { source: "qr", confiance: 1 } })},
      ${sql.array(["montant_eleve"])}
    )
  `;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("getDocumentDetail — scope (cabinet_id, document_id)", () => {
  test("détail de docA (cabinet A) : non-null avec les champs extraits", async () => {
    const detail = await getDocumentDetail(cabinetA.id, documentA.id);
    expect(detail).not.toBeNull();
    if (!detail) return;

    // Méta du document scopée au bon client/cabinet.
    expect(detail.document.id).toBe(documentA.id);
    expect(detail.document.client_id).toBe(clientA.id);
    expect(detail.document.type).toBe("facture");

    // Extraction facture présente avec ses champs.
    expect(detail.extraction_facture).not.toBeNull();
    expect(detail.extraction_facture?.fournisseur_nom).toBe(FOURNISSEUR_NOM);
    expect(detail.extraction_facture?.numero_facture).toBe(NUMERO_FACTURE);
    expect(detail.extraction_facture?.total_ttc).toBe("108.10");
    expect(detail.extraction_facture?.devise).toBe("CHF");
    expect(detail.extraction_facture?.anomalies).toContain("montant_eleve");
    // Provenance par champ (jsonb brut) transmise pour normalisation côté UI.
    expect(detail.extraction_facture?.confiance_par_champ).toBeTruthy();

    // Pas de facture finale (non validée) ni d'échéance (pas de document_attendu_id).
    expect(detail.facture_finale).toBeNull();
    expect(detail.echeance_couverte).toBeNull();
  });

  test("anti-IBAN : le payload sérialisé ne contient AUCUN IBAN en clair", async () => {
    const detail = await getDocumentDetail(cabinetA.id, documentA.id);
    const serialise = JSON.stringify(detail);
    // L'IBAN témoin (présent dans fournisseur_propose_data + qr_facture_data en base)
    // ne doit jamais être projeté par le helper (Vault, ADR 0013).
    expect(serialise).not.toContain(IBAN_TEMOIN);
    expect(serialise.toLowerCase()).not.toContain("iban");
  });

  test("cross-tenant : le détail de docA est invisible pour le cabinet B (null)", async () => {
    expect(await getDocumentDetail(cabinetB.id, documentA.id)).toBeNull();
  });

  test("document inexistant : null (404 indistinct)", async () => {
    expect(await getDocumentDetail(cabinetA.id, randomUUID())).toBeNull();
  });
});
