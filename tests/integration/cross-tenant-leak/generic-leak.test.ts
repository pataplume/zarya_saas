/**
 * Test générique anti-fuite cross-tenant — CHEMIN APPLICATIF (bloquant CI).
 *
 * Contexte (cf. ADR 0005 addendum 28 mai 2026) : le `db` exporté par `@zarya/db`
 * se connecte en service role et CONTOURNE la RLS sur le chemin app. La sécurité
 * multi-tenant repose donc sur le filtre `cabinet_id` discipliné dans chaque query.
 *
 * Ce test vérifie, pour CHAQUE table métier, que le contrat est tenu :
 *   1. un SELECT scopé cabinet A ne retourne jamais une ligne de cabinet B ;
 *   2. un UPDATE scopé cabinet A ciblant une ligne de cabinet B n'affecte rien ;
 *   3. un DELETE scopé cabinet A ciblant une ligne de cabinet B n'affecte rien.
 *
 * Il inclut aussi :
 *   - un test « d'honnêteté du modèle » : un SELECT SANS filtre voit les 2 cabinets
 *     (preuve que la RLS est bien contournée sur le chemin app — ce n'est pas un bug,
 *     c'est l'état documenté Phase 1 → 3) ;
 *   - un test structurel : la RLS reste ACTIVÉE en DB (défense en profondeur).
 *
 * À la création de toute nouvelle table métier : ajouter une entrée dans METIER_TABLES
 * + dans RLS_TABLES. C'est non négociable (cf. ADR 0005 addendum).
 */
import {
  adresse,
  and,
  banque,
  cabinet,
  cabinetIntegration,
  cabinetMembre,
  calendarCabinetConfig,
  client,
  contact,
  db,
  document,
  documentAttendu,
  echeance,
  eq,
  evenement,
  fichierPhysique,
  invitationMembre,
  invocation,
  mandat,
  modeleRelance,
  note,
  paramComptable,
  pauseClient,
  propositionClassement,
  relance,
  relation,
  risque,
  salaireConfig,
  service,
  sessionOnboardingFiduciaire,
  templateEcheance,
  uploadBrut,
  zefixRechercheCabinet,
} from "@zarya/db";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  getSessionId,
  seedAdresse,
  seedBanque,
  seedCabinetIntegration,
  seedCalendarConfig,
  seedClient,
  seedContact,
  seedDocument,
  seedDocumentAttendu,
  seedEcheance,
  seedEvenement,
  seedFichierPhysique,
  seedInvitation,
  seedInvocation,
  seedMandat,
  seedModeleRelance,
  seedNote,
  seedParamComptable,
  seedPauseClient,
  seedProposition,
  seedRelance,
  seedRelation,
  seedRisque,
  seedSalaireConfig,
  seedService,
  seedTemplateEcheance,
  seedTwoCabinets,
  seedUploadBrut,
  seedZefixRecherche,
  type TestCabinet,
} from "../helpers/seed";

// Le SET d'un UPDATE no-op n'est jamais appliqué (0 ligne ne matche le WHERE),
// sa valeur est donc sans importance — on met une valeur sentinelle inoffensive.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

interface MetierTableSpec {
  /** Nom qualifié schema.table — clé de lookup dans idsA / idsB. */
  name: string;
  table: PgTable;
  /** Colonne servant de filtre tenant : `cabinet_id` (ou `id` pour crm.cabinet). */
  scopeCol: PgColumn;
  /** Colonne PK de la ligne. */
  idCol: PgColumn;
  /** SET inoffensif pour le test UPDATE no-op (jamais réellement appliqué). */
  noopSet: Record<string, unknown>;
}

