# scripts/

Scripts d'exploitation ponctuels. Aucun script ici n'est appelé par l'application.

## `audit-residus-tests.sql` — inventaire des résidus de tests (LECTURE SEULE)

Contexte (P0-2, `AUDIT-MVP.md` § 8) : jusqu'au 16.07.2026, les suites de tests tournaient
contre la base de **production** via `DATABASE_URL`. La base contient ~929 cabinets dont
l'écrasante majorité sont des résidus de seeds de test jamais nettoyés.

Ce script ne contient **que des `SELECT`** : il ne modifie rien. Il inventorie les résidus
probables (cabinets sans membre, cabinets nommés `Test %`, templates `Test %` /
`Override TVA %` / `TVA Lot2 %`, users auth `ci-<uuid>@example.com`, volumétrie par table).

### Procédure de nettoyage (en 3 temps, jamais en un seul)

1. **Inventaire** — lancer le script en lecture seule et exporter les résultats (CSV) :

   ```bash
   psql "$DATABASE_URL" -f scripts/audit-residus-tests.sql
   ```

   (ou requête par requête dans le SQL Editor Supabase.)

2. **Validation founder** — faire valider la liste des `cabinet_id` à purger (requête 2 du
   script = candidats n°1 : cabinets sans membre). Aucune purge sans cette validation
   explicite : un vrai cabinet en cours d'onboarding pourrait ressembler à un résidu.

3. **Purge manuelle** — hors périmètre de ce script. À exécuter en transaction, après
   vérification du point de restauration (PITR Supabase), en supprimant dans l'ordre des FK
   (enfants avant parents, `crm.cabinet` en dernier), puis re-lancer l'inventaire pour
   vérifier le résultat.
