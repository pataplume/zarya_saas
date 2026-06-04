---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [crm-schema, security-and-audit]
---

# ADR 0013 — Chiffrement des colonnes ultra-sensibles : différé au write-path, mécanisme à trancher

## Statut
Acceptée — 30 mai 2026. Prise pendant la construction de la fondation CRM v1.0
(séquence canonique ADR 0012), au moment où les premières colonnes ultra-sensibles
apparaissent dans le schéma (Blocs A3, A5, A6) sans qu'aucun chemin d'écriture
n'existe encore.

## Contexte

La fondation CRM v1.0 pose le **contrat de schéma complet** avant de construire les
modules (ADR 0012). Plusieurs colonnes ultra-sensibles au sens du CLAUDE.md §2
(« champs ultra-sensibles chiffrés via Supabase Vault : IBAN, numéro AVS, tokens
OAuth, credentials ») sont donc créées **en tant que tables de contrat**, alors
qu'aucune feature ne les peuple encore :

| Colonne | Migration / Bloc | Nature |
|---|---|---|
| `crm.param_comptable.acces_logiciel_externe` (jsonb) | 0011 / A3 | credentials logiciel comptable client |
| `crm.relation.iban_facturation` (text) | 0013 / A5 | IBAN de facturation |
| `crm.banque.iban` (text NOT NULL) | 0014 / A6 | IBAN du client |
| `crm.banque.credentials_open_banking` (jsonb) | 0014 / A6 | secrets Open Banking (futur) |

Deux faits de cadrage :

1. **Aucun chemin d'écriture n'existe** vers ces colonnes (ni server action, ni
   route, ni pipeline). Il n'y a donc rien à chiffrer aujourd'hui, et aucune donnée
   en clair n'est exposée : le risque est strictement futur.
2. **Le mécanisme de chiffrement n'est pas tranché.** Le CLAUDE.md mentionne
   « Supabase Vault », mais Vault (`vault.secrets`) est conçu pour des **secrets de
   configuration** (peu nombreux, peu cardinaux), pas pour du **chiffrement par ligne**
   d'une colonne métier à forte cardinalité. Les options réelles sont :
   - **Supabase Vault** — simple, mais inadapté au per-row métier (1 secret/ligne).
   - **pgsodium TCE** (Transparent Column Encryption) — chiffrement transparent en
     base, mais en dépréciation côté Supabase.
   - **AEAD applicatif** (chiffrement côté app avec une clé gérée par l'app, ex.
     `libsodium`/`crypto.subtle`) — déchiffrement maîtrisé côté serveur, le mieux
     aligné avec « secrets côté serveur uniquement » (CLAUDE.md §7).

   Choisir maintenant, sans le write-path ni le read-path réel, serait un choix
   d'architecture **prématuré** qu'on devrait probablement défaire.

## Décision

1. **Le chiffrement au repos de ces colonnes est DIFFÉRÉ** jusqu'à la feature qui
   ouvre le premier chemin d'écriture vers chacune. L'enforcement du chiffrement est
   porté par cette feature, **pas** par le run de schéma qui crée la colonne.

2. **Le mécanisme reste ouvert** entre Vault, pgsodium TCE et AEAD applicatif. Il sera
   tranché dans un addendum à cette ADR (ou une ADR dédiée) **au plus tard** au premier
   write-path, après spike sur la cardinalité réelle et le pattern de lecture. Le défaut
   pressenti — non engageant — est l'**AEAD applicatif** (aligné CLAUDE.md §7
   « secrets côté serveur uniquement »).

3. **Garde-fous anti-oubli** (le risque de cette décision, c'est d'oublier) :
   - `COMMENT ON COLUMN` posé en base sur chaque colonne concernée, rappelant
     l'exigence « chiffrer au repos avant écriture (ADR 0013) » (fait pour
     `crm.banque.iban` et `crm.banque.credentials_open_banking` en 0014 ; à étendre
     rétroactivement à `param_comptable.acces_logiciel_externe` et
     `relation.iban_facturation` lors de leur premier write-path).
   - Commentaire ⚠️ SÉCURITÉ dans `crm.ts` au-dessus de chaque table concernée.
   - Une **tâche bloquante** suivie : aucun chemin d'écriture vers ces colonnes ne peut
     merger sans le chiffrement câblé + un test prouvant qu'aucune écriture en clair
     n'est possible.

## Conséquences

### Positives
- Pas de choix d'architecture prématuré : on tranche le mécanisme avec le write-path
  et le read-path réels sous les yeux.
- La fondation de schéma reste posée d'un bloc (ADR 0012) sans attendre la couche crypto.
- Zéro donnée en clair exposée aujourd'hui (aucune écriture possible).

### Négatives
- Dette explicite : tant que le write-path n'existe pas, la colonne est « nue » au sens
  schéma. Risque mitigé par les garde-fous anti-oubli ci-dessus.
- L'exigence est répartie sur plusieurs features futures (une par colonne) plutôt que
  centralisée une fois.

## Alternatives écartées

