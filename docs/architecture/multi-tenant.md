---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
domain: architecture
depends_on: []
referenced_by: [crm-schema, salaire-schema, onboarding-fiduciaire, security-and-audit, llm-strategy]
---

# Architecture multi-tenant

## 1. Principe directeur

ZARYA est un **SaaS multi-tenant natif dès le MVP**. Chaque cabinet fiduciaire est un **tenant** indépendant. Tous les tenants partagent la même infrastructure (Postgres unique, app unique, Bedrock unique), mais leurs données sont **strictement isolées**.

Voir [`/docs/architecture/decisions/0005-multi-tenant-natif-mvp.md`](./decisions/0005-multi-tenant-natif-mvp.md) pour le raisonnement.

## 2. Modèle de tenant

**Niveau de tenant unique : le cabinet fiduciaire**.

```
crm.cabinet (le tenant)
    │
    ├── crm.cabinet_membre  (utilisateurs internes du cabinet)
    │     ↓
    │   auth.users (Supabase Auth)
    │
    ├── crm.client          (clients du cabinet)
    │     │
    │     ├── crm.contact
    │     ├── crm.service
    │     ├── crm.salaire_config
    │     └── ...
    │
    ├── crm.modele_*        (templates personnalisés du cabinet)
    └── crm.integration     (Microsoft, NAS, Bexio...)
```

**Pas de tenant client-final** : les contacts RH d'un client (qui accèdent au mini-dashboard) sont identifiés par leur appartenance à un `crm.client`, lui-même appartenant à un cabinet. Ils ne sont **pas** un tenant séparé. Voir `acces_client` dans le schéma salaire.

## 3. Stratégie d'isolation : Shared Database, Shared Schema

ZARYA utilise le pattern **shared database, shared schema** avec `cabinet_id` sur toutes les tables. Pas de schéma par cabinet, pas de base par cabinet.

### Pourquoi ce choix
- **Simplicité opérationnelle** : 1 base à backup, 1 à upgrader, 1 à monitorer
- **Coût** : 1 instance Supabase au lieu de N
- **Maintenance des migrations** : une seule fois pour tous
- **Cross-tenant analytics** : possibles pour ZARYA (anonymisées)
- **Démarrage rapide d'un nouveau cabinet** : INSERT, pas de provisionning

### Pourquoi pas schéma-par-tenant ou DB-par-tenant
- Coût opérationnel exponentiel à 100+ cabinets
- Migrations DB plus complexes
- Provisioning nouveau cabinet = plusieurs secondes au lieu de millisecondes
- Justifié seulement pour des cabinets enterprise avec compliance ultra-stricte (hors-scope MVP)

### Quand reconsidérer
Si un grand cabinet exige **physiquement** une infrastructure dédiée (rare mais possible pour les top 10 suisses), on pourra à terme proposer une **offre Enterprise** avec instance Supabase dédiée. Mais pas avant 100+ cabinets et une demande commerciale réelle.

## 4. Convention : `cabinet_id` partout

### 4.1 Règle absolue
**Toute table** qui contient des données métier porte une colonne `cabinet_id` :

```sql
cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT
```

- `NOT NULL` : aucune ligne ne peut exister sans tenant
- `ON DELETE RESTRICT` : impossible de supprimer un cabinet qui a encore des données (sécurité)
- Index sur `cabinet_id` systématique

### 4.2 Exceptions (tables sans `cabinet_id`)
Seules les tables suivantes sont **partagées entre tous les cabinets** :
- `crm.cabinet` (la table racine elle-même)
- Tables de **catalogues globaux** : standards Swissdec, codes cantons, codes pays, types d'éléments paie standards ZARYA, types de documents standards
- Tables de **gestion ZARYA interne** : facturation des cabinets, métriques agrégées

Toutes les autres tables (`crm.client`, `crm.contact`, `doc.document`, `salaire.employe`, etc.) ont un `cabinet_id`.

### 4.3 Héritage du `cabinet_id`
Quand une table dépend d'une autre via une FK, le `cabinet_id` est **dupliqué** (dénormalisation volontaire) pour permettre des RLS efficaces sans JOIN :

```sql
-- crm.contact n'a pas besoin de JOIN avec crm.client pour vérifier le tenant
crm.contact (
  id uuid PK,
  cabinet_id uuid NOT NULL,  -- redondant avec crm.client.cabinet_id, mais nécessaire
  client_id uuid FK,
  ...
);
```

