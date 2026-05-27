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

/** Crée un client postgres.js avec le service role (bypass RLS, pour setup/teardown) */
export function createServiceClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[tests/helpers/rls] DATABASE_URL env var manquante.\n" +
        "En local : vérifier .env.local\n" +
        "En CI : vérifier les secrets GitHub Actions",
    );
  }
  return postgres(url, {
    // Désactiver le prepare pour les queries dynamiques de test
    prepare: false,
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
          sub: `test-user-${cabinet_id}`,
          app_metadata: { cabinet_id },
        })},
        true
      )
    `;

    return fn(tsql);
  });
}
