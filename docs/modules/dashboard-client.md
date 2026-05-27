---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
module: dashboard-client
depends_on: [crm, multi-tenant, onboarding-client, salaire]
referenced_by: [onboarding-client, salaire, onboarding-fiduciaire]
---

# Zarya — Dashboard Client (UI partagée)

## 1. Rôle dans le produit

Le **Dashboard Client** est l'**interface unique** présentée au contact RH/dirigeant d'un client (PME) du cabinet fiduciaire. Une seule UI, qui couvre tous les usages que le client a de ZARYA :

- Onboarding initial (premier accès)
- Validation salariale mensuelle récurrente
- Consultation des documents transmis
- Mise à jour de la fiche entreprise
- Communication avec le cabinet

**Distinction critique** : ce n'est PAS le dashboard du gestionnaire fiduciaire (qui voit tous les clients). C'est le dashboard **du client final**, scopé strictement à son entreprise.

**Multi-tenant** : un contact RH d'un client n'accède qu'aux données de **son client**, qui appartient à **un seul cabinet**. RLS double : `cabinet_id` (du cabinet) ET `client_id` (du client). Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Pourquoi un module dédié

Le dashboard client mérite sa propre spec parce que :

1. **Surface produit distincte** : public différent (PME, pas fiduciaire), exigences UX différentes
2. **UI réutilisée** entre Onboarding Client et Salaire mensuel
3. **Sécurité spécifique** : RLS stricte, audit renforcé, données très sensibles
4. **Mobile-first** : beaucoup de contacts RH PME bossent sur téléphone
5. **Branding cabinet** : chaque cabinet a ses couleurs, son logo, qui sont affichés au client

## 3. Authentification et accès

### 3.1 Création du compte
Le compte d'un contact RH client est **toujours créé par le cabinet** (jamais en self-service par le client final) :

- Lors de l'onboarding client, le cabinet ou le client crée l'entrée `crm.contact` avec `est_contact_rh = true`
- À ce moment, un `salaire.acces_client` est créé avec `token_activation` unique
- Email envoyé au contact avec lien d'activation
- Au clic du contact :
  - Page de création de mot de passe
  - Création `auth.users` Supabase
  - Lien `salaire.acces_client.auth_user_id` posé
  - `app_metadata.role = 'client_contact'` et `app_metadata.client_id = ...` injectés dans le JWT
  - Redirection vers le dashboard

### 3.2 Connexion ultérieure
- URL : `https://app.zarya.ch/login`
- Saisie email + mot de passe
- 2FA optionnelle (recommandée pour les RH avec accès données salariales)
- Session 24h (configurable par le cabinet)
- Reset de mot de passe par email signé

### 3.3 Périmètre de visibilité
**Strict** : un contact RH voit uniquement les ressources liées à `salaire.acces_client.client_id`.

Plusieurs contacts RH possibles par client (cas réel : RH + assistant RH + dirigeant) — tous voient les **mêmes données**, peuvent éditer.

### 3.4 Multi-clients pour un même contact
Un cas particulier à anticiper : un comptable freelance qui travaille pour 3 PME, chacune cliente d'un cabinet ZARYA.

**MVP** : pas supporté. Un email = un compte = un client unique. Le freelance doit utiliser des emails différents.

**Phase 2** : possibilité de switcher entre plusieurs clients depuis un même compte (comme le mode "espaces" de Slack).

## 4. Structure de l'interface

### 4.1 Header global
- Logo du **cabinet fiduciaire** (pas ZARYA) en haut à gauche
- Nom de l'entreprise du contact à côté
- Avatar + menu user en haut à droite (préférences, déconnexion)
- Couleurs du cabinet appliquées (CSS variables)

### 4.2 Navigation latérale (desktop) ou bottom tab (mobile)
- 🏠 Accueil
- 💼 Mon entreprise (fiche CRM consultable)
- 👥 Mes employés (si service salaire actif)
- 📅 Validations en cours
- 📄 Mes documents transmis
- 💬 Contact cabinet
- ⚙️ Paramètres

### 4.3 Footer
- Lien CGU, politique de confidentialité
- "Propulsé par ZARYA" (discret, link vers zarya.ch)
- Version applicative pour le support

## 5. Page Accueil

### 5.1 Bloc principal — Action prioritaire
Affichage contextuel selon l'état :

**Cas 1 : Onboarding non terminé**
```
┌────────────────────────────────────────┐
│ 👋 Bienvenue, [Prénom]                 │
│                                        │
│ Pour commencer, complétons les infos   │
│ de [Nom entreprise].                   │
│                                        │
│ [Continuer l'onboarding] (75% fait)    │
└────────────────────────────────────────┘
```