- **Câbler Vault maintenant (option b évaluée)** : rejetée. N'évite aucun retravail
  (pas de consommateur d'écriture à protéger), force un choix de mécanisme prématuré,
  et Vault est probablement le mauvais outil pour du per-row métier.
- **Rendre les colonnes nullable / les retirer du contrat** : rejetée. Casse l'objectif
  ADR 0012 (schéma complet et stable posé une fois). `crm.banque.iban` est même NOT NULL
  par le modèle métier.

## Conditions de révision
- Premier write-path vers l'une de ces colonnes → trancher le mécanisme (addendum) et
  câbler le chiffrement + test anti-clair **avant merge**.
- Ajout de toute nouvelle colonne ultra-sensible → l'inscrire dans le tableau ci-dessus
  + `COMMENT ON COLUMN` + commentaire `crm.ts`.

## Références
- `CLAUDE.md` §2 (sécurité) et §7 (secrets côté serveur uniquement)
- `docs/architecture/security-and-audit.md`
- `docs/data-model/crm-schema.md` §8 (relation), §11 (param_comptable), §12 (banque)
- ADR 0005 (multi-tenant), ADR 0012 (séquence canonique v1.0)

---

## Addendum (2026-05-30) — Mécanisme tranché pour les tokens OAuth Microsoft (1er write-path, Bloc D1)

### Déclencheur
Le **Bloc D1** (OAuth Microsoft Graph, ADR 0016) ouvre le **premier chemin d'écriture réel**
vers une donnée ultra-sensible : les tokens OAuth (`access_token`, `refresh_token`) du cabinet,
écrits dans la **nouvelle** table `crm.cabinet_integration`. La *Condition de révision* de cette
ADR (« premier write-path → trancher le mécanisme + câbler le chiffrement + test anti-clair
**avant merge** ») est donc déclenchée. Décision prise avec le founder (arbitrage explicite).

### Décision
1. **Mécanisme pour les tokens d'intégration = Supabase Vault** (`vault.create_secret` /
   `vault.update_secret` / vue `vault.decrypted_secrets` — extension `supabase_vault` 0.3.1,
   vérifiée présente sur l'instance partagée). Justifié par la **faible cardinalité** :
   `crm.cabinet_integration` porte **une ligne par cabinet** (~100 cabinets max, ADR 0004) —
   exactement le cas d'usage de Vault (« secrets peu nombreux, peu cardinaux »). L'objection
   cardinalité de cette ADR (§Contexte fait 2) **ne s'applique pas** à ce cas.

2. **Portée stricte.** Ce choix vaut **uniquement** pour les tokens d'intégration tierce
   (low cardinality, 1/cabinet). Il **ne pré-décide PAS** le mécanisme des colonnes métier à
   **forte** cardinalité (`crm.banque.iban` 1/compte, `crm.param_comptable.acces_logiciel_externe`
   1/client, `crm.relation.iban_facturation`) : celles-ci restent **ouvertes** (pressenti AEAD
   applicatif) et seront tranchées à **leur** premier write-path (Blocs E/F/G).

3. **Modèle de stockage (jamais de token en clair).** `crm.cabinet_integration` ne contient
   **aucune** colonne de token en clair. Le secret (JSON `{access_token, refresh_token, …}`) est
   créé via `vault.create_secret()` ; seul son `uuid` (`vault_secret_id`) est gardé dans la ligne.
   Lecture via `vault.decrypted_secrets` (service role serveur **uniquement**). Rotation au refresh
   via `vault.update_secret()`. Les données **non** sensibles (tenant_id, UPN, région tenant,
   `expires_at`, `scope`, statut) vivent en `parametres jsonb` en clair.

4. **Garde-fous (bloquants CI).** (a) test anti-clair prouvant que la ligne ne stocke aucun token
   en clair (pas de colonne credentials ; seul `vault_secret_id` présent) et que `decrypted_secrets`
   restitue bien le token ; (b) `pino redact` sur `*_token` dans tous les logs ; (c) secrets Azure
   (`client_secret`) en env serveur, jamais committés ni exposés client ; (d) `COMMENT ON COLUMN`
   rappelant l'exigence sur `vault_secret_id`.

### Cohérence avec le placement « Phase I » du chiffrement
Le founder avait placé l'enforcement chiffrement en **Phase I** (après H) pour les colonnes
IBAN/AVS **sans write-path**. Cet addendum **avance l'enforcement pour les tokens uniquement**,
ce qui est **exactement** ce que cette ADR prévoyait : « l'enforcement est porté par la feature
qui ouvre le premier chemin d'écriture, pas par le run de schéma ». Le write-path tokens existe
maintenant (D1) ⇒ on chiffre maintenant. Aucune contradiction ; les colonnes IBAN/AVS (toujours
sans write-path) restent en Phase I.

---

## Addendum (2026-06-04) — Phase I : Vault confirmé pour tous les write-paths ouverts + sceau anti-clair (registre + test CI systématique)

### Déclencheur
La **Phase I** (placée après le Bloc H, désormais complet) arrive. Arbitrage founder explicite
(04/06) : option **« audit + sceau léger »** — formaliser et verrouiller l'existant plutôt que
construire une nouvelle brique crypto. Justifié par le constat ci-dessous.

### Constat (audit 04/06)
Depuis l'addendum D1 (qui laissait les colonnes métier IBAN/AVS « ouvertes, pressenti AEAD »),
**deux write-paths supplémentaires se sont ouverts, et tous deux ont choisi Supabase Vault** :

| Colonne (indirection) | Donnée protégée | Bloc | Décision / réf |
|---|---|---|---|
| `crm.cabinet_integration.vault_secret_id` (uuid) | tokens OAuth Microsoft | D1 | addendum D1 ci-dessus |
| `facture.fournisseur.iban_principal_vault_id` (uuid) | IBAN fournisseur | E5a | migration 0030 |
| `facture.facture.iban_paiement_vault_id` (uuid) | IBAN de paiement | E5a | migration 0030 |
| `salaire.employe.numero_avs_vault_id` (uuid) | numéro AVS employé | F6 | **ADR 0021** + migration 0031 |
| `salaire.employe.iban_vault_id` (uuid) | IBAN versement salaire | F6 | **ADR 0021** + migration 0031 |

Le mécanisme « ouvert / pressenti AEAD » est donc **de facto Vault partout où un write-path existe**.
Le pattern est uniforme : la donnée en clair n'est **jamais** stockée ; seul l'UUID du secret Vault
(`*_vault_id`) vit dans la table ; lecture via `vault.decrypted_secrets` (service role serveur).

Restent **quatre** colonnes ultra-sensibles **sans aucun write-path** (contrat de schéma seul) :
`crm.banque.iban`, `crm.banque.credentials_open_banking`, `crm.relation.iban_facturation`,
`crm.param_comptable.acces_logiciel_externe`.

### Décision
1. **Vault est acté comme mécanisme retenu** pour toute colonne ultra-sensible **dès qu'un
   write-path s'ouvre** — il remplace l'AEAD applicatif comme **défaut**. Raison : cohérence D1/E/F,
   indirection `*_vault_id` éprouvée, et la cardinalité réelle reste maîtrisable (un secret par
   entité, créé à la finalisation). L'AEAD applicatif n'est **pas** abandonné comme option : il
   reste réouvrable **par exception explicite** si une colonne future présente une cardinalité ou
   un pattern de lecture qui contre-indique Vault (à acter alors dans un nouvel addendum).
2. **Les 4 colonnes sans write-path restent différées** (inchangé), mais leur 1er write-path
   **devra** : (a) passer par Vault (indirection `*_vault_id`), (b) être inscrit au registre
   `SENSITIVE_COLUMNS`, (c) être couvert par le test anti-clair systématique. Leur `COMMENT ON
   COLUMN` anti-oubli est désormais **uniforme** sur les 4 (migration 0042 complète les 2 manquants
   — `acces_logiciel_externe`, `iban_facturation` — prévu par le § Garde-fous de cette ADR).
3. **Sceau anti-clair durci (anti-oubli centralisé).** Remplacement des garde-fous épars par **une
   source de vérité unique** : le registre `tests/integration/anti-plaintext/sensitive-columns.ts`
   (`SENSITIVE_COLUMNS` + `NON_SENSITIVE_ALLOWLIST`) et un **test CI bloquant**
   `sensitive-columns.test.ts` qui :
   - **(complétude)** scanne `information_schema` (tables de base des schémas métier) pour toute
     colonne au nom sensible (`%iban%`, `%avs%`, `%token%`, `%credential%`, `%secret%`,
     `%open_banking%`, `%acces_logiciel%`) et **échoue** si elle n'est ni au registre ni à
     l'allowlist documentée → force la classification de toute nouvelle colonne sensible ;
   - **(indirection Vault)** pour chaque entrée `vault`, vérifie que la colonne est de type `uuid`
     et qu'**aucune colonne sœur en clair** de la donnée protégée n'existe dans la table ;
   - **(garde-fou doc)** pour chaque colonne `clair_differe`, vérifie la présence du `COMMENT ON
     COLUMN` anti-oubli.
4. **Règle non négociable** : toute nouvelle colonne ultra-sensible DOIT être inscrite au registre
   `SENSITIVE_COLUMNS` (analogue à `METIER_TABLES` pour l'anti-fuite). Cf. `tests/CLAUDE.md`.

### Conséquences
- **Positif** : zéro nouvelle brique crypto à maintenir ; cohérence garantie par un test qui
  attrape toute colonne sensible non classée ; documentation alignée sur le code réel.
- **Négatif (assumé)** : Vault impose un appel applicatif (pas de finalisation par trigger SQL pur —
  déjà acté ADR 0021). Le registre doit être tenu à jour (garde-fou : le test de complétude échoue
  sinon).

### Références
- ADR 0021 (finalisation employé en app-code, Vault AVS/IBAN), migrations 0024 / 0030 / 0031 / 0042
- `tests/integration/anti-plaintext/sensitive-columns.{ts,test.ts}` (registre + test)
