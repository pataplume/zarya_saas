/**
 * E3b — Câblage de l'extraction facture (pipeline + hook finaliserDocument).
 *
 * Couvre le chemin RÉEL contre la base de test :
 *  - extraireFactureDepuisDocument crée une facture.proposition_facture + trace une
 *    extraction.invocation (context `facture`) ;
 *  - QR-first : avec un extracteur QR injecté, les données de paiement viennent du QR ;
 *  - ANTI-CLAIR (ADR 0013) : l'IBAN n'est JAMAIS persisté (ni fournisseur_propose_data,
 *    ni qr_facture_data) ;
 *  - le hook dans finaliserDocument déclenche l'extraction pour un doc type `facture_*` ;
 *  - scope cabinet (anti-fuite) : la proposition est rattachée au seul cabinet émetteur.
 *
 * Tout est réel (db service-role, triggers, FK) ; aucune I/O réseau (stub + extracteur QR mocké).
 *
 * Références : KICKOFF § BLOC E / E3b · ADR 0010 · ADR 0013 · ADR 0020 · facture.md §4.
 */
import {
  extraireFactureDepuisDocument,
  finaliserDocument,
  StubFactureExtractor,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedFichierPhysique,
  seedProposition,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

// Payload SPC QRR valide (exemple canonique SIX) : QR-IBAN CH44…889012 + montant 1949.75.
const VALID_QR_PAYLOAD = [
  "SPC",
  "0200",
  "1",
  "CH4431999123000889012",
  "S",
  "Robert Schneider AG",
  "Rue du Lac",
  "1268",
  "2501",
  "Biel",
  "CH",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "1949.75",
  "CHF",
  "S",
  "Pia-Maria Rutschmann-Schnyder",
  "Grosse Marktgasse",
  "28",
  "9400",
  "Rorschach",
  "CH",
  "QRR",
  "210000000003139471430009017",
  "Instruction of 15.09.2019",
  "EPD",
].join("\n");

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
// .env.local porte EXTRACTION_MODE=live ; on force `stub` ici pour que le hook interne
// (getFactureExtractor) soit DÉTERMINISTE (aucun appel réseau Infomaniak). Restauré ensuite.
let prevMode: string | undefined;

beforeAll(async () => {
  prevMode = process.env.EXTRACTION_MODE;
  process.env.EXTRACTION_MODE = "stub";
  const seeded = await seedTwoCabinets(sql);
  cabinetA = seeded.cabinetA;
  cabinetB = seeded.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
  if (prevMode === undefined) delete process.env.EXTRACTION_MODE;
  else process.env.EXTRACTION_MODE = prevMode;
});

describe("E3b — extraireFactureDepuisDocument", () => {
  test("crée une proposition_facture + invocation ; QR-first ; IBAN jamais persisté", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const doc = await seedDocument(sql, cabinetA.id, clientA.id, fichier.id);

    const r = await extraireFactureDepuisDocument(
      {
        cabinet_id: cabinetA.id,
        client_id: clientA.id,
        document_id: doc.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "facture_robert_2026.pdf",
        ocr_text: "Facture Robert Schneider AG",
      },
      // Extracteur stub injecté explicitement (déterministe, aucun réseau).
      new StubFactureExtractor(),
      // Extracteur QR injecté (la couche image réelle est différée) → fournit le payload.
      async () => VALID_QR_PAYLOAD,
    );

    expect(r.qr_detecte).toBe(true);

    const [prop] = await sql`
      SELECT cabinet_id, client_id, document_id, statut, type_propose, devise_proposee,
             montant_a_payer_propose, qr_facture_detecte, fournisseur_propose_data,
             qr_facture_data, extraction_invocation_id
        FROM facture.proposition_facture WHERE id = ${r.proposition_id}
    `;
    expect(prop?.cabinet_id).toBe(cabinetA.id);
    expect(prop?.client_id).toBe(clientA.id);
    expect(prop?.document_id).toBe(doc.id);
    expect(prop?.statut).toBe("a_valider");
    expect(prop?.type_propose).toBe("qr_facture");
    expect(prop?.qr_facture_detecte).toBe(true);
    expect(prop?.devise_proposee).toBe("CHF");
    expect(Number(prop?.montant_a_payer_propose)).toBe(1949.75);

    // ANTI-CLAIR : aucun IBAN dans les jsonb persistés.
    expect("iban" in (prop?.fournisseur_propose_data ?? {})).toBe(false);
    expect("iban" in (prop?.qr_facture_data ?? {})).toBe(false);
    // Données QR non sensibles conservées (référence, montant).
    expect(prop?.qr_facture_data?.reference?.value).toBe("210000000003139471430009017");
    expect(JSON.stringify(prop?.qr_facture_data)).not.toContain("CH4431999123000889012");

    // Invocation tracée (context facture).
    const [inv] = await sql`
      SELECT cabinet_id, context, status, input_document_id
        FROM extraction.invocation WHERE id = ${prop?.extraction_invocation_id}
    `;
    expect(inv?.cabinet_id).toBe(cabinetA.id);
    expect(inv?.context).toBe("facture");
    expect(inv?.status).toBe("success");
    expect(inv?.input_document_id).toBe(doc.id);
  });

  test("sans QR (stub) : proposition créée, qr_facture_detecte=false, pas d'IBAN", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const doc = await seedDocument(sql, cabinetA.id, clientA.id, fichier.id);

    const r = await extraireFactureDepuisDocument({
      cabinet_id: cabinetA.id,
      client_id: clientA.id,
      document_id: doc.id,
      fichier_physique_id: fichier.id,
      nom_fichier: "facture_sans_qr.pdf",
    });

    const [prop] = await sql`
      SELECT qr_facture_detecte, type_propose, qr_facture_data, fournisseur_propose_data
        FROM facture.proposition_facture WHERE id = ${r.proposition_id}
    `;
    expect(prop?.qr_facture_detecte).toBe(false);
    expect(prop?.type_propose).toBe("facture_standard");
    expect(prop?.qr_facture_data).toBeNull();
    expect("iban" in (prop?.fournisseur_propose_data ?? {})).toBe(false);
  });
});