**Cas 2 : Validation salaire à faire**
```
┌────────────────────────────────────────┐
│ 📅 Validation de mai 2026              │
│                                        │
│ Veuillez valider les salaires du mois  │
│ avant le 20 mai.                       │
│                                        │
│ 3 changements depuis avril détectés.   │
│                                        │
│ [Valider la période]                   │
└────────────────────────────────────────┘
```

**Cas 3 : Tout à jour**
```
┌────────────────────────────────────────┐
│ ✅ Tout est à jour                     │
│                                        │
│ Prochaine validation salaires :        │
│ 20 juin 2026                           │
└────────────────────────────────────────┘
```

### 5.2 Bloc secondaire — Activité récente
Liste des 5 derniers événements visibles client :
- "Le 12 mai, [Gestionnaire cabinet] a complété la période d'avril"
- "Le 8 mai, vos employés d'avril ont été validés"
- "Le 3 mai, nouveau document reçu de votre cabinet"

### 5.3 Bloc tertiaire — Contact cabinet
- Nom et photo du responsable cabinet
- Email + téléphone
- Bouton "Envoyer un message" (Phase 2)

## 6. Page Mon entreprise

Lecture + édition des informations CRM du client :

- **Identité** : raison sociale, IDE, TVA, forme juridique
- **Adresses** : siège, facturation, postale
- **Contacts internes** : liste des contacts RH/dirigeants enregistrés
- **Services souscrits** : badges des services actifs (lecture seule)
- **Préférences communication** : canal préféré, langue

**Restrictions** :
- Pas de modification des services (responsabilité cabinet)
- Pas de modification du responsable cabinet attribué
- Champs sensibles (mandat, tarification) **invisibles**

Édition : sauvegarde automatique, log dans `crm.evenement` (type = `client_modifie_fiche`).

## 7. Page Mes employés

Visible uniquement si service `salaires` actif pour ce client.

### 7.1 Vue tableau
Liste des employés actifs avec colonnes :
- Photo / initiales
- Nom complet
- Fonction
- Date d'entrée
- Salaire de base (visible)
- Taux d'activité
- Statut (actif / sorti)

Filtres : actifs uniquement / tous / sortis. Recherche par nom.

### 7.2 Vue détail employé
Au clic sur une ligne :
- Toutes les infos Swissdec-ready (lecture)
- Bouton "Modifier" → édite via le même formulaire que l'onboarding
- Section "Changements récents" (historique des modifications)
- Section "Périodes salaire" (récap par mois)

### 7.3 Actions
- **Ajouter un employé** → ouvre wizard d'ajout (entrée prochaine période)
- **Marquer un départ** → wizard de sortie avec date d'effet
- **Modifier salaire** → wizard de changement avec date d'effet

Toutes ces actions créent des entrées dans `salaire.changement` qui seront appliquées au référentiel à la prochaine validation de période.

## 8. Page Validations en cours

### 8.1 Période courante
Carte principale : la période du mois en cours à valider.

**Pré-requis affiché** :
- Date limite
- Pré-rempli depuis M-1 : "12 employés repris d'avril"
- Changements suggérés : "Détection IA : possible augmentation pour Marie Martin (à confirmer)"

**Bouton principal** : "Compléter la validation" → ouvre le tableau employés × éléments paie.

### 8.2 Tableau de saisie
Spec détaillée dans [`/docs/modules/salaire.md` § 7.4](./salaire.md).

**Comportement clé** : édition partagée client/fiduciaire (qui édite en dernier gagne), avec affichage de l'auteur de la dernière modification.

### 8.3 Périodes passées
Liste verticale des périodes clôturées, en lecture seule.

Au clic sur une période passée : vue détail (employés × éléments, validation, exports générés).

## 9. Page Mes documents transmis

Liste des documents que le client a transmis au cabinet (via dashboard ou email).

Filtres : par catégorie (heures, contrats, certificats, autre), par date.

Pour chaque document :
- Aperçu vignette
- Nom, date d'upload, catégorie
- Statut côté cabinet : "Reçu", "Classé", "En attente de traitement"
- Bouton de téléchargement

**Pas d'accès aux documents générés par le cabinet** (factures envoyées au client → ça vit dans l'email du client, pas dans ZARYA). À discuter Phase 2.

## 10. Page Contact cabinet

