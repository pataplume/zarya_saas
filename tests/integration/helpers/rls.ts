/**
 * Helper RLS — simule le contexte JWT d'un tenant authentifié.
 *
 * Utilise `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"`
 * dans une transaction postgres.js pour que la fonction `current_cabinet_id()`
 * de Supabase retourne le bon cabinet_id et que les policies RLS s'appliquent.
 *
 * Référence : /docs/architecture/multi-tenant.md § 5
 */
import postgres from "postgres";
import { resoudreUrlBaseDeTest } from "./base-de-test";

/** Crée un client postgres.js avec le service role (bypass RLS, pour setup/teardown) */
export function createServiceClient(): postgres.Sql {
  // Garde-fou P0-2 : lit EXCLUSIVEMENT TEST_DATABASE_URL (jamais DATABASE_URL) — jette avec
  // la marche à suivre si absente, et refuse toute URL contenant la ref du projet de PROD.
  const url = resoudreUrlBaseDeTest(process.env);
  return postgres(url, {
    // Désactiver le prepare pour les queries dynamiques de test
    prepare: false,
    // Footprint connexions minimal : la base de test est PARTAGÉE et plafonnée à
    // max_connections=60 (~57 utilisables), en concurrence avec le singleton `db`, GoTrue,
    // PostgREST et les déploiements Vercel. Un pool large (défaut 10) par fichier de test
    // sature la base (`53300`). Les tests sont sérialisés (singleFork) → 2 suffisent.
    max: 2,
    idle_timeout: 10,
  });
}

/**
 * Exécute `fn` dans un contexte RLS simulé pour `cabinet_id`.
 *
 * Équivalent à une requête Supabase authentifiée avec ce JWT :
 * `{ sub: "...", app_metadata: { cabinet_id } }`
 *
 * @param sql    - Client service role (postgres.js)
 * @param cabinet_id - UUID du cabinet dont on simule le contexte
 * @param fn     - Fonction à exécuter avec les droits RLS du tenant
 */
export async function queryAsTenant<T>(
  sql: postgres.Sql,
  cabinet_id: string,
  fn: (tsql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tsql) => {
    // 1. Passer au rôle authenticated (celui qu'utilise Supabase PostgREST)
    await tsql`SET LOCAL ROLE authenticated`;

    // 2. Injecter le JWT simulé — current_cabinet_id() lira app_metadata.cabinet_id
    await tsql`
      SELECT set_config(
        'request.jwt.claims',
        ${JSON.stringify({
          sub: cabinet_id,
          app_metadata: { cabinet_id },
        })},
        true
      )
    `;

    return fn(tsql);
  });
}
