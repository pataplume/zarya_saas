/**
 * Lot 3 (ADR 0024 §6) — 2e passe IA CIBLÉE du pipeline facture.
 *
 * Couvre le chemin RÉEL contre la base de test : extraireFactureDepuisDocument reçoit un
 * extracteur LIVE factice (mode "live", aucun réseau) qui :
 *  - au 1er appel (sans `champs_a_completer`) laisse des champs MANQUANTS / douteux ;
 *  - au 2e appel (quand `champs_a_completer` est fourni) les COMPLÈTE.
 *
 * On vérifie alors que :
 *  - la proposition_facture finale a les champs comblés (fusion adoptée) ;
 *  - DEUX invocations sont tracées pour le document (passe 1 + passe 2), la 2e portant le
 *    marqueur { passe: 2 } dans raw_output ;
 *  - GATED LIVE : un extracteur STUB ne déclenche JAMAIS de 2e passe (1 seule invocation).
 *
 * Tout est réel (db service-role, triggers, FK) ; aucune I/O réseau (extracteur injecté).
 *
 * Références : KICKOFF § BLOC E · ADR 0010 · ADR 0024 §6 · facture.md §4.
 */
import {
  extraireFactureDepuisDocument,
  type FactureExtractionInput,
  type FactureExtractionResult,
  type FactureExtractor,
  type FactureProposal,
  StubFactureExtractor,
} from "@zarya/extraction";
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

/** Proposition de base sans QR (l'IA porte tout) — usine pour les deux passes factices. */
function baseProposal(over: Partial<FactureProposal> = {}): FactureProposal {
  return {
    fournisseur: {
      raison_sociale: "Robert Schneider AG",
      ide: "CHE-123.456.789",
      numero_tva: null,
      iban: null,
      bic: null,
      adresse: null,
    },
    numero_facture: null,
    date_emission: "2026-01-15",
    date_echeance: "2026-02-15",
    reference: null,
    devise: "CHF",
    total_ht: 1000,
    total_tva: 81,
    total_ttc: 1081,
    montant_a_payer: 1081,
    taux_tva_principal: 8.1,
    categorie_comptable: "services",
    qr_facture_detecte: false,
    qr_facture_data: null,
    confiance_globale: 0.7,
    confiance_par_champ: {
      fournisseur: { source: "ia", confiance: 0.9 },
      montants: { source: "ia", confiance: 0.9 },
    },
    anomalies: [],
    ...over,
  };
}

function result(proposal: FactureProposal): FactureExtractionResult {
  return {
    proposal,
    model_used: "fake-chat-large",
    prompt_version: "ik-facture-v1",
    duration_ms: 5,
    raw_output: { fake: true },
  };
}

/**
 * Extracteur LIVE factice : passe 1 laisse numero_facture null ; passe 2 (déclenchée par la
 * présence de `champs_a_completer`) le comble avec une bonne confiance.
 */
class FakeLiveExtractor implements FactureExtractor {
  readonly mode = "live" as const;
  public calls: Array<string[] | undefined> = [];

  async extract(input: FactureExtractionInput): Promise<FactureExtractionResult> {
    this.calls.push(input.champs_a_completer);
    const focus = input.champs_a_completer ?? [];
    if (focus.length > 0) {
      // Passe 2 ciblée : on comble numero_facture.
      return result(
        baseProposal({
          numero_facture: "F-2026-0042",
          confiance_par_champ: {
            fournisseur: { source: "ia", confiance: 0.95 },
            montants: { source: "ia", confiance: 0.9 },
          },
        }),
      );
    }
    // Passe 1 : numero_facture manquant.
    return result(baseProposal({ numero_facture: null }));
  }
}

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;

beforeAll(async () => {
  const seeded = await seedTwoCabinets(sql);
  cabinetA = seeded.cabinetA;
  cabinetB = seeded.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("Lot 3 — 2e passe IA ciblée (pipeline live simulé)", () => {
  test("la passe 2 comble le champ manquant + 2 invocations tracées", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const doc = await seedDocument(sql, cabinetA.id, clientA.id, fichier.id);
    const extractor = new FakeLiveExtractor();

    const r = await extraireFactureDepuisDocument(
      {
        cabinet_id: cabinetA.id,
        client_id: clientA.id,
        document_id: doc.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "facture_robert_2026.pdf",
        ocr_text: "Facture Robert Schneider AG",
      },
      extractor,
    );

    // L'extracteur a bien été appelé 2 fois : passe 1 (sans focus) puis passe 2 (avec focus).
    expect(extractor.calls).toHaveLength(2);
    expect(extractor.calls[0]).toBeUndefined();
    expect(extractor.calls[1]).toContain("numero_facture");

    // Proposition finale : champ comblé par la passe 2.
    const [prop] = await sql`
      SELECT numero_facture_propose, statut, cabinet_id, client_id
        FROM facture.proposition_facture WHERE id = ${r.proposition_id}
    `;
    expect(prop?.cabinet_id).toBe(cabinetA.id);
    expect(prop?.client_id).toBe(clientA.id);
    expect(prop?.statut).toBe("a_valider");
    expect(prop?.numero_facture_propose).toBe("F-2026-0042");

    // DEUX invocations tracées pour ce document (passe 1 + passe 2), toutes context facture.
    const invs = await sql`
      SELECT raw_output, status, context
        FROM extraction.invocation
       WHERE input_document_id = ${doc.id} AND cabinet_id = ${cabinetA.id}
    `;
    expect(invs).toHaveLength(2);
    for (const inv of invs) {
      expect(inv.context).toBe("facture");
      expect(inv.status).toBe("success");
    }
    // La 2e invocation porte le marqueur passe:2 + la liste des champs ciblés (tie-safe : on
    // l'identifie par son contenu, pas par l'ordre).
    const passe2 = invs.find((inv) => inv.raw_output?.passe === 2);
    expect(passe2).toBeDefined();
    expect(passe2?.raw_output?.champs).toContain("numero_facture");
  });

  test("GATED LIVE : un extracteur stub ne déclenche aucune 2e passe", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const doc = await seedDocument(sql, cabinetA.id, clientA.id, fichier.id);

    const r = await extraireFactureDepuisDocument(
      {
        cabinet_id: cabinetA.id,
        client_id: clientA.id,
        document_id: doc.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "facture_sans_qr.pdf",
      },
      // Stub : mode "stub" → jamais de 2e passe, même si des champs manquent.
      new StubFactureExtractor(),
    );

    expect(r.proposition_id).toBeTruthy();
    const invs = await sql`
      SELECT id FROM extraction.invocation
       WHERE input_document_id = ${doc.id} AND cabinet_id = ${cabinetA.id}
    `;
    expect(invs).toHaveLength(1);
  });
});
