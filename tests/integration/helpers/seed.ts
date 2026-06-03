/**
 * Helpers seed/cleanup pour les tests d'intégration.
 *
 * Toutes les opérations utilisent le service role (bypass RLS).
 * Chaque test crée ses propres UUIDs pour éviter les conflits entre suites.
 * Le cleanup supprime dans l'ordre FK (enfants avant parents).
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

export interface TestInvitation {
  id: string;
  cabinet_id: string;
}

export interface TestZefixRecherche {
  id: string;
  cabinet_id: string;
}

export interface TestClient {
  id: string;
  cabinet_id: string;
}

export interface TestContact {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestAdresse {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestService {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestParamComptable {
  client_id: string;
  cabinet_id: string;
}

export interface TestDocumentAttendu {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestRelation {
  client_id: string;
  cabinet_id: string;
}

export interface TestMandat {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestBanque {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestSalaireConfig {
  client_id: string;
  cabinet_id: string;
}

export interface TestRisque {
  client_id: string;
  cabinet_id: string;
}

export interface TestEvenement {
  id: string;
  cabinet_id: string;
  client_id: string | null;
}

export interface TestNote {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestCabinetIntegration {
  id: string;
  cabinet_id: string;
}

export interface TestFichierPhysique {
  id: string;
  cabinet_id: string;
}

export interface TestUploadBrut {
  id: string;
  cabinet_id: string;
}

export interface TestInvocation {
  id: string;
  cabinet_id: string;
}

export interface TestProposition {
  id: string;
  cabinet_id: string;
  fichier_physique_id: string;
}

export interface TestDocument {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestEcheance {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestRelance {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestTemplateEcheance {
  id: string;
  cabinet_id: string;
}

export interface TestModeleRelance {
  id: string;
  cabinet_id: string;
}

export interface TestCalendarConfig {
  cabinet_id: string;
}

export interface TestPauseClient {
  id: string;
  cabinet_id: string;
  client_id: string;
}

export interface TestCabinet {
  id: string;
  raison_sociale: string;
  membre_id: string;
  user_id: string;
}

/**
 * Crée 2 cabinets de test indépendants avec 1 membre (responsable) chacun.
 * Utilise le service role — bypass RLS — pour écrire en dehors de tout contexte tenant.
 */
export async function seedTwoCabinets(sql: postgres.Sql): Promise<{
  cabinetA: TestCabinet;
  cabinetB: TestCabinet;
}> {
  const idA = randomUUID();
  const idB = randomUUID();

  await sql`
    INSERT INTO crm.cabinet (id, raison_sociale, statut, plan_tarifaire)
    VALUES
      (${idA}, ${`Test Cabinet A — isolation ${idA.slice(0, 8)}`}, 'actif', 'starter'),
      (${idB}, ${`Test Cabinet B — isolation ${idB.slice(0, 8)}`}, 'actif', 'starter')
  `;

  const membreIdA = randomUUID();
  const membreIdB = randomUUID();
  const userIdA = randomUUID();
  const userIdB = randomUUID();

  await sql`
    INSERT INTO crm.cabinet_membre (id, cabinet_id, user_id, role)
    VALUES
      (${membreIdA}, ${idA}, ${userIdA}, 'responsable'),
      (${membreIdB}, ${idB}, ${userIdB}, 'responsable')
  `;

  return {
    cabinetA: {
      id: idA,
      raison_sociale: `Test Cabinet A — isolation ${idA.slice(0, 8)}`,
      membre_id: membreIdA,
      user_id: userIdA,
    },
    cabinetB: {
      id: idB,
      raison_sociale: `Test Cabinet B — isolation ${idB.slice(0, 8)}`,
      membre_id: membreIdB,
      user_id: userIdB,
    },
  };
}

/**
 * Retourne l'id de la session_onboarding_fiduciaire auto-créée pour un cabinet.
 * (Créée par le trigger crm.provision_nouveau_cabinet lors de l'INSERT cabinet.)
 */
export async function getSessionId(sql: postgres.Sql, cabinet_id: string): Promise<string> {
  const [row] = await sql`
    SELECT id FROM crm.session_onboarding_fiduciaire WHERE cabinet_id = ${cabinet_id}
  `;
  if (!row?.id) throw new Error(`Session not found for cabinet ${cabinet_id}`);
  return row.id as string;
}