// Registre central : toute table métier DOIT y figurer.
// crm.cabinet est la racine du tenant → son filtre est `id` (pas de `cabinet_id`).
const METIER_TABLES: MetierTableSpec[] = [
  {
    name: "crm.cabinet",
    table: cabinet,
    scopeCol: cabinet.id,
    idCol: cabinet.id,
    noopSet: { raison_sociale: "noop-cross-tenant-guard" },
  },
  {
    name: "crm.cabinet_membre",
    table: cabinetMembre,
    scopeCol: cabinetMembre.cabinet_id,
    idCol: cabinetMembre.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.client",
    table: client,
    scopeCol: client.cabinet_id,
    idCol: client.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.contact",
    table: contact,
    scopeCol: contact.cabinet_id,
    idCol: contact.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.adresse",
    table: adresse,
    scopeCol: adresse.cabinet_id,
    idCol: adresse.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.service",
    table: service,
    scopeCol: service.cabinet_id,
    idCol: service.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // param_comptable est 1-1 avec client → sa PK est client_id (pas d'id propre).
  {
    name: "crm.param_comptable",
    table: paramComptable,
    scopeCol: paramComptable.cabinet_id,
    idCol: paramComptable.client_id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.document_attendu",
    table: documentAttendu,
    scopeCol: documentAttendu.cabinet_id,
    idCol: documentAttendu.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // relation est 1-1 avec client → sa PK est client_id (pas d'id propre).
  {
    name: "crm.relation",
    table: relation,
    scopeCol: relation.cabinet_id,
    idCol: relation.client_id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.mandat",
    table: mandat,
    scopeCol: mandat.cabinet_id,
    idCol: mandat.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.banque",
    table: banque,
    scopeCol: banque.cabinet_id,
    idCol: banque.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // salaire_config est 1-1 avec client → sa PK est client_id (pas d'id propre).
  {
    name: "crm.salaire_config",
    table: salaireConfig,
    scopeCol: salaireConfig.cabinet_id,
    idCol: salaireConfig.client_id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // risque est 1-1 avec client → sa PK est client_id (pas d'id propre).
  {
    name: "crm.risque",
    table: risque,
    scopeCol: risque.cabinet_id,
    idCol: risque.client_id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.evenement",
    table: evenement,
    scopeCol: evenement.cabinet_id,
    idCol: evenement.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.note",
    table: note,
    scopeCol: note.cabinet_id,
    idCol: note.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.cabinet_integration",
    table: cabinetIntegration,
    scopeCol: cabinetIntegration.cabinet_id,
    idCol: cabinetIntegration.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.invitation_membre",
    table: invitationMembre,
    scopeCol: invitationMembre.cabinet_id,
    idCol: invitationMembre.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.zefix_recherche_cabinet",
    table: zefixRechercheCabinet,
    scopeCol: zefixRechercheCabinet.cabinet_id,
    idCol: zefixRechercheCabinet.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.session_onboarding_fiduciaire",
    table: sessionOnboardingFiduciaire,
    scopeCol: sessionOnboardingFiduciaire.cabinet_id,
    idCol: sessionOnboardingFiduciaire.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "extraction.invocation",
    table: invocation,
    scopeCol: invocation.cabinet_id,
    idCol: invocation.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "doc.upload_brut",
    table: uploadBrut,
    scopeCol: uploadBrut.cabinet_id,
    idCol: uploadBrut.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "doc.fichier_physique",
    table: fichierPhysique,
    scopeCol: fichierPhysique.cabinet_id,
    idCol: fichierPhysique.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "doc.proposition_classement",
    table: propositionClassement,
    scopeCol: propositionClassement.cabinet_id,
    idCol: propositionClassement.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "doc.document",
    table: document,
    scopeCol: document.cabinet_id,
    idCol: document.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.echeance",
    table: echeance,
    scopeCol: echeance.cabinet_id,
    idCol: echeance.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "crm.relance",
    table: relance,
    scopeCol: relance.cabinet_id,
    idCol: relance.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // calendar.template_echeance / modele_relance sont des CATALOGUES GLOBAUX
  // (cabinet_id NULL lisible par tous). On enregistre ici l'override SCOPÉ cabinet :
  // un filtre cabinet_id = A ne doit jamais retourner l'override du cabinet B.
  {
    name: "calendar.template_echeance",
    table: templateEcheance,
    scopeCol: templateEcheance.cabinet_id,
    idCol: templateEcheance.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "calendar.modele_relance",
    table: modeleRelance,
    scopeCol: modeleRelance.cabinet_id,
    idCol: modeleRelance.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "calendar.cabinet_config",
    table: calendarCabinetConfig,
    scopeCol: calendarCabinetConfig.cabinet_id,
    idCol: calendarCabinetConfig.cabinet_id,
    noopSet: { delai_alerte_defaut_jours: 0 },
  },
  {
    name: "calendar.pause_client",
    table: pauseClient,
    scopeCol: pauseClient.cabinet_id,
    idCol: pauseClient.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
];

// Tables dont la RLS doit rester ACTIVÉE en DB (défense en profondeur).
// crm.cabinet (racine du tenant) en est exclue volontairement : pas de cabinet_id,
// isolation portée par les policies de crm.cabinet_membre (cf. doc/db CLAUDE.md § 1).
const RLS_TABLES = [
  ["crm", "cabinet_membre"],
  ["crm", "client"],
  ["crm", "contact"],
  ["crm", "adresse"],
  ["crm", "service"],
  ["crm", "param_comptable"],
  ["crm", "document_attendu"],
  ["crm", "relation"],
  ["crm", "mandat"],
  ["crm", "banque"],
  ["crm", "salaire_config"],
  ["crm", "risque"],
  ["crm", "evenement"],
  ["crm", "note"],
  ["crm", "cabinet_integration"],
  ["crm", "invitation_membre"],
  ["crm", "zefix_recherche_cabinet"],
  ["crm", "session_onboarding_fiduciaire"],
  ["extraction", "invocation"],
  ["doc", "upload_brut"],
  ["doc", "fichier_physique"],
  ["doc", "proposition_classement"],
  ["doc", "document"],
  ["crm", "echeance"],
  ["crm", "relance"],
  ["calendar", "template_echeance"],
  ["calendar", "modele_relance"],
  ["calendar", "cabinet_config"],
  ["calendar", "pause_client"],
  // Journal d'audit append-only (D2). Absente de METIER_TABLES : son trigger
  // append-only ferait lever les sous-tests UPDATE/DELETE no-op ; son isolation +
  // append-only sont couverts par multi-tenant-isolation/audit-api-externe.test.ts.
  ["audit", "api_externe"],
] as const;

let sql: postgres.Sql;
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
// Lookup nom de table → id de la ligne semée pour ce cabinet.
const idsA: Record<string, string> = {};
const idsB: Record<string, string> = {};

beforeAll(async () => {
  sql = createServiceClient();

  const seeded = await seedTwoCabinets(sql);
  cabinetA = seeded.cabinetA;
  cabinetB = seeded.cabinetB;

  // Une ligne par table métier, dans les DEUX cabinets, en ordre FK.
  const [clientA, clientB] = [
    await seedClient(sql, cabinetA.id),
    await seedClient(sql, cabinetB.id),
  ];
  const [contactA, contactB] = [
    await seedContact(sql, cabinetA.id, clientA.id),
    await seedContact(sql, cabinetB.id, clientB.id),
  ];
  const [adresseA, adresseB] = [
    await seedAdresse(sql, cabinetA.id, clientA.id),
    await seedAdresse(sql, cabinetB.id, clientB.id),
  ];
  const [serviceA, serviceB] = [
    await seedService(sql, cabinetA.id, clientA.id),
    await seedService(sql, cabinetB.id, clientB.id),
  ];
  const [paramA, paramB] = [
    await seedParamComptable(sql, cabinetA.id, clientA.id),
    await seedParamComptable(sql, cabinetB.id, clientB.id),
  ];
  const [docAttA, docAttB] = [
    await seedDocumentAttendu(sql, cabinetA.id, clientA.id),
    await seedDocumentAttendu(sql, cabinetB.id, clientB.id),
  ];
  const [relationA, relationB] = [
    await seedRelation(sql, cabinetA.id, clientA.id),
    await seedRelation(sql, cabinetB.id, clientB.id),
  ];
  const [mandatA, mandatB] = [
    await seedMandat(sql, cabinetA.id, clientA.id),
    await seedMandat(sql, cabinetB.id, clientB.id),
  ];
  const [banqueA, banqueB] = [
    await seedBanque(sql, cabinetA.id, clientA.id),
    await seedBanque(sql, cabinetB.id, clientB.id),
  ];
  const [salConfA, salConfB] = [
    await seedSalaireConfig(sql, cabinetA.id, clientA.id),
    await seedSalaireConfig(sql, cabinetB.id, clientB.id),
  ];
  const [risqueA, risqueB] = [
    await seedRisque(sql, cabinetA.id, clientA.id),
    await seedRisque(sql, cabinetB.id, clientB.id),
  ];
  const [eventA, eventB] = [
    await seedEvenement(sql, cabinetA.id, clientA.id),
    await seedEvenement(sql, cabinetB.id, clientB.id),
  ];
  const [noteA, noteB] = [
    await seedNote(sql, cabinetA.id, clientA.id),
    await seedNote(sql, cabinetB.id, clientB.id),
  ];
  const [integA, integB] = [
    await seedCabinetIntegration(sql, cabinetA.id),
    await seedCabinetIntegration(sql, cabinetB.id),
  ];
  const [invA, invB] = [
    await seedInvitation(sql, cabinetA.id),
    await seedInvitation(sql, cabinetB.id),
  ];
  const [zA, zB] = [
    await seedZefixRecherche(sql, cabinetA.id),
    await seedZefixRecherche(sql, cabinetB.id),
  ];
  // session_onboarding_fiduciaire : auto-créée par le trigger de provisioning.
  const [sessA, sessB] = [
    await getSessionId(sql, cabinetA.id),
    await getSessionId(sql, cabinetB.id),
  ];
  const [invocA, invocB] = [
    await seedInvocation(sql, cabinetA.id),
    await seedInvocation(sql, cabinetB.id),
  ];
  const [upA, upB] = [
    await seedUploadBrut(sql, cabinetA.id, cabinetA.user_id),
    await seedUploadBrut(sql, cabinetB.id, cabinetB.user_id),
  ];
  const [fpA, fpB] = [
    await seedFichierPhysique(sql, cabinetA.id),
    await seedFichierPhysique(sql, cabinetB.id),
  ];
  const [propA, propB] = [
    await seedProposition(sql, cabinetA.id, fpA.id),
    await seedProposition(sql, cabinetB.id, fpB.id),
  ];
  const [docA, docB] = [
    await seedDocument(sql, cabinetA.id, clientA.id, fpA.id),
    await seedDocument(sql, cabinetB.id, clientB.id, fpB.id),
  ];
  const [echA, echB] = [
    await seedEcheance(sql, cabinetA.id, clientA.id),
    await seedEcheance(sql, cabinetB.id, clientB.id),
  ];
  const [relA, relB] = [
    await seedRelance(sql, cabinetA.id, clientA.id, echA.id),
    await seedRelance(sql, cabinetB.id, clientB.id, echB.id),
  ];
  // Module Calendar Run 2 — overrides cabinet (catalogues globaux ignorés ici).
  const [tplA, tplB] = [
    await seedTemplateEcheance(sql, cabinetA.id),
    await seedTemplateEcheance(sql, cabinetB.id),
  ];
  const [modA, modB] = [
    await seedModeleRelance(sql, cabinetA.id),
    await seedModeleRelance(sql, cabinetB.id),
  ];
  await seedCalendarConfig(sql, cabinetA.id);
  await seedCalendarConfig(sql, cabinetB.id);
  const [pauseA, pauseB] = [
    await seedPauseClient(sql, cabinetA.id, clientA.id),
    await seedPauseClient(sql, cabinetB.id, clientB.id),
  ];

  Object.assign(idsA, {
    "crm.cabinet": cabinetA.id,
    "crm.cabinet_membre": cabinetA.membre_id,
    "crm.client": clientA.id,
    "crm.contact": contactA.id,
    "crm.adresse": adresseA.id,
    "crm.service": serviceA.id,
    "crm.param_comptable": paramA.client_id,
    "crm.document_attendu": docAttA.id,
    "crm.relation": relationA.client_id,
    "crm.mandat": mandatA.id,
    "crm.banque": banqueA.id,
    "crm.salaire_config": salConfA.client_id,
    "crm.risque": risqueA.client_id,
    "crm.evenement": eventA.id,
    "crm.note": noteA.id,
    "crm.cabinet_integration": integA.id,
    "crm.invitation_membre": invA.id,
    "crm.zefix_recherche_cabinet": zA.id,
    "crm.session_onboarding_fiduciaire": sessA,
    "extraction.invocation": invocA.id,
    "doc.upload_brut": upA.id,
    "doc.fichier_physique": fpA.id,
    "doc.proposition_classement": propA.id,
    "doc.document": docA.id,
    "crm.echeance": echA.id,
    "crm.relance": relA.id,
    "calendar.template_echeance": tplA.id,
    "calendar.modele_relance": modA.id,
    "calendar.cabinet_config": cabinetA.id,
    "calendar.pause_client": pauseA.id,
  });
  Object.assign(idsB, {
    "crm.cabinet": cabinetB.id,
    "crm.cabinet_membre": cabinetB.membre_id,
    "crm.client": clientB.id,
    "crm.contact": contactB.id,
    "crm.adresse": adresseB.id,
    "crm.service": serviceB.id,
    "crm.param_comptable": paramB.client_id,
    "crm.document_attendu": docAttB.id,
    "crm.relation": relationB.client_id,
    "crm.mandat": mandatB.id,
    "crm.banque": banqueB.id,
    "crm.salaire_config": salConfB.client_id,
    "crm.risque": risqueB.client_id,
    "crm.evenement": eventB.id,
    "crm.note": noteB.id,
    "crm.cabinet_integration": integB.id,
    "crm.invitation_membre": invB.id,
    "crm.zefix_recherche_cabinet": zB.id,
    "crm.session_onboarding_fiduciaire": sessB,
    "extraction.invocation": invocB.id,
    "doc.upload_brut": upB.id,
    "doc.fichier_physique": fpB.id,
    "doc.proposition_classement": propB.id,
    "doc.document": docB.id,
    "crm.echeance": echB.id,
    "crm.relance": relB.id,
    "calendar.template_echeance": tplB.id,
    "calendar.modele_relance": modB.id,
    "calendar.cabinet_config": cabinetB.id,
    "calendar.pause_client": pauseB.id,
  });
});

afterAll(async () => {
  if (cabinetA && cabinetB) await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("Anti-fuite cross-tenant — chemin applicatif (db service role + filtre cabinet_id)", () => {
  describe.each(METIER_TABLES)("$name", (spec) => {
    test("SELECT scopé cabinet A ne retourne aucune ligne de cabinet B", async () => {
      const rows = await db
        .select({ id: spec.idCol })
        .from(spec.table)
        .where(eq(spec.scopeCol, cabinetA.id));
      const ids = rows.map((r) => r.id as string);
      expect(ids).toContain(idsA[spec.name]);
      expect(ids).not.toContain(idsB[spec.name]);
    });

    test("UPDATE scopé cabinet A ciblant une ligne de cabinet B n'affecte aucune ligne", async () => {
      const affected = await db
        .update(spec.table)
        .set(spec.noopSet)
        .where(and(eq(spec.scopeCol, cabinetA.id), eq(spec.idCol, idsB[spec.name] as string)))
        .returning({ id: spec.idCol });
      expect(affected).toHaveLength(0);
    });

    test("DELETE scopé cabinet A ciblant une ligne de cabinet B n'affecte aucune ligne", async () => {
      const affected = await db
        .delete(spec.table)
        .where(and(eq(spec.scopeCol, cabinetA.id), eq(spec.idCol, idsB[spec.name] as string)))
        .returning({ id: spec.idCol });
      expect(affected).toHaveLength(0);
    });
  });

  test("honnêteté du modèle : un SELECT SANS filtre voit les 2 cabinets (RLS contournée sur le chemin app)", async () => {
    const rows = await db.select({ cabinet_id: client.cabinet_id }).from(client);
    const cabinetIds = rows.map((r) => r.cabinet_id);
    expect(cabinetIds).toContain(cabinetA.id);
    expect(cabinetIds).toContain(cabinetB.id);
  });

  test.each(
    RLS_TABLES,
  )("défense en profondeur : RLS activée en DB sur %s.%s", async (schema, table) => {
    const [row] = await sql`
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${schema} AND c.relname = ${table}
      `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