**Contrainte de cohérence** : trigger qui vérifie que `contact.cabinet_id = client.cabinet_id` à l'INSERT/UPDATE.

## 5. Row Level Security (RLS)

### 5.1 Principe
Chaque table active RLS avec une policy qui filtre par `cabinet_id` de l'utilisateur authentifié.

```sql
-- Pour chaque table avec cabinet_id
ALTER TABLE crm.client ENABLE ROW LEVEL SECURITY;

-- Policy générique : voir uniquement les données de son cabinet
CREATE POLICY "tenant_isolation_select" ON crm.client
  FOR SELECT
  USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_insert" ON crm.client
  FOR INSERT
  WITH CHECK (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_update" ON crm.client
  FOR UPDATE
  USING (cabinet_id = current_cabinet_id())
  WITH CHECK (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_delete" ON crm.client
  FOR DELETE
  USING (cabinet_id = current_cabinet_id());
```

### 5.2 Fonction `current_cabinet_id()`
Fonction Postgres qui résout le `cabinet_id` actif depuis le JWT Supabase :

```sql
CREATE OR REPLACE FUNCTION current_cabinet_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'cabinet_id')::uuid;
$$;
```

Le `cabinet_id` est injecté dans le JWT au moment de l'authentification (Supabase Auth hook).

### 5.3 Cas particulier : contacts client (mini-dashboard)
Les contacts RH client n'ont pas accès au tenant cabinet entier — uniquement à leurs propres données client. Leur JWT contient un `client_id`, pas un `cabinet_id`.

Policy spécifique pour ce rôle :

```sql
CREATE POLICY "client_isolation" ON salaire.periode
  FOR ALL
  USING (
    -- Soit le user est membre du cabinet (vue fiduciaire)
    cabinet_id = current_cabinet_id()
    OR
    -- Soit le user est un contact client autorisé
    client_id IN (
      SELECT client_id FROM salaire.acces_client
      WHERE auth_user_id = auth.uid() AND actif = true
    )
  );
```

### 5.4 Rôle service (jobs, triggers, admin)
Les jobs Postgres (cron) et les fonctions internes utilisent le rôle `service_role` qui **bypass RLS**. À utiliser avec parcimonie et toujours en filtrant explicitement par `cabinet_id`.

### 5.5 Tests d'isolation
Tests automatisés obligatoires :
- Un user du cabinet A ne peut **rien** voir du cabinet B (SELECT, INSERT, UPDATE, DELETE)
- Un contact client ne peut voir que les données de son `client_id`
- Les jobs cron qui traitent plusieurs cabinets ne fuitent pas de données

Ces tests font partie de la CI et bloquent la merge en cas d'échec.

## 6. Authentification multi-tenant

### 6.1 Modèle utilisateur
Deux types d'utilisateurs Supabase Auth :

**Type A — Membre du cabinet** :
- 1 compte = 1 personne physique = 1 cabinet
- `app_metadata.role` = `cabinet_member`
- `app_metadata.cabinet_id` = UUID du cabinet
- `app_metadata.cabinet_role` = `responsable`, `gestionnaire_salaires`, `collaborateur`, etc.

**Type B — Contact client** :
- 1 compte = 1 contact RH d'une PME
- `app_metadata.role` = `client_contact`
- `app_metadata.client_id` = UUID du client (PAS du cabinet)
- Accès limité aux ressources de son `client_id`

### 6.2 Cas particulier : un même email dans deux cabinets ?
**Interdit** : un email = un compte = un cabinet. Si un consultant indépendant travaille pour deux fiduciaires différentes utilisant ZARYA, il doit avoir deux comptes (email différents).

Cas d'usage : un comptable freelance qui collabore avec 2 fiduciaires. Pour l'instant, on ne supporte pas ce cas. À revoir Phase 2 si demande commerciale.

### 6.3 Sign-up flow
Self-service via la page d'inscription cabinet (voir `modules/onboarding-fiduciaire.md`) :

1. Le responsable s'inscrit (email + mot de passe)
2. Création atomique en transaction Postgres :
   - `crm.cabinet` (nouvelle ligne)
   - `crm.cabinet_membre` lié à l'auth user et au cabinet
   - `app_metadata` mis à jour avec `cabinet_id`
