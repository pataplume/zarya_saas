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
  // Module Doc (ordre FK : document → proposition → fichier_physique → upload_brut → invocation)
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
  await sql`DELETE FROM crm.client                  WHERE cabinet_id = ANY(${arr}::uuid[])`;
  // CRM existant
  await sql`DELETE FROM crm.zefix_recherche_cabinet WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.invitation_membre       WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.session_onboarding_fiduciaire WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.cabinet_membre          WHERE cabinet_id = ANY(${arr}::uuid[])`;
  await sql`DELETE FROM crm.cabinet                 WHERE id         = ANY(${arr}::uuid[])`;
}
