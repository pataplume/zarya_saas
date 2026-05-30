/**
 * B6 — Renommage standardisé à la finalisation.
 *
 * Couvre le chemin RÉEL `finaliserDocument()` contre la base de test : à la finalisation,
 * `doc.document.nom_fichier_standardise` est rempli selon la convention ZARYA imposée
 * (nom logique seul, doc.md §8), de façon déterministe et sans collision (suffixe id court).
 * Le blob physique (`storage_path`) n'est PAS déplacé.
 *
 * Tout est réel (db service-role, triggers, FK) ; aucune I/O réseau.
 *
 * Références : KICKOFF § BLOC B / B6 · doc.md §8 · document-schema.md §7.
 */
import { finaliserDocument } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedProposition,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const sql = createServiceClient();

async function finalise(
  cabinet_id: string,
  client_id: string,
  periode: string | null,
  libelle: string,
): Promise<string> {
  const fichier = await seedFichierPhysique(sql, cabinet_id);
  const prop = await seedProposition(sql, cabinet_id, fichier.id);
  const fin = await finaliserDocument({
    cabinet_id,
    client_id,
    fichier_physique_id: fichier.id,
    proposition_classement_id: prop.id,
    type: "releve_bancaire",
    categorie: "bancaire",
    periode,
    libelle,
    statut_classement: "valide_humain",
    confiance_classement: null,
    acteur_type: "cabinet_membre",
    acteur_id: null,
    cree_par: null,
  });
  return fin.document_id;
}

describe("finaliserDocument — B6 nom standardisé", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("remplit nom_fichier_standardise selon la convention (période mensuelle)", async () => {
    const client = await seedClient(sql, cabinetA.id);
    const docId = await finalise(cabinetA.id, client.id, "2026-04", "UBS Genève");

    const [doc] = await sql`
      SELECT nom_fichier_standardise FROM doc.document WHERE id = ${docId}
    `;
    const nom = doc?.nom_fichier_standardise as string;
    // Le nom court du client est seedé en raison_sociale "Test Client {8hex} SA".
    expect(nom).toMatch(
      /^2026-04_releve-bancaire_test-client-[0-9a-f]{8}-sa_ubs-geneve__[0-9a-f]{6}\.pdf$/,
    );
  });

  test("suffixe id = 6 premiers hex de l'uuid du document (déterministe)", async () => {
    const client = await seedClient(sql, cabinetA.id);
    const docId = await finalise(cabinetA.id, client.id, "2025", "Bilan");

    const [doc] = await sql`
      SELECT nom_fichier_standardise FROM doc.document WHERE id = ${docId}
    `;
    const id6 = docId.replace(/-/g, "").slice(0, 6).toLowerCase();
    expect(doc?.nom_fichier_standardise as string).toContain(`__${id6}.pdf`);
    // Période annuelle → pas de segment mois.
    expect(doc?.nom_fichier_standardise as string).toMatch(/^2025_releve-bancaire_/);
  });

  test("anti-collision : 2 documents mêmes champs → noms standardisés distincts", async () => {
    const client = await seedClient(sql, cabinetA.id);
    const id1 = await finalise(cabinetA.id, client.id, "2026-04", "UBS");
    const id2 = await finalise(cabinetA.id, client.id, "2026-04", "UBS");

    const rows = await sql`
      SELECT id, nom_fichier_standardise FROM doc.document
      WHERE id IN (${id1}, ${id2})
    `;
    expect(rows.length).toBe(2);
    const noms = rows.map((r) => r.nom_fichier_standardise as string);
    expect(noms[0]).not.toBe(noms[1]); // suffixe id court garantit l'unicité
  });

  test("le blob physique n'est pas déplacé (storage_path inchangé)", async () => {
    const client = await seedClient(sql, cabinetA.id);
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const [avant] = await sql`
      SELECT storage_path FROM doc.fichier_physique WHERE id = ${fichier.id}
    `;
    const prop = await seedProposition(sql, cabinetA.id, fichier.id);
    await finaliserDocument({
      cabinet_id: cabinetA.id,
      client_id: client.id,
      fichier_physique_id: fichier.id,
      proposition_classement_id: prop.id,
      type: "releve_bancaire",
      categorie: "bancaire",
      periode: "2026-04",
      libelle: "UBS",
      statut_classement: "valide_humain",
      confiance_classement: null,
      acteur_type: "cabinet_membre",
      acteur_id: null,
      cree_par: null,
    });
    const [apres] = await sql`
      SELECT storage_path FROM doc.fichier_physique WHERE id = ${fichier.id}
    `;
    expect(apres?.storage_path).toBe(avant?.storage_path);
  });
});
