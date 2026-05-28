/**
 * Helper auth pour les tests d'intégration — crée de vrais utilisateurs Supabase.
 *
 * RÈGLE (HANDOFF_V2.md § 2.7) : ne JAMAIS créer un user Supabase en SQL brut.
 * GoTrue gère le hash du mot de passe, la table `auth.identities`, etc. Un INSERT
 * direct dans `auth.users` produit un user cassé. On passe donc par l'API admin
 * `supabase.auth.admin.createUser()` (service role).
 *
 * `createTestUser()` crée l'utilisateur ET son `crm.cabinet_membre`, et renseigne
 * `app_metadata.{cabinet_id, role}` (ce que lisent les server actions via le JWT).
 * `cleanupTestUsers()` supprime le membre puis l'utilisateur auth.
 *
 * On importe le wrapper admin via le sous-chemin `@zarya/auth/admin` (aliasé dans
 * vitest.config.ts) pour éviter `@zarya/auth/index`, qui tire `next/headers`.
 */
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@zarya/auth/admin";
import type postgres from "postgres";

export type CabinetRole = "responsable" | "gestionnaire_salaires" | "collaborateur" | "lecteur";

export interface TestUser {
  /** auth.users.id */
  id: string;
  email: string;
  cabinet_id: string;
  role: CabinetRole;
  /** crm.cabinet_membre.id */
  membre_id: string;
  /**
   * Objet minimal compatible avec ce que lisent les server actions
   * (`user.id`, `user.app_metadata.cabinet_id`, `user.app_metadata.role`).
   * Sert à mocker `requireAuth()` / `getCurrentUser()`.
   */
  authUser: { id: string; app_metadata: { cabinet_id: string; role: CabinetRole } };
}

/**
 * Crée un utilisateur Supabase réel, membre du cabinet `cabinet_id` avec le rôle donné.
 * Le cabinet doit déjà exister (cf. `seedTwoCabinets`).
 */
export async function createTestUser(
  sql: postgres.Sql,
  opts: { cabinet_id: string; role?: CabinetRole },
): Promise<TestUser> {
  const role = opts.role ?? "responsable";
  const admin = createSupabaseAdminClient();
  const email = `ci-${randomUUID()}@example.com`;
  // >= 12 caractères (politique mot de passe, packages/auth/CLAUDE.md).
  const password = `Test-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { cabinet_id: opts.cabinet_id, role },
  });
  if (error || !data.user) {
    throw new Error(`[createTestUser] échec création user: ${error?.message ?? "user vide"}`);
  }
  const id = data.user.id;

  const membre_id = randomUUID();
  await sql`
    INSERT INTO crm.cabinet_membre (id, cabinet_id, user_id, role)
    VALUES (${membre_id}, ${opts.cabinet_id}, ${id}, ${role})
  `;

  return {
    id,
    email,
    cabinet_id: opts.cabinet_id,
    role,
    membre_id,
    authUser: { id, app_metadata: { cabinet_id: opts.cabinet_id, role } },
  };
}

/**
 * Supprime les `crm.cabinet_membre` puis les utilisateurs auth associés.
 * À appeler en `afterAll`/`afterEach` avant `cleanupCabinets`.
 */
export async function cleanupTestUsers(sql: postgres.Sql, ...users: TestUser[]): Promise<void> {
  if (users.length === 0) return;
  const admin = createSupabaseAdminClient();
  const ids = users.map((u) => u.id);
  await sql`DELETE FROM crm.cabinet_membre WHERE user_id = ANY(${sql.array(ids)}::uuid[])`;
  for (const u of users) {
    await admin.auth.admin.deleteUser(u.id);
  }
}