describe("E3b — hook finaliserDocument (type facture_*)", () => {
  test("finaliser un document facture_* déclenche la création d'une proposition_facture", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const prop = await seedProposition(sql, cabinetA.id, fichier.id);

    const fin = await finaliserDocument({
      cabinet_id: cabinetA.id,
      client_id: clientA.id,
      fichier_physique_id: fichier.id,
      proposition_classement_id: prop.id,
      type: "facture_fournisseur",
      categorie: "commercial",
      periode: null,
      libelle: "Facture Acme SA",
      statut_classement: "valide_humain",
      confiance_classement: "0.90",
      acteur_type: "cabinet_membre",
      acteur_id: cabinetA.user_id,
      cree_par: cabinetA.user_id,
    });

    const [propFacture] = await sql`
      SELECT cabinet_id, client_id, document_id, statut
        FROM facture.proposition_facture WHERE document_id = ${fin.document_id}
    `;
    expect(propFacture?.cabinet_id).toBe(cabinetA.id);
    expect(propFacture?.client_id).toBe(clientA.id);
    expect(propFacture?.document_id).toBe(fin.document_id);
    expect(propFacture?.statut).toBe("a_valider");
  });

  test("finaliser un document NON-facture ne crée aucune proposition_facture", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const prop = await seedProposition(sql, cabinetA.id, fichier.id);

    const fin = await finaliserDocument({
      cabinet_id: cabinetA.id,
      client_id: clientA.id,
      fichier_physique_id: fichier.id,
      proposition_classement_id: prop.id,
      type: "releve_bancaire",
      categorie: "bancaire",
      periode: null,
      libelle: "Relevé",
      statut_classement: "valide_humain",
      confiance_classement: "0.90",
      acteur_type: "cabinet_membre",
      acteur_id: cabinetA.user_id,
      cree_par: cabinetA.user_id,
    });

    const rows = await sql`
      SELECT id FROM facture.proposition_facture WHERE document_id = ${fin.document_id}
    `;
    expect(rows).toHaveLength(0);
  });
});
