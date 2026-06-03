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
  absence,
  accesClient,
  adresse,
  and,
  banque,
  cabinet,
  cabinetIntegration,
  cabinetMembre,
  calendarCabinetConfig,
  changement,
  client,
  contact,
  db,
  document,
  documentAttendu,
  echeance,
  elementPaie,
  emailBrut,
  emailSubscription,
  employe,
  eq,
  evenement,
  evenementSalaire,
  extractionIa,
  facture,
  fichierPhysique,
  fournisseur,
  invitationMembre,
  invocation,
  mandat,
  mappingExport,
  modeleRelance,
  note,
  paramComptable,
  pauseClient,
  periode,
  propositionChamp,
  propositionClassement,
  propositionEmploye,
  propositionFacture,
  relance,
  relation,
  risque,
  salaireConfig,
  service,
  sessionOnboarding,
  sessionOnboardingFiduciaire,
  templateEcheance,
  typeElementPaie,
  uploadBrut,
  uploadFichier,
  validationPeriode,
  zefixRechercheCabinet,
} from "@zarya/db";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  getSessionId,
  seedAbsence,
  seedAccesClient,
  seedAdresse,
  seedBanque,
  seedCabinetIntegration,
  seedCalendarConfig,
  seedChangement,
  seedClient,
  seedContact,
  seedDocument,
  seedDocumentAttendu,
  seedEcheance,
  seedElementPaie,
  seedEmailBrut,
  seedEmailSubscription,
  seedEmploye,
  seedEvenement,
  seedEvenementSalaire,
  seedExtractionIa,
  seedFacture,
  seedFichierPhysique,
  seedFournisseur,
  seedInvitation,
  seedInvocation,
  seedMandat,
  seedMappingExport,
  seedModeleRelance,
  seedNote,
  seedParamComptable,
  seedPauseClient,
  seedPeriode,
  seedProposition,
  seedPropositionChamp,
  seedPropositionEmploye,
  seedPropositionFacture,
  seedRelance,
  seedRelation,
  seedRisque,
  seedSalaireConfig,
  seedService,
  seedSessionOnboarding,
  seedTemplateEcheance,
  seedTwoCabinets,
  seedTypeElementPaie,
  seedUploadBrut,
  seedUploadFichier,
  seedValidationPeriode,
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
  {
    name: "doc.email_subscription",
    table: emailSubscription,
    scopeCol: emailSubscription.cabinet_id,
    idCol: emailSubscription.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "doc.email_brut",
    table: emailBrut,
    scopeCol: emailBrut.cabinet_id,
    idCol: emailBrut.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // Bloc E1 — module Facture (facture.*).
  {
    name: "facture.fournisseur",
    table: fournisseur,
    scopeCol: fournisseur.cabinet_id,
    idCol: fournisseur.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "facture.proposition_facture",
    table: propositionFacture,
    scopeCol: propositionFacture.cabinet_id,
    idCol: propositionFacture.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "facture.facture",
    table: facture,
    scopeCol: facture.cabinet_id,
    idCol: facture.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "facture.mapping_export",
    table: mappingExport,
    scopeCol: mappingExport.cabinet_id,
    idCol: mappingExport.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // Bloc F0 — module Salaire (schéma minimal).
  {
    name: "salaire.employe",
    table: employe,
    scopeCol: employe.cabinet_id,
    idCol: employe.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.acces_client",
    table: accesClient,
    scopeCol: accesClient.cabinet_id,
    idCol: accesClient.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // Bloc F6a — cluster propositions onboarding (salaire.*).
  {
    name: "salaire.session_onboarding",
    table: sessionOnboarding,
    scopeCol: sessionOnboarding.cabinet_id,
    idCol: sessionOnboarding.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.upload_fichier",
    table: uploadFichier,
    scopeCol: uploadFichier.cabinet_id,
    idCol: uploadFichier.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.extraction_ia",
    table: extractionIa,
    scopeCol: extractionIa.cabinet_id,
    idCol: extractionIa.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.proposition_employe",
    table: propositionEmploye,
    scopeCol: propositionEmploye.cabinet_id,
    idCol: propositionEmploye.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.proposition_champ",
    table: propositionChamp,
    scopeCol: propositionChamp.cabinet_id,
    idCol: propositionChamp.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  // Bloc G1a — cycle mensuel salaire (salaire.*).
  // type_element_paie = catalogue (global cabinet_id NULL + override cabinet) : on enregistre
  // l'override SCOPÉ cabinet (jamais l'override d'un autre cabinet via un filtre cabinet_id).
  {
    name: "salaire.type_element_paie",
    table: typeElementPaie,
    scopeCol: typeElementPaie.cabinet_id,
    idCol: typeElementPaie.id,
    noopSet: { ordre_affichage: 0 },
  },
  {
    name: "salaire.periode",
    table: periode,
    scopeCol: periode.cabinet_id,
    idCol: periode.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.element_paie",
    table: elementPaie,
    scopeCol: elementPaie.cabinet_id,
    idCol: elementPaie.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.absence",
    table: absence,
    scopeCol: absence.cabinet_id,
    idCol: absence.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.changement",
    table: changement,
    scopeCol: changement.cabinet_id,
    idCol: changement.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.validation",
    table: validationPeriode,
    scopeCol: validationPeriode.cabinet_id,
    idCol: validationPeriode.id,
    noopSet: { cabinet_id: NIL_UUID },
  },
  {
    name: "salaire.evenement",
    table: evenementSalaire,
    scopeCol: evenementSalaire.cabinet_id,
    idCol: evenementSalaire.id,
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
  // Ingestion email Microsoft Graph (D4a).
  ["doc", "email_subscription"],
  ["doc", "email_brut"],
  // Bloc E1 — module Facture.
  ["facture", "fournisseur"],
  ["facture", "proposition_facture"],
  ["facture", "facture"],
  ["facture", "mapping_export"],
  // Bloc F0 — module Salaire.
  ["salaire", "employe"],
  ["salaire", "acces_client"],
  // Bloc F6a — cluster propositions onboarding.
  ["salaire", "session_onboarding"],
  ["salaire", "upload_fichier"],
  ["salaire", "extraction_ia"],
  ["salaire", "proposition_employe"],
  ["salaire", "proposition_champ"],
  // Bloc G1a — cycle mensuel salaire.
  ["salaire", "type_element_paie"],
  ["salaire", "periode"],
  ["salaire", "element_paie"],
  ["salaire", "absence"],
  ["salaire", "changement"],
  ["salaire", "validation"],
  ["salaire", "evenement"],
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
  const [emailSubA, emailSubB] = [
    await seedEmailSubscription(sql, cabinetA.id),
    await seedEmailSubscription(sql, cabinetB.id),
  ];
  const [emailBrutA, emailBrutB] = [
    await seedEmailBrut(sql, cabinetA.id),
    await seedEmailBrut(sql, cabinetB.id),
  ];
  // Bloc E1 — module Facture (ordre FK : fournisseur → facture ; proposition + mapping indépendants).
  const [fournA, fournB] = [
    await seedFournisseur(sql, cabinetA.id, clientA.id),
    await seedFournisseur(sql, cabinetB.id, clientB.id),
  ];
  const [propFactA, propFactB] = [
    await seedPropositionFacture(sql, cabinetA.id, clientA.id),
    await seedPropositionFacture(sql, cabinetB.id, clientB.id),
  ];
  const [factA, factB] = [
    await seedFacture(sql, cabinetA.id, clientA.id, fournA.id),
    await seedFacture(sql, cabinetB.id, clientB.id, fournB.id),
  ];
  const [mapExpA, mapExpB] = [
    await seedMappingExport(sql, cabinetA.id),
    await seedMappingExport(sql, cabinetB.id),
  ];
  // Bloc F0 — module Salaire.
  const [employeA, employeB] = [
    await seedEmploye(sql, cabinetA.id, clientA.id),
    await seedEmploye(sql, cabinetB.id, clientB.id),
  ];
  const [accesA, accesB] = [
    await seedAccesClient(sql, cabinetA.id, clientA.id),
    await seedAccesClient(sql, cabinetB.id, clientB.id),
  ];
  // Bloc F6a — cluster propositions (ordre FK : session → upload → extraction → prop → champ).
  const [sessOnbA, sessOnbB] = [
    await seedSessionOnboarding(sql, cabinetA.id, clientA.id),
    await seedSessionOnboarding(sql, cabinetB.id, clientB.id),
  ];
  const [uplFichA, uplFichB] = [
    await seedUploadFichier(sql, cabinetA.id, clientA.id, sessOnbA.id),
    await seedUploadFichier(sql, cabinetB.id, clientB.id, sessOnbB.id),
  ];
  const [extrA, extrB] = [
    await seedExtractionIa(sql, cabinetA.id, clientA.id, uplFichA.id),
    await seedExtractionIa(sql, cabinetB.id, clientB.id, uplFichB.id),
  ];
  const [propEmpA, propEmpB] = [
    await seedPropositionEmploye(sql, cabinetA.id, clientA.id, sessOnbA.id, extrA.id),
    await seedPropositionEmploye(sql, cabinetB.id, clientB.id, sessOnbB.id, extrB.id),
  ];
  const [propChampA, propChampB] = [
    await seedPropositionChamp(sql, cabinetA.id, clientA.id, propEmpA.id),
    await seedPropositionChamp(sql, cabinetB.id, clientB.id, propEmpB.id),
  ];
  // Bloc G1a — cycle (ordre FK : type_element → periode → element/absence/changement/validation ; evenement libre).
  const [typeElA, typeElB] = [
    await seedTypeElementPaie(sql, cabinetA.id),
    await seedTypeElementPaie(sql, cabinetB.id),
  ];
  const [periodeA, periodeB] = [
    await seedPeriode(sql, cabinetA.id, clientA.id),
    await seedPeriode(sql, cabinetB.id, clientB.id),
  ];
  const [elemA, elemB] = [
    await seedElementPaie(sql, cabinetA.id, clientA.id, periodeA.id, employeA.id),
    await seedElementPaie(sql, cabinetB.id, clientB.id, periodeB.id, employeB.id),
  ];
  const [absA, absB] = [
    await seedAbsence(sql, cabinetA.id, clientA.id, periodeA.id, employeA.id),
    await seedAbsence(sql, cabinetB.id, clientB.id, periodeB.id, employeB.id),
  ];
  const [changeA, changeB] = [
    await seedChangement(sql, cabinetA.id, clientA.id, periodeA.id),
    await seedChangement(sql, cabinetB.id, clientB.id, periodeB.id),
  ];
  const [validA, validB] = [
    await seedValidationPeriode(sql, cabinetA.id, clientA.id, periodeA.id),
    await seedValidationPeriode(sql, cabinetB.id, clientB.id, periodeB.id),
  ];
  const [evtSalA, evtSalB] = [
    await seedEvenementSalaire(sql, cabinetA.id, clientA.id),
    await seedEvenementSalaire(sql, cabinetB.id, clientB.id),
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
    "doc.email_subscription": emailSubA.id,
    "doc.email_brut": emailBrutA.id,
    "facture.fournisseur": fournA.id,
    "facture.proposition_facture": propFactA.id,
    "facture.facture": factA.id,
    "facture.mapping_export": mapExpA.id,
    "salaire.employe": employeA.id,
    "salaire.acces_client": accesA.id,
    "salaire.session_onboarding": sessOnbA.id,
    "salaire.upload_fichier": uplFichA.id,
    "salaire.extraction_ia": extrA.id,
    "salaire.proposition_employe": propEmpA.id,
    "salaire.proposition_champ": propChampA.id,
    "salaire.type_element_paie": typeElA.id,
    "salaire.periode": periodeA.id,
    "salaire.element_paie": elemA.id,
    "salaire.absence": absA.id,
    "salaire.changement": changeA.id,
    "salaire.validation": validA.id,
    "salaire.evenement": evtSalA.id,
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
    "doc.email_subscription": emailSubB.id,
    "doc.email_brut": emailBrutB.id,
    "facture.fournisseur": fournB.id,
    "facture.proposition_facture": propFactB.id,
    "facture.facture": factB.id,
    "facture.mapping_export": mapExpB.id,
    "salaire.employe": employeB.id,
    "salaire.acces_client": accesB.id,
    "salaire.session_onboarding": sessOnbB.id,
    "salaire.upload_fichier": uplFichB.id,
    "salaire.extraction_ia": extrB.id,
    "salaire.proposition_employe": propEmpB.id,
    "salaire.proposition_champ": propChampB.id,
    "salaire.type_element_paie": typeElB.id,
    "salaire.periode": periodeB.id,
    "salaire.element_paie": elemB.id,
    "salaire.absence": absB.id,
    "salaire.changement": changeB.id,
    "salaire.validation": validB.id,
    "salaire.evenement": evtSalB.id,
  });
}, 120_000); // ~150 inserts séquentiels × 2 cabinets sur DB distante : le hookTimeout
// global (30 s) est insuffisant sous la latence réseau CI (≈200 ms/round-trip). Ce seeding
// est le plus lourd de la suite et croît à chaque table métier → timeout dédié généreux.

afterAll(async () => {
  if (cabinetA && cabinetB) await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
}, 60_000);

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
