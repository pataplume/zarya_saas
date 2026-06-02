---
status: accepted
date: 2026-06-02
deciders: [tristan]
referenced_by: [onboarding-client, salaire-schema, extraction-ia]
---

# ADR 0021 — Finalisation proposition → `salaire.employe` en app-code (addendum à la règle 4)

## Statut

**Acceptée** — 2 juin 2026. Décision **founder** explicite. Addendum à la règle non-négociable
n°4 (« Création de l'entité finale via trigger à la validation ») de `CLAUDE.md`. Mise en œuvre
au Bloc **F6c**.

## Contexte

La règle 4 prescrit que la création de l'entité finale (à partir d'une proposition validée) se
fasse **via un trigger DB** à la validation. Cette règle a été écrite avant l'introduction du
chiffrement au repos des colonnes ultra-sensibles (ADR 0013).

Au Bloc F6c, la finalisation d'une `salaire.proposition_employe` validée crée un `salaire.employe`
dont **le numéro AVS et l'IBAN doivent être chiffrés au Vault** (ADR 0013, « jamais en clair, sans
exception »). Le déplacement / la référence du secret passe par les helpers `vault*` (`@zarya/db`),
qui appellent l'API Supabase Vault **côté application serveur**.

## Problème

Un trigger SQL pur **ne peut pas** appeler les helpers Vault applicatifs : il n'a pas accès au
service role applicatif ni au client Supabase. Implémenter la finalisation en trigger forcerait
soit à écrire l'AVS/IBAN **en clair** dans `salaire.employe` (violation frontale d'ADR 0013), soit
à dupliquer la logique Vault en PL/pgSQL (non disponible, non souhaitable).

## Décision

La finalisation `proposition_employe → salaire.employe` est réalisée en **app-code**
(`finaliserPropositionEmploye`, `@zarya/extraction`), invoquée par une server action validée
(auth + RBAC + scope cabinet). Le **trigger de cohérence** `crm.fn_check_client_cabinet` reste posé
sur `salaire.employe` (défense en profondeur multi-tenant).

Ceci **généralise** le pattern déjà appliqué en B (`finaliserDocument`) et E
(`finaliserFacture`) : toutes les finalisations à effet Vault / multi-table vivent en app-code,
derrière une validation humaine, et non en trigger.

### Portée de l'addendum

La règle 4 reste valable dans son **intention** (proposition → validation humaine → entité finale ;
aucune création directe sans validation). Seul le **mécanisme** « via trigger » est assoupli :
> Lorsque la création de l'entité finale implique un effet de bord impossible en SQL pur
> (écriture Vault, appel d'intégration tierce, logique multi-table conditionnelle), elle est
> réalisée en **app-code** dans un cœur partagé (`@zarya/extraction`), invoqué par une server
> action validée. Les triggers de cohérence (`cabinet_id`) restent obligatoires.

## Conséquences

- **Anti-clair garanti** : AVS/IBAN ne transitent jamais en clair par `salaire.employe` ; le
  `vault_id` créé au stade proposition (F6b) est réutilisé (ou recréé si la valeur est modifiée à
  la validation).
- **Cohérence** avec B/E : un seul pattern de finalisation, testable en intégration.
- **Validation stricte préservée** (ADR 0007) : `finaliserPropositionEmploye` refuse la création
  tant que les champs obligatoires-Swissdec ne sont pas tous `valide`/`modifie`.
- **Risque** : la discipline `cabinet_id` repose sur le code app (la RLS étant contournée par le
  service role, cf. addendum ADR 0005) — couvert par les tests d'isolation + anti-fuite.

## Alternatives écartées

1. **Trigger + AVS/IBAN en clair** — viole ADR 0013. Rejeté.
2. **Trigger + logique Vault en PL/pgSQL** — Vault n'expose pas d'API serveur exploitable en
   trigger ; duplication fragile. Rejeté.
3. **Extension `pg_net` pour appeler Vault depuis le trigger** — complexité et surface d'attaque
   injustifiées pour un gain nul vs l'app-code. Rejeté.

## Références

- `CLAUDE.md` règle 4 ; ADR 0007 (validation granulaire), ADR 0013 (chiffrement colonnes sensibles),
  ADR 0005 addendum (RLS contournée sur le chemin app).
- `docs/modules/onboarding-client.md` §7.6-7.8 ; `packages/extraction/src/finalize-employe.ts`.
