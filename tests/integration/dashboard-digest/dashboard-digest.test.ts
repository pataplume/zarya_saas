/**
 * Digest « à traiter » du dashboard cabinet (C3.1, getDigestCabinet).
 *
 * On valide via le VRAI helper applicatif (`apps/web/lib/dashboard-data.ts`) qui passe
 * par le `db` service-role (RLS contournée — ADR 0005 addendum). La frontière de
 * sécurité réelle est le filtre `cabinet_id` discipliné dans chaque requête : ce test
 * le prouve en seedant des items « à traiter » pour DEUX cabinets et en vérifiant que
 * le digest de A compte les siens et JAMAIS ceux de B (anti-fuite cross-tenant).
 *
 * getDigestCabinet ne produit que des compteurs (pas de table métier nouvelle) →
 * hors registre METIER_TABLES / anti-fuite générique.
 */
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getDigestCabinet } from "../../../apps/web/lib/dashboard-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEcheance,
  seedEcheanceForTransition,
  seedFichierPhysique,
  seedPeriode,
  seedProposition,
  seedPropositionFacture,
  seedRelance,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("getDigestCabinet — compteurs « à traiter » scopés cabinet (C3.1)", () => {
  const sql: postgres.Sql = createServiceClient();

  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    ({ cabinetA, cabinetB } = await seedTwoCabinets(sql));
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);

    // ── Cabinet A : un item « à traiter » de chaque catégorie ────────────────
    // 1 document à valider (doc.proposition_classement statut a_valider par défaut).
    const fpA = await seedFichierPhysique(sql, cabinetA.id);
    await seedProposition(sql, cabinetA.id, fpA.id);
    // 1 facture à valider (facture.proposition_facture statut a_valider par défaut).
    await seedPropositionFacture(sql, cabinetA.id, clientA.id);
    // 1 échéance en retard + 1 échéance à venir (J+14).
    await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: -5,
      statut: "en_retard",
    });
    const echeanceAVenirA = await seedEcheance(sql, cabinetA.id, clientA.id);
    // 1 relance brouillon liée à l'échéance à venir.
    await seedRelance(sql, cabinetA.id, clientA.id, echeanceAVenirA.id);
    // 1 période salaire (statut non_demandee par défaut → « à traiter »).
    await seedPeriode(sql, cabinetA.id, clientA.id);

    // ── Cabinet B : des items équivalents, pour prouver l'isolation ──────────
    const fpB = await seedFichierPhysique(sql, cabinetB.id);
    await seedProposition(sql, cabinetB.id, fpB.id);
    await seedPropositionFacture(sql, cabinetB.id, clientB.id);
    await seedEcheanceForTransition(sql, cabinetB.id, clientB.id, {
      dateEcheanceOffsetDays: -3,
      statut: "en_retard",
    });
    const echeanceAVenirB = await seedEcheance(sql, cabinetB.id, clientB.id);
    await seedRelance(sql, cabinetB.id, clientB.id, echeanceAVenirB.id);
    await seedPeriode(sql, cabinetB.id, clientB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("compte les items « à traiter » du cabinet A", async () => {
    const digest = await getDigestCabinet(cabinetA.id);

    expect(digest.documents_a_valider).toBeGreaterThanOrEqual(1);
    expect(digest.factures_a_valider).toBeGreaterThanOrEqual(1);
    expect(digest.echeances_en_retard).toBeGreaterThanOrEqual(1);
    expect(digest.echeances_a_venir).toBeGreaterThanOrEqual(1);
    expect(digest.relances_a_valider).toBeGreaterThanOrEqual(1);
    expect(digest.periodes_salaire_a_traiter).toBeGreaterThanOrEqual(1);
  });

  test("anti-fuite : un cabinet vierge n'hérite d'aucun item d'un autre cabinet", async () => {
    // Cabinet C : aucun item seedé → digest entièrement à 0, prouvant qu'aucun item
    // de A ou B ne fuite (le filtre cabinet_id est la seule frontière sur le chemin app).
    // seedTwoCabinets en crée deux : on nettoie les deux à la fin.
    const { cabinetA: cabinetC, cabinetB: cabinetD } = await seedTwoCabinets(sql);
    try {
      const digest = await getDigestCabinet(cabinetC.id);
      expect(digest).toEqual({
        documents_a_valider: 0,
        factures_a_valider: 0,
        echeances_en_retard: 0,
        echeances_a_venir: 0,
        relances_a_valider: 0,
        periodes_salaire_a_traiter: 0,
      });
    } finally {
      await cleanupCabinets(sql, cabinetC.id, cabinetD.id);
    }
  });

  test("anti-fuite : le digest de A est isolé d'un volume connu de B", async () => {
    // On compare les compteurs de A et B : chacun ne voit QUE ses propres items.
    // (Les seeds de A et B sont symétriques sauf le nb d'échéances en retard.)
    const [digestA, digestB] = await Promise.all([
      getDigestCabinet(cabinetA.id),
      getDigestCabinet(cabinetB.id),
    ]);

    // B n'a qu'1 facture à valider : si A fuitait dans B, on en verrait 2.
    expect(digestB.factures_a_valider).toBe(1);
    expect(digestA.factures_a_valider).toBe(1);
    expect(digestB.documents_a_valider).toBe(1);
    expect(digestB.relances_a_valider).toBe(1);
    expect(digestB.periodes_salaire_a_traiter).toBe(1);
  });
});
