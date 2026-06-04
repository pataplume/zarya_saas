/**
 * Registre central des colonnes ULTRA-SENSIBLES — source de vérité unique du sceau anti-clair
 * (ADR 0013 + addendum Phase I du 2026-06-04). Analogue à METIER_TABLES pour l'anti-fuite.
 *
 * RÈGLE NON NÉGOCIABLE : toute colonne au nom sensible (IBAN, AVS, token, credential, secret,
 * open_banking, acces_logiciel) DANS une table de base des schémas métier doit être classée ICI
 * (SENSITIVE_COLUMNS) ou dans NON_SENSITIVE_ALLOWLIST. Le test `sensitive-columns.test.ts` échoue
 * sinon (garde-fou de complétude).
 *
 * Mécanismes :
 *  - "vault"         : la donnée est chiffrée via Supabase Vault ; la table ne stocke QUE l'UUID
 *                      d'indirection `*_vault_id` (jamais le clair). C'est l'état cible.
 *  - "clair_differe" : colonne ultra-sensible SANS write-path (contrat de schéma seul, ADR 0013).
 *                      Son 1er write-path devra basculer en "vault" + COMMENT anti-oubli présent.
 *  - "clair_accepte" : matche un motif sensible mais le contenu réel n'est pas une donnée
 *                      ultra-sensible en clair (secret de validation rotatable, token éphémère,
 *                      valeurs masquées). Toléré en clair, avec justification explicite.
 */

export type SensitiveMechanism = "vault" | "clair_differe" | "clair_accepte";

export interface SensitiveColumn {
  schema: string;
  table: string;
  column: string;
  mechanism: SensitiveMechanism;
  /** Pour "vault" : nom(s) de colonne en clair qui NE DOIVENT PAS exister dans la table. */
  forbiddenPlaintextColumns?: string[];
  note: string;
}

export const SENSITIVE_COLUMNS: SensitiveColumn[] = [
  // ── Vault (write-path ouvert, donnée chiffrée, indirection *_vault_id) ───────────────────────
  {
    schema: "crm",
    table: "cabinet_integration",
    column: "vault_secret_id",
    mechanism: "vault",
    forbiddenPlaintextColumns: ["access_token", "refresh_token", "token", "credentials"],
    note: "Tokens OAuth Microsoft (D1, ADR 0013 addendum D1). Secret JSON dans Vault ; seul l'UUID ici.",
  },
  {
    schema: "facture",
    table: "fournisseur",
    column: "iban_principal_vault_id",
    mechanism: "vault",
    forbiddenPlaintextColumns: ["iban", "iban_principal"],
    note: "IBAN fournisseur (E5a, migration 0030). Vault ; iban_changements ne stocke que des masques.",
  },
  {
    schema: "facture",
    table: "facture",
    column: "iban_paiement_vault_id",
    mechanism: "vault",
    forbiddenPlaintextColumns: ["iban", "iban_paiement"],
    note: "IBAN de paiement (E5a, migration 0030). Vault.",
  },
  {
    schema: "salaire",
    table: "employe",
    column: "numero_avs_vault_id",
    mechanism: "vault",
    forbiddenPlaintextColumns: ["numero_avs", "avs"],
    note: "Numéro AVS employé (F6, ADR 0021, migration 0031). Vault ; valeur masquée côté proposition.",
  },
  {
    schema: "salaire",
    table: "employe",
    column: "iban_vault_id",
    mechanism: "vault",
    forbiddenPlaintextColumns: ["iban"],
    note: "IBAN versement salaire (F6, ADR 0021, migration 0031). Vault.",
  },

  // ── Clair différé (aucun write-path ; ADR 0013, basculera en Vault à son 1er write-path) ─────
  {
    schema: "crm",
    table: "banque",
    column: "iban",
    mechanism: "clair_differe",
    note: "IBAN client (A6, migration 0014). Aucun write-path ; COMMENT anti-oubli requis.",
  },
  {
    schema: "crm",
    table: "banque",
    column: "credentials_open_banking",
    mechanism: "clair_differe",
    note: "Secrets Open Banking (A6, migration 0014). Aucun write-path ; COMMENT anti-oubli requis.",
  },
  {
    schema: "crm",
    table: "relation",
    column: "iban_facturation",
    mechanism: "clair_differe",
    note: "IBAN de facturation (A5, migration 0013 ; COMMENT ajouté en 0042). Aucun write-path.",
  },
  {
    schema: "crm",
    table: "param_comptable",
    column: "acces_logiciel_externe",
    mechanism: "clair_differe",
    note: "Credentials logiciel comptable (A3, migration 0011 ; COMMENT ajouté en 0042). Aucun write-path.",
  },

  // ── Clair accepté (matche un motif sensible, mais pas une donnée ultra-sensible en clair) ────
  {
    schema: "doc",
    table: "email_subscription",
    column: "client_state_secret",
    mechanism: "clair_accepte",
    note: "Nonce de validation des webhooks Microsoft Graph (D4a) : secret par-souscription, rotatable, pas de PII. Toléré en clair (validation côté serveur, RLS).",
  },
  {
    schema: "salaire",
    table: "acces_client",
    column: "token_activation",
    mechanism: "clair_accepte",
    note: "Token d'activation onboarding client : éphémère (token_activation_expire_le), usage unique. Toléré en clair au MVP ; hashage = amélioration future possible.",
  },
  {
    schema: "crm",
    table: "invitation_membre",
    column: "token",
    mechanism: "clair_accepte",
    note: "Token d'invitation membre (uuid aléatoire + token_expire_at). Toléré en clair (uuid non devinable, expiry).",
  },
  {
    schema: "facture",
    table: "fournisseur",
    column: "iban_changements",
    mechanism: "clair_accepte",
    note: "Historique des changements d'IBAN : ne stocke QUE des IBAN masqués (CH..****XXXX) + date + acteur, jamais le clair (finalize-facture.ts).",
  },
];