/**
 * Crée une invitation_membre de test pour un cabinet donné.
 * Utilise le service role (bypass RLS).
 */
export async function seedInvitation(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestInvitation> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.invitation_membre (id, cabinet_id, email, role_propose, token_expire_at)
    VALUES (
      ${id},
      ${cabinet_id},
      ${`test-invite-${id.slice(0, 8)}@zarya-ci.invalid`},
      'collaborateur',
      now() + interval '7 days'
    )
  `;
  return { id, cabinet_id };
}

/**
 * Crée un enregistrement zefix_recherche_cabinet de test pour un cabinet donné.
 * Utilise le service role (bypass RLS).
 */
export async function seedZefixRecherche(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestZefixRecherche> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.zefix_recherche_cabinet (id, cabinet_id, requete, consentement_donne)
    VALUES (${id}, ${cabinet_id}, ${`Test CI ${id.slice(0, 8)}`}, true)
  `;
  return { id, cabinet_id };
}

/** Crée un crm.client de test pour un cabinet donné (service role). */
export async function seedClient(sql: postgres.Sql, cabinet_id: string): Promise<TestClient> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.client (id, cabinet_id, raison_sociale, statut)
    VALUES (${id}, ${cabinet_id}, ${`Test Client ${id.slice(0, 8)} SA`}, 'actif')
  `;
  return { id, cabinet_id };
}

/** Crée un crm.contact de test pour un client donné (service role). */
export async function seedContact(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestContact> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.contact (id, cabinet_id, client_id, nom, role)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${`Contact ${id.slice(0, 8)}`}, 'Comptable')
  `;
  return { id, cabinet_id, client_id };
}

/** Crée une crm.adresse de test pour un client donné (service role). */
export async function seedAdresse(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestAdresse> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.adresse (id, cabinet_id, client_id, type, rue, ville, canton)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'siege', ${`Rue ${id.slice(0, 8)} 1`}, 'Lausanne', 'VD')
  `;
  return { id, cabinet_id, client_id };
}

/** Crée un crm.service de test pour un client donné (service role). */
export async function seedService(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestService> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.service (id, cabinet_id, client_id, type, frequence)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'comptabilite', 'mensuelle')
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée la ligne crm.param_comptable d'un client (1-1, client_id = PK).
 * Idempotent : ON CONFLICT DO NOTHING pour pouvoir re-seeder sans casser.
 */
export async function seedParamComptable(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestParamComptable> {
  await sql`
    INSERT INTO crm.param_comptable (client_id, cabinet_id, logiciel)
    VALUES (${client_id}, ${cabinet_id}, 'bexio')
    ON CONFLICT (client_id) DO NOTHING
  `;
  return { client_id, cabinet_id };
}

/** Crée un crm.document_attendu de test pour un client donné (service role). */
export async function seedDocumentAttendu(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestDocumentAttendu> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.document_attendu (id, cabinet_id, client_id, type_document, frequence)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${`Relevé bancaire ${id.slice(0, 8)}`}, 'mensuelle')
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée la ligne crm.relation d'un client (1-1, client_id = PK).
 * Idempotent : ON CONFLICT DO NOTHING pour pouvoir re-seeder sans casser.
 */
export async function seedRelation(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestRelation> {
  await sql`
    INSERT INTO crm.relation (client_id, cabinet_id, honoraires_modele)
    VALUES (${client_id}, ${cabinet_id}, 'forfait')
    ON CONFLICT (client_id) DO NOTHING
  `;
  return { client_id, cabinet_id };
}

/** Crée un crm.mandat de test pour un client donné (service role). */
export async function seedMandat(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestMandat> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.mandat (id, cabinet_id, client_id, date_signature, date_effet, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, current_date, current_date, 'actif')
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée un crm.banque de test pour un client donné (service role).
 * iban est NOT NULL — valeur factice de test (non un vrai IBAN).
 */
export async function seedBanque(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestBanque> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.banque (id, cabinet_id, client_id, iban, usage)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${`CH00-TEST-${id.slice(0, 8)}`}, 'principal')
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée la ligne crm.salaire_config d'un client (1-1, client_id = PK).
 * Idempotent : ON CONFLICT DO NOTHING pour pouvoir re-seeder sans casser.
 */
export async function seedSalaireConfig(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestSalaireConfig> {
  await sql`
    INSERT INTO crm.salaire_config (client_id, cabinet_id, frequence_paie)
    VALUES (${client_id}, ${cabinet_id}, 'mensuelle')
    ON CONFLICT (client_id) DO NOTHING
  `;
  return { client_id, cabinet_id };
}

/**
 * Crée la ligne crm.risque d'un client (1-1, client_id = PK).
 * Idempotent : ON CONFLICT DO NOTHING pour pouvoir re-seeder sans casser.
 */
export async function seedRisque(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestRisque> {
  await sql`
    INSERT INTO crm.risque (client_id, cabinet_id, niveau)
    VALUES (${client_id}, ${cabinet_id}, 'ok')
    ON CONFLICT (client_id) DO NOTHING
  `;
  return { client_id, cabinet_id };
}

/**
 * Crée un crm.evenement de test (journal). `client_id` optionnel : null pour un
 * événement cabinet-level (pas rattaché à un client).
 */
export async function seedEvenement(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string | null = null,
): Promise<TestEvenement> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.evenement (id, cabinet_id, client_id, type, acteur_type)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'document_recu', 'systeme')
  `;
  return { id, cabinet_id, client_id };
}

