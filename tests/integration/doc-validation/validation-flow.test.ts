/**
 * Tests d'intégration — flux de validation documentaire (Sprint 3.4)
 *
 * Couvre le chemin proposition → validation → entité finale (ADR 0007) :
 * la validation crée doc.document en code applicatif (pas par trigger,
 * extraction-ia.md § 8) et bascule la proposition à 'valide'.
 *
 * Le code de validation réel vit dans une server action Next.js
 * (apps/web/.../validation/actions.ts) liée à l'auth Supabase et non importable
 * ici. Ce test rejoue fidèlement ses écritures DB via le client service role —
 * ce qui reflète l'architecture : le `db` applicatif se connecte en direct
 * (postgres) et contourne la RLS, la sécurité reposant sur le filtre cabinet_id
 * explicite + le trigger de cohérence cabinet/client. On réutilise le vrai
 * helper diffValidation (@zarya/extraction) pour ne pas diverger de l'action.
 *
 * Références :
 * - apps/web/app/(app)/app/documents/validation/actions.ts
 * - packages/db/migrations/0004_doc_module.sql (trigger fn_check_client_cabinet)
 * - tests/CLAUDE.md § 3 « Validation creates final entity »
 */
import { randomUUID } from "node:crypto";
import { type ChampsProposition, diffValidation } from "@zarya/extraction";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

type ChampsProposes = {
  type: string;
  categorie: string;
  periode: string | null;
  libelle: string;
  confiance: string;
};