/**
 * Colonnes qui matchent un motif sensible mais ne sont PAS des secrets : références publiques,
 * compteurs, timestamps, indicateurs booléens. Documentées pour que le test de complétude
 * n'échoue pas dessus (et que tout ajout sensible reste visible).
 */
export const NON_SENSITIVE_ALLOWLIST: {
  schema: string;
  table: string;
  column: string;
  note: string;
}[] = [
  {
    schema: "crm",
    table: "salaire_config",
    column: "caisse_avs",
    note: "Numéro de caisse de compensation AVS (référence PUBLIQUE, pas le numéro AVS personnel).",
  },
  {
    schema: "crm",
    table: "invitation_membre",
    column: "token_expire_at",
    note: "Timestamp d'expiration (pas un secret).",
  },
  {
    schema: "salaire",
    table: "acces_client",
    column: "token_activation_expire_le",
    note: "Timestamp d'expiration (pas un secret).",
  },
  {
    schema: "extraction",
    table: "invocation",
    column: "tokens_input",
    note: "Compteur de tokens LLM (facturation), pas un secret.",
  },
  {
    schema: "extraction",
    table: "invocation",
    column: "tokens_output",
    note: "Compteur de tokens LLM (facturation), pas un secret.",
  },
  {
    schema: "salaire",
    table: "extraction_ia",
    column: "tokens_input",
    note: "Compteur de tokens LLM, pas un secret.",
  },
  {
    schema: "salaire",
    table: "extraction_ia",
    column: "tokens_output",
    note: "Compteur de tokens LLM, pas un secret.",
  },
  {
    schema: "facture",
    table: "facture",
    column: "iban_change_vs_historique",
    note: "Indicateur booléen de changement d'IBAN (pas une valeur d'IBAN).",
  },
];

/** Motifs SQL ILIKE identifiant un nom de colonne potentiellement sensible. */
export const SENSITIVE_NAME_PATTERNS = [
  "%iban%",
  "%avs%",
  "%token%",
  "%credential%",
  "%secret%",
  "%open_banking%",
  "%acces_logiciel%",
  "%password%",
  "%mot_de_passe%",
];
