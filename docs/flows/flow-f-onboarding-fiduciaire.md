---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
flow: F
depends_on: [onboarding-fiduciaire, multi-tenant, zefix-integration]
referenced_by: [onboarding-fiduciaire]
---

# Flow F — Onboarding fiduciaire

> Flow utilisateur : un nouveau cabinet s'inscrit sur ZARYA et configure son tenant jusqu'à être opérationnel.
>
> Voir la spec produit complète dans [`/docs/modules/onboarding-fiduciaire.md`](../modules/onboarding-fiduciaire.md).

## Déclencheur
Un responsable de cabinet fiduciaire arrive sur la landing page ZARYA (organique, parrainage, ou démo commerciale).

## Acteurs
- **Responsable cabinet** : initie et pilote l'onboarding
- **Membres du cabinet** : invités à rejoindre pendant l'étape B
- **CSM ZARYA** : intervient uniquement à l'étape F (import portefeuille en live)
- **Système ZARYA** : provisioning, validation, extraction IA

## Pré-requis
- Email professionnel valide
- Cabinet existant ou en création (IDE optionnel)
- Acceptation CGU

## Étapes détaillées

### Étape 0 — Découverte
1. Le responsable arrive sur https://zarya.ch
2. Consulte les pages produit, pricing, témoignages
3. Clic sur "Démarrer gratuitement" (CTA principal)
4. Redirection vers `/signup`