Affiche les informations du cabinet et du gestionnaire attribué :
- Logo cabinet
- Coordonnées cabinet (adresse, téléphone, email)
- Photo et coordonnées du responsable
- Horaires d'ouverture (saisis par le cabinet à l'onboarding)
- Bouton "Demander un appel" (envoie une notification au cabinet)

**Phase 2** : messagerie intégrée bidirectionnelle.

## 11. Page Paramètres

### 11.1 Profil utilisateur
- Prénom, nom, fonction
- Email (changement = vérification)
- Téléphone
- Photo
- Langue d'interface
- Préférences notifications (email récap quotidien/hebdo, alertes urgentes)

### 11.2 Sécurité
- Changement de mot de passe
- Activation 2FA
- Sessions actives (avec possibilité de révoquer)
- Historique des connexions (30 derniers jours)

### 11.3 Données personnelles (RGPD/nLPD)
- Bouton "Exporter mes données" → ZIP avec tout ce que ZARYA détient sur le compte
- Bouton "Supprimer mon compte" → workflow guidé (le compte revient au cabinet, qui décide)

## 12. UX clés transverses

### 12.1 Mobile-first
Beaucoup de contacts RH consultent sur téléphone (notification email → tap → mobile web).

- Tous les écrans testés sur écran 375px (iPhone SE)
- Tableau employés → vue carte verticale sur mobile
- Validation salaire → wizard étape par étape sur mobile (pas tableau)
- Navigation par bottom tab

### 12.2 Microcopy sans jargon
Le contact RH n'est **pas comptable**. Microcopy à adapter :
- "Indemnités forfaitaires" → "Remboursements (km, repas)"
- "Variables" → "Bonus et primes ponctuelles"
- "Décompte AVS" → "Récap des cotisations sociales"

### 12.3 Sauvegarde automatique
Toutes les modifications sont **sauvegardées en temps réel**. Pas de bouton "Save" global.

Affichage discret en bas : "✓ Sauvegardé il y a 2 secondes".

### 12.4 Validation 1-clic quand possible
- "Rien à signaler ce mois" → bouton qui valide la période en 1 clic
- "Tout comme le mois dernier" → idem

### 12.5 Confirmation des actions destructives
Pour tout ce qui est irréversible (validation période, marquer départ employé) :
- Modal de confirmation avec récap
- Bouton primaire ≠ couleur de l'action principale (orange/rouge selon gravité)
- Pas de double-click destructeur

### 12.6 Indication d'origine des données
À chaque champ pré-rempli : indication discrète de la source.
- "Repris d'avril" (pré-rempli M-1)
- "Modifié par [Nom gestionnaire cabinet]" (édition fiduciaire)
- "Détecté automatiquement depuis votre contrat" (extraction IA)

### 12.7 Notifications email maîtrisées
**Maximum 1 email par jour** au contact RH (digest). Pas de spam.

Types :
- Notification de validation requise (1 fois par cycle)
- Relance gentille J-3 (1 fois si pas validé)
- Confirmation de validation reçue (1 fois quand validé)
- Modification par le cabinet (1 fois, optionnel)

Possibilité de désactiver chaque type dans les paramètres.

## 13. Sécurité spécifique

### 13.1 RLS Postgres
Pattern stricte (voir [`/docs/architecture/multi-tenant.md` § 5.3](../architecture/multi-tenant.md)) :

```sql
-- Le contact RH ne voit QUE son client_id
CREATE POLICY "client_contact_isolation" ON salaire.periode
  FOR ALL
  USING (
    client_id IN (
      SELECT client_id FROM salaire.acces_client
      WHERE auth_user_id = auth.uid() AND actif = true
    )
  );
```

Appliquée à : `salaire.periode`, `salaire.employe`, `salaire.element_paie`, `salaire.absence`, `salaire.changement`, `salaire.piece`, `salaire.validation`, `crm.client` (vue limitée), `crm.contact` (uniquement les autres contacts du même client).

### 13.2 Champs invisibles au client
**Jamais exposés** au contact RH client :
- Notes internes du gestionnaire cabinet
- Identité du gestionnaire fiduciaire attribué (sauf si explicitement partagée)
- Tarification, mandats, honoraires
- Score de risque CRM
- Anomalies factures détectées
- Audit logs internes
- Données des autres clients du même cabinet
- Données du cabinet lui-même

Solution : **vues filtrées dédiées** (`v_dashboard_client_*`) qui n'exposent que les colonnes appropriées. Jamais d'accès direct aux tables pour ce rôle.

### 13.3 Audit renforcé
Chaque accès au dashboard client est loggué :
- Connexion (IP, user agent)
- Navigation entre pages
- Modification de données
- Téléchargement de documents
- Validation de période

