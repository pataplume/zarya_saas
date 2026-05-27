---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
module: onboarding-fiduciaire
depends_on: [crm, multi-tenant, extraction-ia, zefix-integration, microsoft-integration]
referenced_by: [crm, onboarding-client]
---

# Zarya — Onboarding Fiduciaire

## 1. Rôle dans le produit

L'**onboarding fiduciaire** est l'expérience d'inscription et de configuration initiale d'un **cabinet** sur ZARYA. Il intervient **une seule fois par cabinet**, au moment de la souscription.

**Distinction critique** :
- **Onboarding fiduciaire** = un cabinet s'inscrit à ZARYA et configure son tenant
- **Onboarding client** = un client (PME) est intégré dans le tenant du cabinet, voir [`onboarding-client.md`](./onboarding-client.md)

**Promesse produit** : un cabinet découvre ZARYA, crée son compte, paie son abonnement, configure son cabinet, importe son portefeuille de clients existants, et lance son 1er cycle opérationnel — **sans intervention humaine de l'équipe ZARYA**.

**Acquis structurants** :
- Self-service complet dès le MVP (voir [`ADR 0006`](../architecture/decisions/0006-onboarding-self-service-mvp.md))
- L'**import du portefeuille existant** est assisté en live par l'équipe ZARYA (le seul point d'intervention humaine)
- Multi-tenant natif : chaque cabinet crée son propre tenant via ce wizard (voir [`ADR 0005`](../architecture/decisions/0005-multi-tenant-natif-mvp.md))

## 2. Cycle complet

```
1. Découverte & inscription (5 min)
   Landing page ZARYA → Sign-up → Email vérification

2. Wizard d'onboarding fiduciaire (45-90 min)
   ├─ Étape A — Identité du cabinet (Zefix)
   ├─ Étape B — Équipe et droits
   ├─ Étape C — Branding et préférences
   ├─ Étape D — Paramètres métier (modèles checklist, emails)
   ├─ Étape E — Intégrations (Microsoft, NAS, logiciels)
   └─ Étape F — Import portefeuille clients ← session live ZARYA

3. Activation
   ├─ Plan tarifaire choisi
   ├─ Paiement
   └─ Bascule en mode opérationnel
       → Les clients sont créés (statut prospect)
       → Les onboardings clients peuvent commencer
```

**Bloquant** : aucun client ne peut être créé ni opéré tant que les étapes A et B au moins ne sont pas terminées. Les étapes C-F peuvent rester en cours pendant que le cabinet commence à utiliser ZARYA.

## 3. Acteurs

| Acteur | Rôle | Quand |
|---|---|---|
| Responsable cabinet | Initie l'inscription, valide les choix structurants | Étapes 1-6 |
| Membres ajoutés du cabinet | Acceptent leur invitation et complètent leur profil | Étape B en différé |
| Équipe ZARYA (CSM) | Accompagne l'import du portefeuille en visio | Étape F uniquement |
| Système ZARYA | Provisioning, validation Zefix, extraction IA | En continu |

## 4. Étape 1 — Découverte et inscription

### 4.1 Landing page
- Présentation produit, témoignages, démo vidéo
- Pricing affiché (3 plans : Starter / Pro / Enterprise)
- CTA "Démarrer gratuitement" → 14 jours d'essai sans CB
- CTA "Demander une démo" → Calendly équipe ZARYA

### 4.2 Sign-up
Formulaire minimal :
- Email professionnel
- Mot de passe (12 caractères minimum, complexité enforced)
- Acceptation CGU et politique de confidentialité (case à cocher obligatoire, **non pré-cochée**)
- Optionnel : code de parrainage

Submit →
- Création atomique en transaction Postgres :
  - Compte Supabase Auth créé
  - `crm.cabinet` créée avec UUID
  - `crm.cabinet_membre` lié (role = `responsable`)
  - `app_metadata.cabinet_id` injecté dans le JWT
  - Seed des templates ZARYA hérités automatiquement
- Email de vérification envoyé
- Redirection vers `/welcome`

### 4.3 Email de vérification
- Lien unique, expire après 24h
- Format multilingue (FR/DE/IT détecté depuis Accept-Language)
- Bouton "Confirmer mon adresse"
- Au clic → redirection vers le wizard étape A

## 5. Étape A — Identité du cabinet (5-10 min)

### 5.1 Recherche Zefix
Premier écran post-vérification email. **Identique pattern à l'onboarding client** mais pour le cabinet lui-même.

- Champ unique : IDE (`CHE-XXX.XXX.XXX`) ou raison sociale
- Appel API Zefix (voir [`zefix-integration.md`](../architecture/zefix-integration.md))
- Liste de résultats avec sélection

### 5.2 Consentement nLPD
Avant l'appel :
> *"J'autorise ZARYA à récupérer les informations publiques de mon cabinet depuis le registre du commerce suisse (Zefix)."*

Coché par défaut. Log dans `audit.cabinet_evenement` (type `consentement_zefix_donne`).

### 5.3 Auto-remplissage
Champs récupérés :
- Raison sociale
- Forme juridique
- IDE
- Adresse du siège (rue, NPA, ville, canton)
- Date d'inscription
- Capital social
- Organes (administrateurs, signataires)

→ Pré-remplissage de `crm.cabinet`.

### 5.4 Compléments manuels
Le responsable doit ajouter :
- Numéro TVA (non récupérable Zefix)
- Langues opérationnelles du cabinet (multi-sélection FR/DE/IT/EN)
- Langue principale (radio)
- Fuseau horaire (Europe/Zurich par défaut)
- Devise (CHF par défaut)
- Site web et téléphone

### 5.5 Fallback : saisie manuelle
Si Zefix ne renvoie rien (cabinet récent, indépendant non inscrit, association) → formulaire libre.

### 5.6 Validation
Au bout de l'étape A :
- `crm.cabinet` complétée
- `crm.cabinet_membre` (le responsable) lié à `auth.users`
- Statut session onboarding fiduciaire : `etape_a_terminee`

## 6. Étape B — Équipe et droits (5-15 min)

### 6.1 Ajout des membres
Tableau d'ajout :

| Email | Prénom | Nom | Rôle | Spécialisation |
|---|---|---|---|---|
| jane@cabinet.ch | Jane | Doe | gestionnaire_salaires | Salaires, PME |
| paul@cabinet.ch | Paul | Martin | collaborateur | TVA, Compta |
| ... | ... | ... | ... | ... |

**Rôles disponibles** :
- `responsable` : tous droits (le responsable initial est déjà créé)
- `gestionnaire_salaires` : accès complet salaires + lecture seule autre
- `collaborateur` : accès opérationnel (doc, CRM, facture)
- `lecteur` : lecture seule

Possibilité d'**upload Excel** pour gros cabinets : colonnes attendues `Email | Prénom | Nom | Rôle | Spécialisation`. Extraction IA si format libre.

### 6.2 Envoi des invitations
Au submit, pour chaque membre :
- Création `crm.cabinet_membre` (statut `invite`)
- Email d'invitation envoyé (token magic-link 7 jours)
- Au clic du membre : création du compte `auth.users`, choix du mot de passe, lien automatique au `cabinet_id` du tenant

### 6.3 Spécialisation (optionnelle)
Tags libres : "TVA", "Salaires", "Bouclement", "PME", "Indépendants", "Associations"...

Utilisés ensuite pour :
- Suggérer un responsable lors de l'attribution d'un client
- Filtrer les vues "mes clients" par spécialisation

### 6.4 Validation
Étape B est terminée quand le responsable confirme la liste (même si vide pour un cabinet 1 personne).

## 7. Étape C — Branding et préférences (5 min)

### 7.1 Identité visuelle
- Upload logo (PNG/SVG, fond transparent recommandé)
- Couleur primaire (color picker)
- Couleur secondaire
- Aperçu temps réel : dashboard mock + email mock avec le branding appliqué

### 7.2 Signature email cabinet
Éditeur WYSIWYG simple pour la signature insérée dans les emails de relance :
- Variables : `{{membre.prenom}}`, `{{membre.nom}}`, `{{cabinet.raison_sociale}}`, `{{cabinet.telephone}}`
- Preview live

Stocké dans `crm.cabinet.signature_email`. Chaque membre peut surcharger plus tard via `cabinet_membre.signature_email_personnelle`.

### 7.3 Préférences notifications
- Email de récap quotidien / hebdomadaire / désactivé
- Notifications push (à venir, pas MVP)
- Canal Slack (à venir)

## 8. Étape D — Paramètres métier (10-15 min)

### 8.1 Modèles de checklist
ZARYA propose **par défaut** des modèles de checklist par type de client (PME, indépendant, association). Le cabinet peut :

- Voir la liste héritée des templates ZARYA
- **Override** un modèle pour le personnaliser
- Créer ses propres modèles personnalisés
- Activer/désactiver les modèles par défaut

UX : tableau avec colonnes `Modèle | Source (ZARYA / Cabinet) | Actif | Actions`. Bouton "Personnaliser" → override automatique.

### 8.2 Modèles d'emails
Idem pour les emails de relance. Templates ZARYA en FR/DE/IT par défaut sur 6 contextes :
- Relance document
- Relance échéance
- Validation salaire mensuelle
- Confirmation de validation reçue
- Bienvenue client
- Récap mensuel client

Override possible par cabinet, par langue, par contexte.

### 8.3 Catalogue de services et tarification
Le cabinet définit ses **packs commerciaux** :

| Pack | Services inclus | Tarif |
|---|---|---|
| Compta light | Comptabilité simplifiée | 150 CHF/mois |
| Compta + TVA | + déclarations TVA | 280 CHF/mois |
| Tout-en-un | + salaires + bouclement | 450 CHF/mois |
| À la carte | Sélection | Sur devis |

Utilisé ensuite à l'onboarding client pour proposer un pack pré-configuré.

### 8.4 Politique de validation des relances
Choix unique :
- **Toutes les relances passent par validation humaine** (recommandé MVP)
- **Auto-envoi pour les relances < N°2, validation humaine au-delà**
- **Auto-envoi complet** (avec garde-fous)

## 9. Étape E — Intégrations (10-20 min)

### 9.1 Microsoft 365
- Bouton "Connecter Microsoft 365" → OAuth flow
- Scopes demandés : Mail.Read, Mail.Send, Calendars.Read, Files.Read
- Tenant détecté automatiquement → vérification région (alerte si non-EU)
- Stockage credentials dans `crm.cabinet_integration` (chiffré)

Voir [`microsoft-integration.md`](../architecture/microsoft-integration.md).

### 9.2 NAS
- Type : SMB / NFS / WebDAV
- Adresse, chemin, credentials
- Choix de la stratégie : **lecture seule** (recommandé) ou **copie locale**
- Test de connexion en live

Voir [`nas-ingestion.md`](../architecture/nas-ingestion.md).

### 9.3 Logiciels comptables et de paie
Le cabinet déclare ses logiciels :
- Logiciel comptable principal (Bexio / Crésus / Abacus / WinBIZ / Banana / OfficeMaker / autre)
- Logiciel de paie principal (Bexio Payroll / Crésus Salaires / WinBIZ / Abacus Lohn / OfficeMaker Staff / aucun)

Pour Bexio Payroll : configuration OAuth disponible si le cabinet veut activer la synchro API. Sinon export CSV simple.

Voir [`payroll-integration.md`](../architecture/payroll-integration.md).

### 9.4 Banque(s) du cabinet
Optionnel. Pour la facturation client si le cabinet veut intégrer.

## 10. Étape F — Import du portefeuille existant (session live)

**Point d'inflexion** : c'est l'étape la plus complexe et la seule qui implique un accompagnement humain.

### 10.1 Pourquoi du live
Un cabinet a typiquement :
- 50 à 200 clients
- Historique de 5-10 ans
- Données dispersées (Excel, Bexio CRM, fichiers Word, archives papier)
- Niveau de qualité hétérogène

L'IA peut extraire 70-80% automatiquement, mais le reste nécessite arbitrages. Un call de 1h avec un CSM ZARYA + le responsable cabinet permet de :
- Comprendre la structure de leurs données
- Décider des champs prioritaires vs optionnels
- Identifier les clients à exclure (inactifs, archivés)
- Lancer l'import avec supervision

### 10.2 Booking du call
À l'arrivée sur l'étape F :
- Bouton "Réserver une session d'import" → Calendly ZARYA
- Possibilité de **différer** : "Je ferai cette étape plus tard" → marque l'étape comme `differee`, accès aux autres fonctionnalités débloqué

### 10.3 Workflow du call
Pendant la visio :
1. Le cabinet partage son écran ou envoie ses fichiers source
2. Le CSM ZARYA upload dans l'interface dédiée
3. Détection automatique du format (Excel libre, Bexio CRM export, ABACUS, etc.)
4. Pipeline d'extraction IA (réutilise le pattern de [`extraction-ia.md`](./extraction-ia.md))
5. Affichage de N propositions de clients
6. Validation en lot par le responsable cabinet (pas champ par champ comme pour les employés — les clients ont moins de champs critiques)
7. Création atomique : N `crm.client` créés en statut `prospect`

### 10.4 Validation
Plus permissive que pour l'onboarding client :
- Champs obligatoires : raison sociale, type, langue
- Champs souhaitables : IDE, contact principal
- Tout le reste peut être complété plus tard

### 10.5 Post-import
Pour chaque client importé :
- Un `salaire.session_onboarding` est créé en statut `initialisee` (si le service salaires sera activé)
- Le cabinet pourra ensuite faire l'onboarding client complet pour chaque, ou laisser le client le faire en self-service

### 10.6 Mode self-service (sans accompagnement)
Si le cabinet refuse le call de migration :
- Upload de fichiers directement
- Extraction IA automatique
- Validation manuelle en lot
- Moins efficace mais possible

## 11. Activation et plan tarifaire

### 11.1 Choix du plan
À la fin de l'étape F (ou en parallèle) :

| Plan | Limite clients | Limite employés | Prix mensuel |
|---|---|---|---|
| Starter | 20 | 100 | 199 CHF |
| Pro | 100 | 1000 | 499 CHF |
| Enterprise | Illimité | Illimité | Sur devis |

Modèle de pricing à valider en interview (voir [`pricing.md`](../pricing.md)).

### 11.2 Saisie paiement
- Stripe (recommandé) ou facture bancaire mensuelle
- Période d'essai 14 jours gratuits
- Pas de blocage immédiat à la fin de l'essai : grace period 7 jours

### 11.3 Activation finale
- `crm.cabinet.onboarding_termine = true`
- `crm.cabinet.onboarding_termine_at = now()`
- Email de bienvenue + lien vers la documentation utilisateur
- Tour produit interactif (Phase 2)

## 12. États de la session d'onboarding fiduciaire

```
inscrit (sign-up fait, email pas vérifié)
   ↓
email_verifie
   ↓
etape_a_en_cours → etape_a_terminee
   ↓
etape_b_en_cours → etape_b_terminee
   ↓
etape_c_en_cours → etape_c_terminee
   ↓
etape_d_en_cours → etape_d_terminee
   ↓
etape_e_en_cours → etape_e_terminee
   ↓
etape_f_en_cours → etape_f_terminee (ou differee)
   ↓
paiement_configure
   ↓
actif
```

États possibles à tout moment : `abandonne` (inactif >30 jours sans complétion), `suspendu` (problème paiement), `archive`.

## 13. Récap des données créées

À l'issue de l'onboarding fiduciaire, en base :

| Table | Lignes créées |
|---|---|
| `crm.cabinet` | 1 |
| `crm.cabinet_membre` | 1 à N (selon équipe) |
| `crm.cabinet_integration` | 0 à N (selon intégrations activées) |
| `crm.modele_checklist` | 0 à N (overrides custom) |
| `crm.modele_email` | 0 à N (overrides custom) |
| `crm.client` | 0 à 200 (selon import portefeuille) |
| `auth.users` | 1 à N (selon membres invités acceptés) |

Plus de nombreuses entrées dans `audit.cabinet_evenement` pour la traçabilité.

## 14. Métriques de succès

- **Taux de complétion** : % d'inscriptions qui terminent l'onboarding (objectif > 70%)
- **Temps moyen** : objectif < 90 min pour les étapes A-E
- **Taux d'adoption import live** : % qui réservent le call CSM (signal de qualité)
- **Précision import portefeuille** : % de clients importés sans correction
- **Conversion essai → payant** : % qui souscrivent après 14 jours d'essai

## 15. UX clés

- **Progress bar visible** sur toutes les étapes (1/6, 2/6...)
- **Sauvegarde automatique** : pas de bouton "Save", tout est persisté en temps réel
- **Possibilité de revenir en arrière** sans perte de données
- **Ne jamais bloquer** : le responsable peut "passer pour l'instant" sur les étapes C-F et y revenir
- **Aide contextuelle** : chaque champ a un `?` avec tooltip
- **Estimation du temps restant** affichée

## 16. Hors-scope MVP

- White-label complet (le cabinet revend ZARYA sous son propre nom)
- Multi-établissement (cabinet avec 3 succursales en bases distinctes)
- SSO entreprise (SAML, Active Directory)
- Migration depuis un autre logiciel cabinet (ex. Bexio Cabinet, MIK, etc.) avec connecteur natif
- Onboarding multi-cabinet pour un même responsable (un consultant freelance qui gère 2 cabinets)
- Configuration des droits ultra-granulaires (rôles custom)
- Test A/B sur le wizard d'onboarding lui-même

## 17. Questions ouvertes

- [ ] **Quel CRM commercial** pour suivre les leads d'inscription qui n'ont pas terminé (HubSpot, Pipedrive, fait maison) ?
- [ ] **Stripe vs Mollie** pour les paiements suisses ? (Mollie est suisse-friendly mais moins universel)
- [ ] **Conservation des sessions abandonnées** : combien de temps avant suppression ?
- [ ] **Notification d'abandon** : email automatique J+3 si pas terminé ? Risque spam ?
- [ ] **Vérification d'identité** : doit-on demander une preuve (extrait RC) pour activer le compte ? Ou trust + KYC à terme ?
- [ ] **Onboarding en équipe** : un responsable invite-t-il d'abord ses membres puis configure-t-il ? Ou inverse ?
- [ ] **Templates ZARYA initiaux** : combien faut-il proposer pour ne pas submerger le cabinet ?
- [ ] **Plan Free** : utile pour acquisition ou risque de surcharger l'infra sans revenu ?
