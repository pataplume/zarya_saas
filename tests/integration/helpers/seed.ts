/**
 * Helpers seed/cleanup pour les tests d'intégration.
 *
 * Toutes les opérations utilisent le service role (bypass RLS).
 * Chaque test crée ses propres UUIDs pour éviter les conflits entre suites.
 * Le cleanup supprime dans l'ordre FK (enfants avant parents).
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

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
      (${idA}, ${"Test Cabinet A — isolation " + idA.slice(0, 8)}, 'actif', 'starter'),
      (${idB}, ${"Test Cabinet B — isolation " + idB.slice(0, 8)}, 'actif', 'starter')
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
 * Supprime toutes les données de test liées aux cabinet_ids fournis.
 * Ordre FK strict : tables enfants avant tables parents.
 */
export async function cleanupCabinets(sql: postgres.Sql, ...ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  // Tables enfants d'abord (contraintes FK sur cabinet_id)
  // Note : sql.array(ids) produit un text[] — cast explicite en uuid[] pour la comparaison
  await sql`DELETE FROM crm.zefix_recherche_cabinet WHERE cabinet_id = ANY(${sql.array(ids)}::uuid[])`;
  await sql`DELETE FROM crm.invitation_membre       WHERE cabinet_id = ANY(${sql.array(ids)}::uuid[])`;
  await sql`DELETE FROM crm.session_onboarding_fiduciaire WHERE cabinet_id = ANY(${sql.array(ids)}::uuid[])`;
  await sql`DELETE FROM crm.cabinet_membre          WHERE cabinet_id = ANY(${sql.array(ids)}::uuid[])`;
  await sql`DELETE FROM crm.cabinet                 WHERE id         = ANY(${sql.array(ids)}::uuid[])`;
}