/** Crée une crm.note de test pour un client donné (service role). */
export async function seedNote(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestNote> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.note (id, cabinet_id, client_id, contenu)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${`Note test ${id.slice(0, 8)}`})
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée une crm.cabinet_integration de test (Bloc D1). `vault_secret_id` NULL par
 * défaut (état 'en_attente', avant 1er échange OAuth) — suffisant pour les tests
 * d'isolation/anti-fuite qui ne touchent pas au contenu chiffré.
 */
export async function seedCabinetIntegration(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestCabinetIntegration> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.cabinet_integration (id, cabinet_id, provider, statut)
    VALUES (${id}, ${cabinet_id}, 'microsoft_graph', 'en_attente')
  `;
  return { id, cabinet_id };
}

export interface TestEmailSubscription {
  id: string;
  cabinet_id: string;
  subscription_id: string;
}

/** Crée un doc.email_subscription de test (Bloc D4a). */
export async function seedEmailSubscription(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestEmailSubscription> {
  const id = randomUUID();
  const subscription_id = `sub-${id}`;
  await sql`
    INSERT INTO doc.email_subscription
      (id, cabinet_id, subscription_id, resource, client_state_secret, expiration_at)
    VALUES (${id}, ${cabinet_id}, ${subscription_id},
            ${"/me/mailFolders('Inbox')/messages"}, ${"secret-test"}, now() + interval '72 hours')
  `;
  return { id, cabinet_id, subscription_id };
}

export interface TestEmailBrut {
  id: string;
  cabinet_id: string;
  message_id: string;
}

/** Crée un doc.email_brut de test (Bloc D4a). */
export async function seedEmailBrut(sql: postgres.Sql, cabinet_id: string): Promise<TestEmailBrut> {
  const id = randomUUID();
  const message_id = `msg-${id}`;
  await sql`
    INSERT INTO doc.email_brut (id, cabinet_id, message_id, subject, from_address)
    VALUES (${id}, ${cabinet_id}, ${message_id}, 'Sujet test', 'expediteur@example.ch')
  `;
  return { id, cabinet_id, message_id };
}

/** Crée un extraction.invocation de test (mode stub) pour un cabinet donné. */
export async function seedInvocation(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestInvocation> {
  const id = randomUUID();
  await sql`
    INSERT INTO extraction.invocation
      (id, cabinet_id, context, invoked_by_module, input_type, model_used, prompt_version, status)
    VALUES (${id}, ${cabinet_id}, 'classification_doc', 'doc', 'document_id', 'stub', 'stub', 'success')
  `;
  return { id, cabinet_id };
}

/**
 * Crée un doc.upload_brut de test pour un cabinet donné.
 * uploaded_par référence un auth.users (pas de FK) — on passe le user_id du cabinet.
 */
export async function seedUploadBrut(
  sql: postgres.Sql,
  cabinet_id: string,
  uploaded_par: string,
): Promise<TestUploadBrut> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.upload_brut
      (id, cabinet_id, source, uploaded_par, nom_fichier_original,
       taille_octets, type_mime, hash_contenu)
    VALUES (
      ${id}, ${cabinet_id}, 'upload_fiduciaire', ${uploaded_par},
      ${`upload-${id.slice(0, 8)}.pdf`}, 2048, 'application/pdf',
      ${`sha256-upload-${id}`}
    )
  `;
  return { id, cabinet_id };
}

