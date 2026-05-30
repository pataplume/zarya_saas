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
