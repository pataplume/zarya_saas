/**
 * E5a — Finalisation d'une facture (création entité + fournisseur + IBAN Vault + fraude + doublons).
 *
 * Couvre le chemin RÉEL `finaliserFacture()` contre la base de test :
 *  - création facture.facture + upsert facture.fournisseur depuis une proposition validée ;
 *  - IBAN ANTI-CLAIR (ADR 0013) : l'IBAN n'est stocké QUE comme UUID Vault, jamais en clair ;
 *  - FRAUDE RIB (§5.3) : changement d'IBAN sur fournisseur connu → alerte (anomalie_facture)
 *    non bloquante + iban_change_vs_historique + trace masquée ;
 *  - doublons (§5.4) — probable (même montant + date ±3j) ;
 *  - isolation : un autre cabinet ne peut pas finaliser la proposition.
 *
 * Tout est réel (db service-role, Vault, triggers, FK) ; aucune I/O réseau.
 *
 * Références : KICKOFF § BLOC E / E5a · facture.md §5.3/§5.4/§6 · ADR 0007 · ADR 0013.
 */
import { vaultGetSecret } from "@zarya/db";
import { finaliserFacture } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedPropositionFacture,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

const IBAN_A = "CH9300762011623852957";
const IBAN_B = "CH4431999123000889012";

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;

beforeAll(async () => {
  const s = await seedTwoCabinets(sql);
  cabinetA = s.cabinetA;
  cabinetB = s.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function baseInput(propositionId: string, over: Record<string, unknown> = {}) {
  return {
    cabinet_id: cabinetA.id,
    client_id: clientA.id,
    proposition_id: propositionId,
    fournisseur: { raison_sociale: "Swisscom SA", ide: "CHE-116.281.710", iban: IBAN_A },
    numero_facture: "F-001",
    date_emission: "2026-04-15",
    total_ht: 100,
    total_tva: 8.1,
    total_ttc: 108.1,
    montant_a_payer: 108.1,
    taux_tva_principal: 8.1,
    compte_charge: "6000",
    acteur_id: cabinetA.user_id,
    ...over,
  };
}

describe("E5a — finaliserFacture", () => {
  test("nominal : crée fournisseur + facture ; IBAN en Vault (jamais en clair) ; proposition validee", async () => {
    const prop = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    const r = await finaliserFacture(baseInput(prop.id));

    expect(r.iban_change_detecte).toBe(false);
    expect(r.doublons).toEqual([]);

    const [fact] = await sql`
      SELECT cabinet_id, client_id, fournisseur_id, statut, total_ttc, iban_paiement_vault_id,
             iban_change_vs_historique
        FROM facture.facture WHERE id = ${r.facture_id}
    `;
    expect(fact?.cabinet_id).toBe(cabinetA.id);
    expect(fact?.statut).toBe("validee");
    expect(Number(fact?.total_ttc)).toBe(108.1);
    expect(fact?.iban_change_vs_historique).toBe(false);

    // ANTI-CLAIR : la colonne porte un UUID Vault, pas l'IBAN ; le clair vit dans Vault.
    expect(fact?.iban_paiement_vault_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(fact)).not.toContain(IBAN_A);
    expect(await vaultGetSecret(fact?.iban_paiement_vault_id as string)).toBe(IBAN_A);

    const [four] = await sql`
      SELECT raison_sociale, ide, iban_principal_vault_id
        FROM facture.fournisseur WHERE id = ${r.fournisseur_id}
    `;
    expect(four?.iban_principal_vault_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(four)).not.toContain(IBAN_A);
    expect(await vaultGetSecret(four?.iban_principal_vault_id as string)).toBe(IBAN_A);

    const [p] =
      await sql`SELECT statut, facture_id FROM facture.proposition_facture WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("validee");
    expect(p?.facture_id).toBe(r.facture_id);
  });

  test("fraude RIB : IBAN différent sur fournisseur connu → alerte non bloquante + événement", async () => {
    // 1re facture : crée le fournisseur (IDE partagé) avec IBAN_A.
    const p1 = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    const r1 = await finaliserFacture(
      baseInput(p1.id, {
        fournisseur: { raison_sociale: "Acme SA", ide: "CHE-100.200.301", iban: IBAN_A },
      }),
    );

    // 2e facture : même fournisseur (IDE), IBAN différent → fraude.
    const p2 = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    const r2 = await finaliserFacture(
      baseInput(p2.id, {
        numero_facture: "F-XYZ",
        fournisseur: { raison_sociale: "Acme SA", ide: "CHE-100.200.301", iban: IBAN_B },
      }),
    );

    expect(r2.fournisseur_id).toBe(r1.fournisseur_id); // même fournisseur (match IDE)
    expect(r2.iban_change_detecte).toBe(true);

    const [fact] =
      await sql`SELECT iban_change_vs_historique FROM facture.facture WHERE id = ${r2.facture_id}`;
    expect(fact?.iban_change_vs_historique).toBe(true);

    // Événement d'alerte fraude émis.
    const ev = await sql`
      SELECT type, metadata FROM crm.evenement
       WHERE ressource_id = ${r2.facture_id} AND type = 'anomalie_facture'
    `;
    expect(ev.length).toBe(1);
    expect(ev[0]?.metadata?.anomalie).toBe("iban_change");

    // Trace masquée dans iban_changements (jamais le clair).
    const [four] = await sql`
      SELECT iban_changements, iban_principal_vault_id
        FROM facture.fournisseur WHERE id = ${r2.fournisseur_id}
    `;
    const changements = four?.iban_changements as Array<{
      iban_masque_avant: string;
      iban_masque_apres: string;
    }>;
    expect(changements.length).toBeGreaterThanOrEqual(1);
    expect(changements.at(-1)?.iban_masque_avant).toBe("****2957"); // IBAN_A (avant)
    expect(changements.at(-1)?.iban_masque_apres).toBe("****9012"); // IBAN_B (après)
    expect(JSON.stringify(changements)).not.toContain(IBAN_A);
    expect(JSON.stringify(changements)).not.toContain(IBAN_B);
    // Le Vault porte désormais le NOUVEL IBAN (rotation, même UUID).
    expect(await vaultGetSecret(four?.iban_principal_vault_id as string)).toBe(IBAN_B);
  });

  test("doublon probable : même fournisseur + montant + date ±3j → doublons signalés (non bloquant)", async () => {
    const p1 = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    const r1 = await finaliserFacture(
      baseInput(p1.id, {
        numero_facture: "DUP-1",
        fournisseur: { raison_sociale: "Dup SA", ide: "CHE-112.233.441", iban: IBAN_A },
        date_emission: "2026-05-10",
        total_ht: 250,
        total_tva: 0,
        total_ttc: 250,
        montant_a_payer: 250,
      }),
    );

    const p2 = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    const r2 = await finaliserFacture(
      baseInput(p2.id, {
        numero_facture: "DUP-2", // n° différent → insert OK ; mais montant+date proches
        fournisseur: { raison_sociale: "Dup SA", ide: "CHE-112.233.441", iban: IBAN_A },
        date_emission: "2026-05-12",
        total_ht: 250,
        total_tva: 0,
        total_ttc: 250,
        montant_a_payer: 250,
      }),
    );

    expect(r2.doublons).toContain(r1.facture_id);
  });

  test("isolation : un autre cabinet ne peut pas finaliser la proposition", async () => {
    const prop = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    await expect(finaliserFacture(baseInput(prop.id, { cabinet_id: cabinetB.id }))).rejects.toThrow(
      /introuvable/i,
    );
  });
});