### Étape 1 — Sign-up et vérification email
1. Saisie : email pro + mot de passe + acceptation CGU
2. Submit → en transaction atomique côté serveur :
   - Création `auth.users` (Supabase Auth)
   - Création `crm.cabinet` minimaliste (juste l'UUID + created_by)
   - Création `crm.cabinet_membre` lié (role = `responsable`)
   - Création `crm.session_onboarding_fiduciaire` (statut = `inscrit`)
   - Injection `cabinet_id` dans `app_metadata` du JWT
3. Email de vérification envoyé (lien magic 24h)
4. Affichage écran "Vérifiez votre email"
5. Au clic du lien → statut session = `email_verifie`, redirection wizard

**Points d'attention** :
- Email duplicate → message explicite "Compte déjà existant, voulez-vous vous connecter ?"
- Email pro vs gratuit → pas de blocage MVP, mais flagger pour analytics
- Mot de passe faible → validation côté client en temps réel

### Étape 2 — Wizard étape A : Identité cabinet
1. Écran "Bienvenue ! Identifions votre cabinet"
2. Champ unique : IDE ou raison sociale
3. Consentement nLPD coché (le responsable peut décocher) → appel Zefix
4. Liste de résultats si plusieurs matches → sélection
5. Auto-remplissage des champs Zefix (raison sociale, adresse, forme, IDE)
6. Le responsable complète :
   - Numéro TVA (si applicable)
   - Langues opérationnelles (multi-sélection)
   - Langue principale (radio)
   - Site web, téléphone
7. Submit → `crm.cabinet` complétée, statut session = `etape_a_terminee`

**Cas spéciaux** :
- Zefix vide (cabinet non inscrit) → fallback formulaire manuel
- Zefix multi-résultats → sélection user
- IDE déjà utilisé par un autre cabinet ZARYA → message d'erreur, support contact

### Étape 3 — Wizard étape B : Équipe
1. Écran "Qui travaille dans votre cabinet ?"
2. Tableau pré-rempli avec le responsable (lecture seule)
3. Options :
   - "Ajouter un membre" → ligne vide à remplir
   - "Importer depuis Excel" → upload + extraction IA légère
   - "Je suis seul·e" → skip
4. Pour chaque membre ajouté :
   - Email (validation format)
   - Prénom, Nom
   - Rôle (dropdown)
   - Spécialisation (tags libres)
5. Submit → pour chaque ligne :
   - Création `crm.invitation_membre` (statut `envoyee`)
   - Email d'invitation envoyé (magic link 7 jours)
6. Statut session = `etape_b_terminee`

**Cas spéciaux** :
- Le responsable peut ajouter des membres plus tard → bouton "Continuer sans inviter"
- Email invalide → erreur inline
- Membre invité ne répond pas → relance auto à J+3

### Étape 4 — Wizard étape C : Branding
1. Upload logo (drop zone, formats acceptés affichés)
2. Color picker primaire + secondaire (avec preview live)
3. Éditeur signature email (WYSIWYG simple)
4. Aperçu temps réel : dashboard mock + email mock
5. Toggle préférences notifications (récap quotidien/hebdo/off)
6. Submit → `crm.cabinet` mise à jour, statut = `etape_c_terminee`

### Étape 5 — Wizard étape D : Paramètres métier
1. Section "Modèles de checklist documents"
   - Liste des templates ZARYA hérités (lecture par défaut)
   - Bouton "Personnaliser" sur chaque ligne → crée un override
   - Bouton "Créer un nouveau modèle" → formulaire libre
2. Section "Modèles d'emails"
   - Même pattern, par contexte × langue
   - Variables disponibles affichées en aide
3. Section "Catalogue services et packs"
   - Définition des packs commerciaux du cabinet
   - Tarification optionnelle
4. Section "Politique de validation des relances"
   - Radio : full humaine / hybride / auto
5. Submit → entrées dans `crm.modele_*` et `crm.cabinet` (politique)
6. Statut = `etape_d_terminee`

**Cas spéciaux** :
- Le responsable peut "Passer pour l'instant" sur cette étape → les défauts ZARYA s'appliquent

### Étape 6 — Wizard étape E : Intégrations
1. Section Microsoft 365
   - Bouton "Connecter Microsoft 365" → OAuth flow popup
   - Au retour : vérification du tenant, alerte si non-EU
   - Stockage credentials chiffrés dans `crm.cabinet_integration`
2. Section NAS
   - Formulaire : type, adresse, chemin, credentials
   - Bouton "Tester la connexion" → live test
   - Choix stratégie (lecture / copie)
3. Section Logiciels
   - Dropdown logiciel comptable + version
   - Dropdown logiciel paie + version
   - Pour Bexio : option OAuth pour synchro API
4. Section Banques (optionnel)
5. Submit → `crm.cabinet_integration` × N, statut = `etape_e_terminee`

**Cas spéciaux** :
- Connexion Microsoft échoue (tenant US) → message d'avertissement, choix de continuer ou changer
- NAS injoignable → erreur claire avec aide au troubleshooting

### Étape 7 — Wizard étape F : Import portefeuille
1. Écran "Importez vos clients existants"
2. Choix :
   - "Réserver une session live avec ZARYA (recommandé)" → Calendly intégré
   - "Faire en self-service maintenant" → flow d'upload immédiat
   - "Faire plus tard" → statut = `etape_f_differee`
3. Si live :
   - Confirmation du rendez-vous
   - Email confirmation envoyé
   - Création `crm.import_portefeuille` (statut `planifie`)
   - Wizard marqué comme `etape_f_terminee` (le live se passe en différé)
4. Si self-service :
   - Upload de fichiers (Excel, CSV)
   - Pipeline d'extraction IA → table `proposition_client`
   - Écran de validation en lot
   - Validation → création des `crm.client`
   - Statut = `etape_f_terminee`

**Pendant la session live** (différé après wizard) :
- CSM ZARYA et responsable cabinet en visio
- Partage d'écran ou upload de fichiers par le responsable
- Pipeline IA tourne en temps réel
- Validation collaborative des propositions
- Création des clients en fin de session
- `crm.import_portefeuille.statut = 'valide'`

### Étape 8 — Activation et paiement
1. Écran "Choisissez votre plan"
2. 3 cards : Starter / Pro / Enterprise
3. Sélection → redirection Stripe Checkout (ou facture mensuelle pour Enterprise)
4. Au retour Stripe success :
   - `crm.cabinet.plan_tarifaire` mis à jour
   - `crm.cabinet.facturation_active_id` lié
   - `crm.session_onboarding_fiduciaire.paiement_configure = true`
   - Statut = `paiement_configure` puis `actif`
5. Email de bienvenue + lien dashboard
6. Redirection vers `/dashboard`

**Période d'essai 14 jours** : pas de saisie CB obligatoire. À J+14, prompt de souscription. Grace period 7 jours avant suspension.

## Cas d'erreur

| Erreur | Comportement |
|---|---|
| Email déjà utilisé | Message + lien "Se connecter" |
| Email de vérif expire | Bouton "Renvoyer" + nouveau lien |
| Token invitation expiré | Page d'erreur + contact responsable |
| Zefix down | Fallback formulaire manuel + log incident |
| Stripe down | Message + email automatique support |
| Upload portefeuille corrompu | Message + bouton "Retry" |
| Extraction IA échec | Notification CSM + saisie manuelle possible |
| Session abandonnée >30 jours | Email final → archivage → suppression à J+90 |

## Points d'extension (Phase 2+)

- White-label (cabinet revend ZARYA sous son propre nom)
- Multi-établissement (un responsable gère N cabinets indépendants)
- SSO entreprise (SAML, Active Directory)
- Migration depuis un autre logiciel cabinet via connecteur natif
- Tour produit interactif post-onboarding
- Onboarding partenaire (un revendeur configure pour le cabinet)

## Métriques à instrumenter

- **Funnel** : sign-up → email vérifié → étape A → ... → actif (taux à chaque étape)
- **Temps moyen par étape** (médiane et p90)
- **Taux d'abandon par étape** (signal d'UX à corriger)
- **Taux d'utilisation Zefix** vs saisie manuelle
- **Taux de connexion Microsoft** vs report
- **Taux d'utilisation import live CSM** vs self-service
- **Conversion essai → payant** par segment (cabinet 1 personne, 5-10, 10+)

## Dépendances code

Cette flow s'appuie sur :
- Module Onboarding Fiduciaire ([`onboarding-fiduciaire.md`](../modules/onboarding-fiduciaire.md))
- Module Extraction IA ([`extraction-ia.md`](../modules/extraction-ia.md))
- Intégration Zefix ([`zefix-integration.md`](../architecture/zefix-integration.md))
- Intégration Microsoft ([`microsoft-integration.md`](../architecture/microsoft-integration.md))
- Architecture multi-tenant ([`multi-tenant.md`](../architecture/multi-tenant.md))
- Stratégie LLM ([`llm-strategy.md`](../architecture/llm-strategy.md))