/**
 * Crée un doc.fichier_physique de test pour un cabinet donné (hash unique).
 * `upload_brut_id` optionnel : à lier pour tester la répercussion du statut
 * sur l'inbox (doc.upload_brut) à la validation/rejet.
 */
export async function seedFichierPhysique(
  sql: postgres.Sql,
  cabinet_id: string,
  upload_brut_id?: string,
): Promise<TestFichierPhysique> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.fichier_physique
      (id, cabinet_id, hash_contenu, taille_octets, type_mime, storage_path, source, upload_brut_id)
    VALUES (
      ${id}, ${cabinet_id}, ${`sha256-${id}`}, 1024, 'application/pdf',
      ${`cabinet/${cabinet_id}/${id}.pdf`}, 'upload_fiduciaire', ${upload_brut_id ?? null}
    )
  `;
  return { id, cabinet_id };
}

/** Crée une doc.proposition_classement de test (statut a_valider). */
export async function seedProposition(
  sql: postgres.Sql,
  cabinet_id: string,
  fichier_physique_id: string,
): Promise<TestProposition> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.proposition_classement (id, cabinet_id, fichier_physique_id)
    VALUES (${id}, ${cabinet_id}, ${fichier_physique_id})
  `;
  return { id, cabinet_id, fichier_physique_id };
}

/** Crée un doc.document validé de test (statut_classement manuel). */
export async function seedDocument(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  fichier_physique_id: string,
): Promise<TestDocument> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.document
      (id, cabinet_id, client_id, fichier_physique_id, type, categorie, libelle, statut_classement)
    VALUES (
      ${id}, ${cabinet_id}, ${client_id}, ${fichier_physique_id},
      'releve_bancaire', 'bancaire', ${`Relevé test ${id.slice(0, 8)}`}, 'manuel'
    )
  `;
  return { id, cabinet_id, client_id };
}

// ─── Bloc E1 — facture.* (référentiel + propositions + factures + mapping) ────

export interface TestFournisseur {
  id: string;
  cabinet_id: string;
  client_id: string;
}
export interface TestFactureRow {
  id: string;
  cabinet_id: string;
}

/** Crée un facture.fournisseur de test. */
export async function seedFournisseur(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFournisseur> {
  const id = randomUUID();
  await sql`
    INSERT INTO facture.fournisseur (id, cabinet_id, client_id, raison_sociale)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${`Fournisseur ${id.slice(0, 8)}`})
  `;
  return { id, cabinet_id, client_id };
}

/** Crée une facture.proposition_facture (génère son doc.document + invocation). */
export async function seedPropositionFacture(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFactureRow> {
  const fp = await seedFichierPhysique(sql, cabinet_id);
  const doc = await seedDocument(sql, cabinet_id, client_id, fp.id);
  const inv = await seedInvocation(sql, cabinet_id);
  const id = randomUUID();
  await sql`
    INSERT INTO facture.proposition_facture
      (id, cabinet_id, client_id, document_id, extraction_invocation_id)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${doc.id}, ${inv.id})
  `;
  return { id, cabinet_id };
}

/** Crée une facture.facture (génère son doc.document ; fournisseur fourni). */
export async function seedFacture(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  fournisseur_id: string,
): Promise<TestFactureRow> {
  const fp = await seedFichierPhysique(sql, cabinet_id);
  const doc = await seedDocument(sql, cabinet_id, client_id, fp.id);
  const id = randomUUID();
  await sql`
    INSERT INTO facture.facture
      (id, cabinet_id, client_id, fournisseur_id, document_id, numero_facture, date_emission,
       total_ht, total_tva, total_ttc, montant_a_payer, compte_charge, statut_classement)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${fournisseur_id}, ${doc.id},
            ${`F-${id.slice(0, 8)}`}, CURRENT_DATE, 100, 8.10, 108.10, 108.10, '6000', 'manuel')
  `;
  return { id, cabinet_id };
}

/** Crée un facture.mapping_export (cabinet-global). */
export async function seedMappingExport(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO facture.mapping_export (id, cabinet_id, logiciel_cible, compte_fournisseur_defaut)
    VALUES (${id}, ${cabinet_id}, 'cresus', '2000')
  `;
  return { id, cabinet_id };
}