3. Email de vérification
4. Redirection vers wizard d'onboarding fiduciaire

## 7. Provisioning d'un nouveau cabinet

### 7.1 Étapes techniques
À la création d'un cabinet, ZARYA exécute :

1. **INSERT** dans `crm.cabinet` (UUID généré)
2. **INSERT** dans `crm.cabinet_membre` (le créateur devient `responsable`)
3. **Seed des templates par défaut** :
   - Modèles d'emails ZARYA (relances, validations) hérités
   - Modèles de checklist par type de client
   - Catalogue d'éléments paie standards
   - Types de documents standards
4. **Configuration par défaut** :
   - Langue principale (depuis le navigateur ou choix utilisateur)
   - Fuseau horaire (Europe/Zurich par défaut)
   - Devise (CHF)
5. **Activation du compte** et redirection onboarding

Tout ça en **< 2 secondes** pour ne pas casser l'UX du sign-up.

### 7.2 Hiérarchie des templates
Pour éviter la duplication massive (cf. piège évoqué dans la conversation), les templates fonctionnent par **héritage** :

```
Templates ZARYA (globaux, dans crm.modele_*)
    ↓ hérités automatiquement par
Templates cabinet (overrides dans crm.modele_*_override avec cabinet_id)
```

Concrètement :
- Le cabinet voit la **liste fusionnée** : templates ZARYA + ses overrides
- Modifier un template ZARYA crée automatiquement un override
- Supprimer un override revient au template ZARYA
- Au runtime, on cherche d'abord l'override puis on tombe sur le template ZARYA

Ça réduit drastiquement le volume de données et permet à ZARYA de pousser des améliorations globales.

## 8. Cross-cabinet : ce qui est partagé, ce qui ne l'est pas

### 8.1 Partagé entre cabinets (globaux)
- Catalogues standards (types Swissdec, codes cantons, types éléments paie standards)
- Templates par défaut ZARYA (emails, checklists, mappings export)
- Connaissance produit (`docs/`, FAQ utilisateurs)
- Index Search ZARYA interne (pas les documents clients, juste les définitions ZARYA)

### 8.2 Privé à chaque cabinet
- Tous les clients du cabinet et leurs données
- Tous les employés des clients
- Tous les documents reçus
- Toutes les périodes salaire
- Tous les emails envoyés
- Modèles personnalisés (overrides)
- Branding (logo, couleurs)
- Statistiques internes du cabinet

### 8.3 Données ZARYA agrégées (anonymes)
ZARYA collecte des **statistiques agrégées** sur l'usage de la plateforme :
- Volume d'extractions par mois (sans identification)
- Taux de validation 1-clic vs modification
- Types de logiciels paie les plus utilisés
- Temps moyen d'onboarding client

Ces stats sont :
- **Agrégées** (k-anonymity ≥ 10)
- **Anonymisées** (aucun identifiant client/cabinet)
- Utilisées pour améliorer le produit, pas vendues

Documentation requise dans la politique de confidentialité.

## 9. Migration et suppression de cabinet

### 9.1 Suppression
**Soft delete** d'abord (`crm.cabinet.archived_at = now()`). Toutes les ressources liées deviennent inaccessibles via RLS (policy intègre `archived_at IS NULL`).

Après **30 jours** (délai légal de rétractation et erreur) :
- **Hard delete** possible sur demande
- Export complet au format ZIP fourni au cabinet
- Suppression cascade sur toutes les FK
- Logs d'audit conservés 6 ans (anonymisés)

### 9.2 Export / portabilité
Le cabinet peut à tout moment exporter **toutes ses données** :
- Clients : CSV
- Documents : ZIP avec arborescence par client
- Périodes salaire : Excel par client
- Emails envoyés : MBOX
- Configuration : JSON

L'export est **scopé par `cabinet_id`** strict, rien d'autre.

### 9.3 Migration cabinet → cabinet (changement de propriétaire)
Cas rare (rachat de cabinet) : pas supporté au MVP. Devra être traité au cas par cas par l'équipe ZARYA via script d'admin direct.

## 10. Facturation par cabinet

Chaque cabinet a son propre **plan tarifaire** :