async function seedProposition(
  sql: postgres.Sql,
  cabinet_id: string,
  fichier_physique_id: string,
  champs: ChampsProposes,
  client_id_propose: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.proposition_classement
      (id, cabinet_id, fichier_physique_id, statut, client_id_propose,
       type_propose, categorie_proposee, periode_proposee, libelle_propose, confiance_globale)
    VALUES (
      ${id}, ${cabinet_id}, ${fichier_physique_id}, 'a_valider', ${client_id_propose},
      ${champs.type}, ${champs.categorie}, ${champs.periode}, ${champs.libelle}, ${champs.confiance}
    )
  `;
  return id;
}

// Rejoue exactement les écritures de validerPropositionAction (mêmes requêtes,
// même helper diffValidation), en service role.
async function validerCommeAction(
  sql: postgres.Sql,
  args: {
    cabinet_id: string;
    user_id: string;
    proposition_id: string;
    retenu: ChampsProposition;
  },
): Promise<{ doc_id: string; statut_classement: string } | null> {
  const [prop] = await sql`
    SELECT id, fichier_physique_id, type_propose, categorie_proposee,
           periode_proposee, libelle_propose, client_id_propose, confiance_globale
    FROM doc.proposition_classement
    WHERE id = ${args.proposition_id}
      AND cabinet_id = ${args.cabinet_id}
      AND statut = 'a_valider'
  `;
  if (!prop) return null;

  const propose: ChampsProposition = {
    client_id: prop.client_id_propose,
    type: prop.type_propose,
    categorie: prop.categorie_proposee,
    periode: prop.periode_proposee,
    libelle: prop.libelle_propose,
  };
  const diff = diffValidation(propose, args.retenu);
  const statut_classement = diff.corrige ? "corrige_humain" : "valide_humain";

  const [doc] = await sql`
    INSERT INTO doc.document
      (cabinet_id, client_id, fichier_physique_id, proposition_classement_id,
       type, categorie, periode, libelle, statut_classement, confiance_classement, cree_par)
    VALUES (
      ${args.cabinet_id}, ${args.retenu.client_id}, ${prop.fichier_physique_id}, ${prop.id},
      ${args.retenu.type}, ${args.retenu.categorie}, ${args.retenu.periode}, ${args.retenu.libelle},
      ${statut_classement}, ${prop.confiance_globale}, ${args.user_id}
    )
    RETURNING id
  `;

  await sql`
    UPDATE doc.proposition_classement
    SET statut = 'valide', valide_par = ${args.user_id}, date_validation = now(),
        document_id = ${doc.id},
        corrections_apportees = ${diff.corrige ? sql.json(diff.corrections) : null}
    WHERE id = ${prop.id}
  `;

  return { doc_id: doc.id as string, statut_classement };
}

describe("Flux de validation — proposition → document", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  const champs: ChampsProposes = {
    type: "facture_fournisseur",
    categorie: "commercial",
    periode: "2026-04",
    libelle: "Facture Swisscom",
    confiance: "0.55",
  };

  test("validation conforme → doc.document créé (valide_humain) + proposition basculée", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    // Le client est déjà proposé : la validation ne change rien → pas de correction.
    const propId = await seedProposition(sql, cabinetA.id, fichier.id, champs, clientA.id);

    const res = await validerCommeAction(sql, {
      cabinet_id: cabinetA.id,
      user_id: cabinetA.user_id,
      proposition_id: propId,
      retenu: {
        client_id: clientA.id,
        type: champs.type,
        categorie: champs.categorie,
        periode: champs.periode,
        libelle: champs.libelle,
      },
    });

    expect(res).not.toBeNull();
    expect(res?.statut_classement).toBe("valide_humain");

    const [doc] = await sql`
      SELECT cabinet_id, client_id, type, categorie, periode, libelle,
             statut_classement, confiance_classement, proposition_classement_id, cree_par
      FROM doc.document WHERE id = ${res?.doc_id}
    `;
    expect(doc?.cabinet_id).toBe(cabinetA.id);
    expect(doc?.client_id).toBe(clientA.id);
    expect(doc?.type).toBe("facture_fournisseur");
    expect(doc?.categorie).toBe("commercial");
    expect(doc?.statut_classement).toBe("valide_humain");
    expect(doc?.proposition_classement_id).toBe(propId);
    expect(doc?.cree_par).toBe(cabinetA.user_id);

    const [prop] = await sql`
      SELECT statut, document_id, valide_par, corrections_apportees
      FROM doc.proposition_classement WHERE id = ${propId}
    `;
    expect(prop?.statut).toBe("valide");
    expect(prop?.document_id).toBe(res?.doc_id);
    expect(prop?.valide_par).toBe(cabinetA.user_id);
    expect(prop?.corrections_apportees).toBeNull();
  });

  test("validation avec correction → statut_classement corrige_humain + corrections journalisées", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const propId = await seedProposition(sql, cabinetA.id, fichier.id, champs);

    const res = await validerCommeAction(sql, {
      cabinet_id: cabinetA.id,
      user_id: cabinetA.user_id,
      proposition_id: propId,
      retenu: {
        client_id: clientA.id,
        type: champs.type,
        categorie: "fiscal", // correction
        periode: champs.periode,
        libelle: champs.libelle,
      },
    });

    expect(res?.statut_classement).toBe("corrige_humain");

    const [prop] = await sql`
      SELECT corrections_apportees FROM doc.proposition_classement WHERE id = ${propId}
    `;
    expect(prop?.corrections_apportees).toMatchObject({
      categorie: { propose: "commercial", retenu: "fiscal" },
    });
  });

  test("le trigger rejette la validation avec un client d'un autre cabinet", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const propId = await seedProposition(sql, cabinetA.id, fichier.id, champs);

    await expect(
      validerCommeAction(sql, {
        cabinet_id: cabinetA.id,
        user_id: cabinetA.user_id,
        proposition_id: propId,
        retenu: {
          client_id: clientB.id, // client du cabinet B
          type: champs.type,
          categorie: champs.categorie,
          periode: champs.periode,
          libelle: champs.libelle,
        },
      }),
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("le filtre de scope empêche de valider la proposition d'un autre cabinet", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const propId = await seedProposition(sql, cabinetA.id, fichier.id, champs);

    // Contexte cabinet B : la proposition (cabinet A) est invisible → introuvable.
    const res = await validerCommeAction(sql, {
      cabinet_id: cabinetB.id,
      user_id: cabinetB.user_id,
      proposition_id: propId,
      retenu: {
        client_id: clientB.id,
        type: champs.type,
        categorie: champs.categorie,
        periode: champs.periode,
        libelle: champs.libelle,
      },
    });
    expect(res).toBeNull();
  });

  test("une proposition déjà validée ne peut pas être re-validée (idempotence)", async () => {
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    const propId = await seedProposition(sql, cabinetA.id, fichier.id, champs);
    const retenu: ChampsProposition = {
      client_id: clientA.id,
      type: champs.type,
      categorie: champs.categorie,
      periode: champs.periode,
      libelle: champs.libelle,
    };

    const first = await validerCommeAction(sql, {
      cabinet_id: cabinetA.id,
      user_id: cabinetA.user_id,
      proposition_id: propId,
      retenu,
    });
    expect(first).not.toBeNull();

    const second = await validerCommeAction(sql, {
      cabinet_id: cabinetA.id,
      user_id: cabinetA.user_id,
      proposition_id: propId,
      retenu,
    });
    expect(second).toBeNull();
  });
});