// ─── Bloc F0 — salaire.* (employe + acces_client) ─────────────────────────────

/** Crée un salaire.employe de test (référentiel, statut propose). */
export async function seedEmploye(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.employe (id, cabinet_id, client_id, prenom, nom)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'Jean', ${`Test ${id.slice(0, 8)}`})
  `;
  return { id, cabinet_id };
}

/** Crée un salaire.acces_client de test (génère son contact). */
export async function seedAccesClient(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFactureRow> {
  const contact = await seedContact(sql, cabinet_id, client_id);
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.acces_client (id, cabinet_id, client_id, contact_id, email)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${contact.id}, ${`rh-${id.slice(0, 8)}@test.ch`})
  `;
  return { id, cabinet_id };
}

// ─── Bloc F6a — salaire.* cluster propositions onboarding ─────────────────────

/** Crée une salaire.session_onboarding (1 par client). */
export async function seedSessionOnboarding(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.session_onboarding (id, cabinet_id, client_id)
    VALUES (${id}, ${cabinet_id}, ${client_id})
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.upload_fichier (génère son doc.document). */
export async function seedUploadFichier(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  session_id: string,
): Promise<TestFactureRow> {
  const fp = await seedFichierPhysique(sql, cabinet_id);
  const doc = await seedDocument(sql, cabinet_id, client_id, fp.id);
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.upload_fichier
      (id, cabinet_id, client_id, session_id, document_id, nom_fichier_original, uploaded_par_type)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${session_id}, ${doc.id},
            ${`employes-${id.slice(0, 8)}.xlsx`}, 'fiduciaire')
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.extraction_ia (passe LLM sur un fichier). */
export async function seedExtractionIa(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  upload_fichier_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.extraction_ia
      (id, cabinet_id, client_id, upload_fichier_id, modele_utilise, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${upload_fichier_id}, 'chat_large', 'succes')
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.proposition_employe (issue d'une extraction). */
export async function seedPropositionEmploye(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  session_id: string,
  extraction_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.proposition_employe
      (id, cabinet_id, client_id, session_id, extraction_id)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${session_id}, ${extraction_id})
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.proposition_champ (1 champ proposé). */
export async function seedPropositionChamp(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  proposition_employe_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.proposition_champ
      (id, cabinet_id, client_id, proposition_employe_id, nom_champ, confiance)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${proposition_employe_id}, 'prenom', 0.95)
  `;
  return { id, cabinet_id };
}

/** Crée une crm.echeance de test pour un client donné (service role). */
export async function seedEcheance(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestEcheance> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.echeance (id, cabinet_id, client_id, type, libelle, date_echeance)
    VALUES (
      ${id}, ${cabinet_id}, ${client_id}, 'tva',
      ${`Échéance test ${id.slice(0, 8)}`}, now() + interval '14 days'
    )
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée une crm.echeance avec contrôle fin des dates et du statut, pour les tests
 * du moteur de transitions (Run 3). Les décalages sont en jours par rapport à
 * current_date. date_alerte vaut NULL si dateAlerteOffsetDays est omis ou null.
 */
export async function seedEcheanceForTransition(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  opts: {
    dateEcheanceOffsetDays: number;
    dateAlerteOffsetDays?: number | null;
    statut?: "a_venir" | "imminente" | "en_retard" | "traitee" | "reportee" | "annulee";
  },
): Promise<TestEcheance> {
  const id = randomUUID();
  const statut = opts.statut ?? "a_venir";
  const alerte = opts.dateAlerteOffsetDays ?? null;
  await sql`
    INSERT INTO crm.echeance
      (id, cabinet_id, client_id, type, libelle, date_echeance, date_alerte, statut)
    VALUES (
      ${id}, ${cabinet_id}, ${client_id}, 'tva',
      ${`Échéance transition ${id.slice(0, 8)}`},
      (current_date + make_interval(days => ${opts.dateEcheanceOffsetDays}))::date,
      CASE WHEN ${alerte}::int IS NULL THEN NULL
           ELSE (current_date + make_interval(days => ${alerte}::int))::date END,
      ${statut}::crm.statut_echeance
    )
  `;
  return { id, cabinet_id, client_id };
}

/** Crée une crm.relance de test liée à une échéance (service role). */
export async function seedRelance(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  echeance_id: string,
): Promise<TestRelance> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.relance (id, cabinet_id, client_id, echeance_id, canal, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${echeance_id}, 'email', 'brouillon')
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Crée un override cabinet de calendar.template_echeance (service role).
 * Le catalogue global (cabinet_id NULL) est seedé par la migration 0006 ;
 * ici on crée une ligne SCOPÉE au cabinet pour les tests d'isolation.
 */
export async function seedTemplateEcheance(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestTemplateEcheance> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.template_echeance
      (id, cabinet_id, nom, type_echeance, frequence, delai_alerte_jours)
    VALUES (
      ${id}, ${cabinet_id}, ${`Override TVA ${id.slice(0, 8)}`}, 'tva', 'trimestrielle', 14
    )
  `;
  return { id, cabinet_id };
}

/** Crée un override cabinet de calendar.modele_relance (service role). */
export async function seedModeleRelance(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestModeleRelance> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.modele_relance
      (id, cabinet_id, type_echeance, langue, nom, objet, corps)
    VALUES (
      ${id}, ${cabinet_id}, 'tva', 'fr',
      ${`Override modèle ${id.slice(0, 8)}`},
      ${"Rappel — {{echeance_libelle}}"}, ${"Bonjour {{client_nom}}, …"}
    )
  `;
  return { id, cabinet_id };
}

/** Crée la ligne calendar.cabinet_config d'un cabinet (service role). */
export async function seedCalendarConfig(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestCalendarConfig> {
  await sql`
    INSERT INTO calendar.cabinet_config (cabinet_id)
    VALUES (${cabinet_id})
    ON CONFLICT (cabinet_id) DO NOTHING
  `;
  return { cabinet_id };
}

/** Crée une calendar.pause_client de test pour un client donné (service role). */
export async function seedPauseClient(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestPauseClient> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.pause_client (id, cabinet_id, client_id, date_debut, date_fin, motif)
    VALUES (
      ${id}, ${cabinet_id}, ${client_id},
      now(), now() + interval '14 days', ${`Pause test ${id.slice(0, 8)}`}
    )
  `;
  return { id, cabinet_id, client_id };
}

/**
 * Supprime toutes les données de test liées aux cabinet_ids fournis.
 * Ordre FK strict : tables enfants avant tables parents.
 */
export async function cleanupCabinets(sql: postgres.Sql, ...ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  // Tables enfants d'abord (contraintes FK sur cabinet_id)
  // Note : sql.array(ids) produit un text[] — cast explicite en uuid[] pour la comparaison
  const arr = sql.array(ids);
  // Bloc H1 (search.* — enfants de doc.document/extraction.invocation ; AVANT eux)
  await sql`DELETE FROM search.document_chunk        WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM search.requete               WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc G1b (salaire.* export/notif — enfants de periode/format_export ; AVANT periode + doc.document)
  await sql`DELETE FROM salaire.piece                WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.notification         WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.relance              WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.export               WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.mapping_export       WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.format_export        WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc G1a (salaire.* cycle — enfants de periode/employe en RESTRICT : AVANT salaire.employe)
  await sql`DELETE FROM salaire.element_paie        WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.absence             WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.changement          WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.validation          WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.evenement           WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.periode             WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.type_element_paie   WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc F6a (salaire.* cluster propositions — ordre FK : champ → employe-prop → extraction →
  // upload → session ; AVANT salaire.employe et doc.document, dont upload_fichier dépend en RESTRICT)
  await sql`DELETE FROM salaire.proposition_champ   WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.proposition_employe WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.extraction_ia       WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.upload_fichier      WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.session_onboarding  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc F0 (salaire.* — enfants de crm.client/contact en RESTRICT : supprimer AVANT crm)
  await sql`DELETE FROM salaire.employe             WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM salaire.acces_client        WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc E1 (facture.* — enfants de doc.document/invocation en RESTRICT : supprimer AVANT doc)
  // Ordre FK interne : facture → proposition_facture (cycle FK posé DB) → fournisseur ; mapping indépendant
  await sql`DELETE FROM facture.facture             WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM facture.proposition_facture WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM facture.fournisseur         WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM facture.mapping_export      WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Module Doc (ordre FK : document → proposition → fichier_physique → upload_brut → invocation)
  await sql`DELETE FROM doc.email_brut              WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM doc.email_subscription      WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM doc.document                WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM doc.proposition_classement  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM doc.fichier_physique        WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM doc.upload_brut             WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM extraction.invocation       WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Module Calendar Run 2 — schéma calendar.* (overrides cabinet seulement ;
  // les catalogues globaux cabinet_id NULL sont des données de seed permanentes).
  await sql`DELETE FROM calendar.pause_client       WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM calendar.cabinet_config     WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM calendar.template_echeance  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM calendar.modele_relance     WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Module Calendar Run 1 (ordre FK : relance → echeance, enfants de crm.client)
  await sql`DELETE FROM crm.relance                 WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.echeance                WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A2 (contact / adresse, enfants de crm.client)
  await sql`DELETE FROM crm.contact                 WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.adresse                 WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A4 (document_attendu, enfant de crm.client ; FK service ON DELETE SET NULL)
  await sql`DELETE FROM crm.document_attendu        WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A5 (relation / mandat, enfants de crm.client ; mandat.document_id SET NULL)
  await sql`DELETE FROM crm.mandat                  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.relation                WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A6 (banque, enfant de crm.client)
  await sql`DELETE FROM crm.banque                  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A7 (salaire_config, enfant de crm.client ; contact_rh_id SET NULL)
  await sql`DELETE FROM crm.salaire_config          WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A8 (risque / evenement / note, enfants de crm.client ; note.auteur_id SET NULL,
  // evenement.client_id NULLABLE)
  await sql`DELETE FROM crm.risque                  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.evenement               WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.note                     WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc A3 (service / param_comptable, enfants de crm.client)
  await sql`DELETE FROM crm.service                 WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.param_comptable         WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.client                  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // Bloc D1 (cabinet_integration, enfant direct de crm.cabinet — pas de client_id)
  await sql`DELETE FROM crm.cabinet_integration    WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // CRM existant
  await sql`DELETE FROM crm.zefix_recherche_cabinet WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.invitation_membre       WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.session_onboarding_fiduciaire WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.cabinet_membre          WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.cabinet                 WHERE id         = ANY(${arr}::uuid[])`;
}

// ─── Bloc G1a — salaire.* cycle mensuel ───────────────────────────────────────

/** Crée un salaire.type_element_paie SCOPÉ cabinet (override du catalogue global). */
export async function seedTypeElementPaie(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.type_element_paie (id, cabinet_id, code, libelle_fr, unite, categorie)
    VALUES (${id}, ${cabinet_id}, ${`PRIME_${id.slice(0, 6)}`}, 'Prime cabinet', 'montant_chf', 'prime')
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.periode de test. */
export async function seedPeriode(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 2026, 5, '2026-05-25')
  `;
  return { id, cabinet_id };
}

/** Crée un salaire.element_paie (type = HEURES_NORMALES global ; employe fourni). */
export async function seedElementPaie(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
  employe_id: string,
): Promise<TestFactureRow> {
  const [type] = await sql`
    SELECT id FROM salaire.type_element_paie WHERE cabinet_id IS NULL AND code = 'HEURES_NORMALES' LIMIT 1`;
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.element_paie
      (id, cabinet_id, client_id, periode_id, employe_id, type_element_id, valeur_numerique, source)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, ${employe_id}, ${type?.id}, 168, 'fiduciaire_saisie')
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.absence (employe fourni). */
export async function seedAbsence(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
  employe_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.absence
      (id, cabinet_id, client_id, periode_id, employe_id, type, date_debut, date_fin, source)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, ${employe_id}, 'maladie',
            '2026-05-04', '2026-05-06', 'client_dashboard')
  `;
  return { id, cabinet_id };
}

/** Crée un salaire.changement. */
export async function seedChangement(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.changement (id, cabinet_id, client_id, periode_id, type, date_effet, source)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, 'changement_salaire', '2026-05-01', 'client_dashboard')
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.validation (1 par période). */
export async function seedValidationPeriode(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.validation
      (id, cabinet_id, client_id, periode_id, valide_par_type, methode)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, 'client', 'dashboard')
  `;
  return { id, cabinet_id };
}

/** Crée un salaire.evenement (journal). */
export async function seedEvenementSalaire(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.evenement (id, cabinet_id, client_id, type, acteur_type)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'periode_creee', 'systeme')
  `;
  return { id, cabinet_id };
}

// ─── Bloc G1b — salaire.* export/notif ────────────────────────────────────────

/** Crée un salaire.format_export SCOPÉ cabinet (override catalogue). */
export async function seedFormatExport(
  sql: postgres.Sql,
  cabinet_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.format_export (id, cabinet_id, code, nom, logiciel_cible, format_fichier)
    VALUES (${id}, ${cabinet_id}, ${`FMT_${id.slice(0, 6)}`}, 'Format cabinet', 'cresus_salaires', 'csv')
  `;
  return { id, cabinet_id };
}

/** Crée un salaire.mapping_export SCOPÉ cabinet (format fourni). */
export async function seedMappingExportSalaire(
  sql: postgres.Sql,
  cabinet_id: string,
  format_export_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.mapping_export (id, cabinet_id, format_export_id, champ_cible)
    VALUES (${id}, ${cabinet_id}, ${format_export_id}, 'BaseSalary')
  `;
  return { id, cabinet_id };
}

/** Crée un salaire.export (periode + format fournis). */
export async function seedExportSalaire(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
  format_export_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.export (id, cabinet_id, client_id, periode_id, format_export_id, genere_par)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, ${format_export_id}, ${randomUUID()})
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.notification (periode fournie). */
export async function seedNotificationSalaire(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.notification (id, cabinet_id, client_id, periode_id, type)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, 'initiale')
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.relance (periode fournie). */
export async function seedRelanceSalaire(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.relance (id, cabinet_id, client_id, periode_id, numero)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, 1)
  `;
  return { id, cabinet_id };
}

/** Crée une salaire.piece (periode fournie ; génère son doc.document). */
export async function seedPiece(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<TestFactureRow> {
  const fp = await seedFichierPhysique(sql, cabinet_id);
  const doc = await seedDocument(sql, cabinet_id, client_id, fp.id);
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.piece (id, cabinet_id, client_id, periode_id, document_id, source)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, ${doc.id}, 'client_dashboard')
  `;
  return { id, cabinet_id };
}

// ─── Bloc H1 — search.* (chunks + historique recherche) ───────────────────────

/** Construit un littéral halfvec à 3584 dim : 1.0 à l'index `dir`, 0 ailleurs. */
function halfvecLiteral(dir: number): string {
  const v = new Array(3584).fill(0);
  v[((dir % 3584) + 3584) % 3584] = 1;
  return `[${v.join(",")}]`;
}

/**
 * Crée un search.document_chunk. `document_id` requis (FK doc.document). `embeddingDir` (optionnel)
 * pose un embedding halfvec unitaire orienté sur cet index (pour les tests cosinus) ; sinon NULL.
 */
export async function seedDocumentChunk(
  sql: postgres.Sql,
  cabinet_id: string,
  client_id: string,
  document_id: string,
  opts: { chunkIndex?: number; embeddingDir?: number; text?: string } = {},
): Promise<TestFactureRow> {
  const id = randomUUID();
  const chunkIndex = opts.chunkIndex ?? 0;
  const text = opts.text ?? `chunk test ${id.slice(0, 8)}`;
  const embedding = opts.embeddingDir === undefined ? null : halfvecLiteral(opts.embeddingDir);
  const model = opts.embeddingDir === undefined ? null : "bge_multilingual_gemma2";
  await sql`
    INSERT INTO search.document_chunk
      (id, cabinet_id, document_id, client_id, chunk_index, text_content, embedding, embedding_model)
    VALUES (
      ${id}, ${cabinet_id}, ${document_id}, ${client_id}, ${chunkIndex}, ${text},
      ${embedding}::halfvec, ${model}
    )
  `;
  return { id, cabinet_id };
}

/** Crée une search.requete (utilisateur_id = auth.users réel requis). */
export async function seedSearchRequete(
  sql: postgres.Sql,
  cabinet_id: string,
  utilisateur_id: string,
): Promise<TestFactureRow> {
  const id = randomUUID();
  await sql`
    INSERT INTO search.requete (id, cabinet_id, utilisateur_id, question)
    VALUES (${id}, ${cabinet_id}, ${utilisateur_id}, ${`question test ${id.slice(0, 8)}`})
  `;
  return { id, cabinet_id };
}