```
crm.cabinet.plan_tarifaire (enum: starter | pro | enterprise)
crm.cabinet.facturation_active_id (FK → billing.subscription)
```

Le tracking d'usage (nb clients, nb employés, volume LLM consommé) est scopé par `cabinet_id` et permet la facturation à l'usage si nécessaire.

Détails dans `docs/pricing.md` (à créer).

## 11. Observabilité multi-tenant

### 11.1 Logging
Chaque log applicatif inclut le `cabinet_id` en tag :
```
[INFO] [cabinet_id=abc-123] User created new client
```

Permet de filtrer par cabinet dans CloudWatch / Sentry.

### 11.2 Métriques
Dashboards Supabase et CloudWatch avec dimension `cabinet_id` :
- Volume de requêtes par cabinet
- Latence par cabinet
- Erreurs par cabinet
- Coûts LLM par cabinet (facturation)

### 11.3 Alertes
- Cabinet en activité anormale (10x le volume habituel) → alerte ops
- Cabinet inactif depuis 30 jours → alerte commerciale
- Taux d'erreur élevé sur un cabinet → alerte support

## 12. Sécurité et conformité

### 12.1 Audit log par cabinet
Chaque action sensible est loggée dans `audit.*` (schéma dédié) avec :
- `cabinet_id`
- `user_id`
- `action`
- `ressource`
- `timestamp`
- `ip`

Logs consultables par le cabinet sur demande (transparence) et conservés 6 ans.

### 12.2 Données salariales
Catégorie sensible nLPD :
- Chiffrement applicatif additionnel sur AVS, IBAN (Supabase Vault)
- Accès loggué même pour les membres du cabinet
- Restriction possible par rôle (gestionnaire_salaires peut voir, collaborateur non)

### 12.3 Isolation cryptographique
Pas d'isolation cryptographique au MVP (clés différentes par cabinet). À considérer en Phase 2 pour offre Enterprise. RLS Postgres + chiffrement at-rest commun est suffisant pour la cible MVP.

## 13. Points sensibles à tester systématiquement

Liste de tests d'isolation à inclure dans la CI :

1. **Fuite SELECT** : un user du cabinet A peut-il lire `crm.client` d'un autre cabinet ?
2. **Fuite INSERT** : un user du cabinet A peut-il créer une ressource avec `cabinet_id` d'un autre cabinet ?
3. **Fuite UPDATE** : un user du cabinet A peut-il modifier une ressource d'un autre cabinet en spoofant `cabinet_id` ?
4. **Fuite DELETE** : idem en suppression
5. **JOIN inter-tenant** : une requête SQL applicative oublie-t-elle un filtre `cabinet_id` quelque part ?
6. **Jobs cron** : un job qui itère sur tous les cabinets ne mélange-t-il pas des données ?
7. **Triggers** : un trigger qui s'exécute en bypass RLS respecte-t-il le scope ?
8. **Contact client** : un contact RH du client X ne voit-il que les données du client X ?

Ces tests doivent être **automatisés** et **passer** sur chaque PR touchant le code DB ou les RLS.

## 14. Hors-scope MVP

- DB-par-tenant ou schema-par-tenant (Phase 2 si offre Enterprise)
- Isolation cryptographique par cabinet (clés KMS différentes)
- Multi-region par cabinet (un cabinet en Suisse, un en France physiquement)
- Cross-cabinet collaboration (un cabinet partage un client avec un autre)
- White-label complet (le cabinet revend ZARYA sous son propre nom)

## 15. Questions ouvertes

- [ ] Politique de **soft delete** : 30 jours suffisants avant hard delete ? Aligner avec la rétractation légale
- [ ] **Migration de cabinet** (rachat, fusion) : workflow à concevoir en Phase 2
- [ ] Performance avec **gros cabinets** (200+ clients, 5000+ employés) : Postgres tient-il avec RLS ?
- [ ] **Limites Supabase** pour multi-tenant : combien de cabinets avant changement d'infra ?
- [ ] **Quotas par cabinet** : limites soft (alertes) et hard (blocages) à définir
- [ ] **Cross-cabinet pour ZARYA** : un admin ZARYA doit-il pouvoir voir tous les cabinets (support) ? Si oui, comment l'auditer ?
- [ ] **Backup** : par cabinet ou global ? Restauration sélective possible ?
