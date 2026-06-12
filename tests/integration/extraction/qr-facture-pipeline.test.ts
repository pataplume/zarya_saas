/**
 * Lot 1 — pipeline facture alimenté par le QR-bill lu depuis l'image (decode-qr.ts).
 *
 * Couvre le chemin RÉEL contre la base de test : extraireFactureDepuisDocument reçoit un
 * `qrExtract` injecté qui rend un payload SPC valide connu (simulant la lecture image), et :
 *  - la proposition_facture créée a qr_facture_detecte=true ;
 *  - les champs déterministes NON sensibles viennent du QR (montant, devise, référence) ;
 *  - ANTI-CLAIR (ADR 0013) : aucun IBAN en clair dans la ligne (ni fournisseur_propose_data,
 *    ni qr_facture_data, ni le JSON sérialisé complet).
 *
 * Le décodeur image lui-même (octets → payload) est couvert par le test UNIT decode-qr.test.ts.
 * Ici on valide le CÂBLAGE du payload jusqu'à la persistance, sans I/O réseau (stub + QR injecté).
 *
 * Références : KICKOFF § BLOC E (QR-bill scan) · ADR 0013 · ADR 0020 · facture.md §4.4.
 */
import { extraireFactureDepuisDocument, StubFactureExtractor } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedFichierPhysique,
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

const QR_IBAN = "CH4431999123000889012";

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
// .env.local porte EXTRACTION_MODE=live ; on force `stub` pour un hook interne DÉTERMINISTE.
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

describe("Lot 1 — QR lu depuis l'image alimente proposition_facture", () => {
  test("qr_facture_detecte=true + montant/référence du QR ; aucun IBAN en clair", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const doc = await seedDocument(sql, cabinetA.id, clientA.id, fichier.id);

    const r = await extraireFactureDepuisDocument(
      {
        cabinet_id: cabinetA.id,
        client_id: clientA.id,
        document_id: doc.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "facture_qr_scan.pdf",
        type_mime: "application/pdf",
      },
      // Stub déterministe (aucun réseau).
      new StubFactureExtractor(),
      // Simule la lecture image : rend le payload SPC valide (le décodeur octets→payload est
      // testé séparément en unit). Le pipeline parse/valide puis fusionne QR-first.
      async () => VALID_QR_PAYLOAD,
    );

    expect(r.qr_detecte).toBe(true);

    const [prop] = await sql`
      SELECT cabinet_id, client_id, statut, type_propose, devise_proposee,
             montant_a_payer_propose, qr_facture_detecte, fournisseur_propose_data,
             qr_facture_data
        FROM facture.proposition_facture WHERE id = ${r.proposition_id}
    `;

    // Scope cabinet (anti-fuite) + statut attendu.
    expect(prop?.cabinet_id).toBe(cabinetA.id);
    expect(prop?.client_id).toBe(clientA.id);
    expect(prop?.statut).toBe("a_valider");

    // Champs déterministes NON sensibles issus du QR.
    expect(prop?.qr_facture_detecte).toBe(true);
    expect(prop?.type_propose).toBe("qr_facture");
    expect(prop?.devise_proposee).toBe("CHF");
    expect(Number(prop?.montant_a_payer_propose)).toBe(1949.75);
    expect(prop?.qr_facture_data?.reference?.value).toBe("210000000003139471430009017");

    // ANTI-CLAIR (ADR 0013) : l'IBAN du QR n'est JAMAIS persisté en clair.
    expect("iban" in (prop?.fournisseur_propose_data ?? {})).toBe(false);
    expect("iban" in (prop?.qr_facture_data ?? {})).toBe(false);
    expect(JSON.stringify(prop)).not.toContain(QR_IBAN);
  });
});