Le cabinet peut consulter cet audit sur la fiche client. Transparence pour le client (visibilité de son propre audit).

### 13.4 Chiffrement
Données sensibles (AVS, IBAN, salaire) :
- Chiffrement at rest standard Supabase
- Chiffrement applicatif additionnel via Supabase Vault sur les champs ultra-sensibles
- Pas affiché en clair sans déchiffrement explicite (Phase 2 : masquage partiel par défaut)

## 14. États de l'utilisateur

Selon l'état de son entreprise et de l'onboarding :

| État | Ce que voit le contact RH |
|---|---|
| Compte créé, première connexion | Wizard d'onboarding client forcé (bloquant) |
| Onboarding incomplet, retour en session | Reprend là où il s'était arrêté |
| Onboarding terminé, période courante à valider | Accueil avec validation comme action prioritaire |
| Onboarding terminé, tout validé | Accueil tranquille, prochaine échéance affichée |
| Compte suspendu (cabinet a retiré l'accès) | Message "Votre accès a été suspendu, contactez votre cabinet" |
| Service salaire désactivé | Onglet "Mes employés" et "Validations" cachés |

## 15. Métriques à instrumenter

### 15.1 Adoption
- Taux de contacts RH qui activent leur compte (clic sur magic link / ouverture email)
- Taux de connexion mensuelle
- Temps moyen passé par session
- Taux d'utilisation mobile vs desktop

### 15.2 Productivité
- Temps moyen pour valider une période (objectif < 5 min)
- Taux de validation à J vs en retard
- Taux d'utilisation du bouton "Rien à signaler"
- Nb de modifications après pré-remplissage

### 15.3 Engagement
- % de cabinets dont au moins 80% des clients sont actifs sur le dashboard
- Net Promoter Score auprès des contacts RH (Phase 2)
- Volume de tickets support liés au dashboard client

## 16. Stack technique

### 16.1 Frontend
- **Framework** : Next.js 15+ avec App Router
- **Composants** : shadcn/ui (cohérence avec dashboard fiduciaire)
- **CSS** : Tailwind avec CSS variables pour le branding cabinet
- **State** : React Query pour le data fetching, Zustand pour l'état local
- **Mobile** : Progressive Web App (manifest, service worker basique)
- **i18n** : next-intl avec FR/DE/IT

### 16.2 Backend
- **API** : Routes Next.js (server actions ou route handlers)
- **DB** : Supabase Postgres avec RLS
- **Auth** : Supabase Auth (login email/mdp + magic link pour activation)
- **Storage** : Supabase Storage pour les uploads documents

### 16.3 Performance
- SSR pour les pages statiques (Accueil, Mon entreprise)
- CSR pour les pages interactives (Validations en cours)
- Cache aggressif pour les ressources statiques
- Lazy-loading des composants lourds (tableau employés avec virtualization)

## 17. Hors-scope MVP

- Messagerie bidirectionnelle client ↔ cabinet
- Notifications push (mobile native ou web push)
- App mobile native (iOS / Android)
- Multi-clients pour un même contact (switch d'espace)
- Personnalisation client (préférences UI au-delà de la langue)
- Mode hors-ligne (PWA avancée)
- Signature électronique de documents
- Paiement en ligne (factures du cabinet réglées via le dashboard)
- Branding cabinet ultra-personnalisé (CSS custom, polices, etc.)
- Module "Mes employés" visible aux employés eux-mêmes (employee self-service)

## 18. Questions ouvertes

- [ ] **Durée de session** : 24h par défaut, configurable par cabinet ?
- [ ] **2FA obligatoire ou optionnelle** ? Si optionnelle, à quel moment la suggérer ?
- [ ] **Politique de mot de passe** : longueur minimale, complexité ?
- [ ] **Magic link** comme alternative au mot de passe (à la Notion) — plus moderne mais moins familier ?
- [ ] **Custom domain** par cabinet (ex. dashboard.cabinet-x.ch) ? Ou tous sur app.zarya.ch ?
- [ ] **Politique de suppression** : que se passe-t-il si le contact RH supprime son compte mais le cabinet veut garder l'historique ?
- [ ] **Téléchargement des données du cabinet** : que peut télécharger un client (extraits comptables, factures émises) ?
- [ ] **Affichage des frais et factures** que le cabinet émet au client (Phase 2 ?)
- [ ] **Accessibilité (WCAG)** : niveau visé (A, AA, AAA) ?
- [ ] **Test utilisateurs** : à organiser dès la maquette pour valider la simplicité
