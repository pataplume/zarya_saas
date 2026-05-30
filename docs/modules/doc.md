---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
module: doc
depends_on: [crm, multi-tenant, extraction-ia, microsoft-integration, nas-ingestion]
referenced_by: [calendar, facture, search, salaire, onboarding-client]
---

# Zarya Doc — Inbox documentaire

## 1. Rôle dans le produit

**Zarya Doc** est le **point d'entrée unifié** de tous les documents qui arrivent dans le cabinet fiduciaire. Email, NAS, upload manuel, dashboard client : tout converge ici, est classé automatiquement par l'IA, et alimente le CRM.

C'est le module qui transforme la **corvée du tri quotidien** (la douleur n°1 de Julie) en un **flux maîtrisé** où l'humain ne fait que valider.

**Promesse produit** : recevoir 100 documents par jour et n'avoir à intervenir manuellement que sur 10-20 (les cas ambigus).

**Multi-tenant** : tous les documents sont scopés par `cabinet_id`. Un cabinet ne voit jamais les documents d'un autre. Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Sources d'entrée

Quatre canaux d'ingestion possibles, tous convergeant vers la même inbox unifiée.

### 2.1 Email Microsoft 365
- Source principale (70-80% du volume)
- Webhook Graph API → ingestion temps réel
- Extraction du corps + pièces jointes
- Voir [`microsoft-integration.md`](../architecture/microsoft-integration.md) pour le détail technique

### 2.2 NAS (lecture)
- Scan périodique des dossiers configurés
- Détection des nouveaux fichiers via timestamps
- Voir [`nas-ingestion.md`](../architecture/nas-ingestion.md)

### 2.3 Upload manuel
- Drag & drop dans l'interface ZARYA
- Le collaborateur peut associer manuellement le client/type au moment de l'upload
- Pratique pour les documents reçus en main propre ou par courrier

### 2.4 Dashboard client
- Le contact RH/dirigeant uploade ses documents directement
- Pré-association automatique au bon client (puisque le user est authentifié pour ce client)
- Voir [`dashboard-client.md`](./dashboard-client.md)

## 3. Pipeline de traitement

```
[Document entrant — source N]
        ↓
[1. Ingestion : persistance brute]
        ↓
[2. Identification du document]
   - Hash de contenu (déduplication)
   - Type MIME
   - Taille
        ↓
[3. OCR si nécessaire]
   (PDF scannés, images)
        ↓
[4. Pipeline Extraction IA — contexte 'classification_doc']
   - Détection du type de document
   - Identification du client rattaché
   - Détection de la période
   - Extraction de métadonnées clés
        ↓
[5. Création proposition_classement]
   - confiance_globale + détail par champ
   - anomalies détectées
        ↓
[6. Application automatique OU mise en file de validation]
   - Si confiance > seuil (configurable) → auto-classement
   - Sinon → file "à valider" pour Julie
        ↓
[7. Création doc.document final]
   - Lien avec crm.client, crm.document_attendu
   - Renommage standardisé selon convention cabinet
   - Rangement dans la structure NAS (si NAS configuré)
        ↓
[8. Effets de bord]
   - Mise à jour statut document_attendu
   - Recalcul du score de risque client
   - Notification gestionnaire si urgent
   - Indexation Search
```

## 4. Classification : types de documents

### 4.1 Taxonomie standard ZARYA
Types fournis par défaut, hérités par tous les cabinets :

**Bancaires** : relevé bancaire, justificatif de virement, ordre de paiement

**Fiscaux** : déclaration TVA, déclaration impôt entreprise, déclaration impôt employé, certificat de salaire, attestation de revenu, demande de renseignement AFC

**Salaires** : contrat de travail, avenant, certificat médical, attestation employeur, décompte salaire, fiche salariale, déclaration AVS

**Commerciaux** : facture fournisseur, facture client, devis, bon de commande, bon de livraison

**Administratifs** : courrier officiel, statut, extrait RC, certificat d'inscription, procuration, mandat

**Autre** : non classifié, à classer manuellement

### 4.2 Extension par cabinet
Chaque cabinet peut **ajouter ses propres types** custom dans `crm.cabinet_type_document`. Voir [`crm-schema.md`](../data-model/crm-schema.md).

L'IA est ré-entraînée (côté prompt) avec les nouveaux types au prochain cycle.

### 4.3 Multi-typage
Un document peut avoir **plusieurs types** dans certains cas :
- Un PDF qui contient un contrat + un avenant
- Un email avec PJ multiples de types différents

Solution : le pipeline crée **N propositions** pour un même email/document parent. Chaque PJ est traitée indépendamment.

## 5. Rattachement client

### 5.1 Méthodes de détection (par ordre de priorité)

**1. Signal explicite**
- Subject d'email contient le nom/IDE/numéro client
- Nom de fichier contient ces signaux
- Adresse email de l'expéditeur connue dans `crm.contact`

**2. Contenu du document (extraction IA)**
- IDE détecté dans le PDF
- Raison sociale détectée
- Numéro de référence client (configuré par le cabinet)

**3. Contexte de l'expéditeur**
- Email vient d'un domaine connu dans `crm.client.domaines_emails`
- Le contact est lié à un client unique

**4. Inférence sémantique**
- Type de document × montants × dates → recoupement avec mandats actifs

### 5.2 Gestion de l'incertitude
- **Confiance > 90%** → rattachement auto
- **Confiance 60-90%** → proposition avec validation 1-clic
- **Confiance < 60%** → file "à classer manuellement"

> **Seuils canoniques (ADR 0014)** : ces paliers (0.90 / 0.60, en décimales) régissent la
> **confiance du rattachement client** et sont la source de vérité de B2. Ne pas les
> confondre avec les seuils de `flow-a` §4 (0.95 / 0.80), qui régissent la **politique
> d'auto-classement** (saut de validation) — inactive en MVP `strict`. « Rattachement
> auto » signifie ici *`client_id_propose` pré-rempli pour confirmation 1-clic*, pas un
> saut de la validation humaine (qui reste obligatoire, ADR 0007).

### 5.3 Cas particuliers
- **Plusieurs clients matchent** (homonymes, holding) → propose les top 3, validation humaine
- **Document concerne le cabinet** (facture fournisseur du cabinet) → rattachement au "cabinet lui-même" (entité spéciale)
- **Document personnel** d'un membre du cabinet → exclu automatiquement (anti-fuite vie privée)

## 6. Période de rattachement

### 6.1 Détection
Chaque document est rattaché à une **période** quand pertinent :
- Mois (relevés bancaires, salaires) : `2026-04`
- Trimestre (TVA) : `2026-Q1`
- Année (déclaration fiscale) : `2025`
- Ponctuel (contrat, mandat) : pas de période

### 6.2 Logique IA
- Date détectée dans le titre
- Date détectée dans le contenu
- Date de réception (fallback)
- Cohérence avec le type (un relevé reçu en mai = mois d'avril probable)

### 6.3 Statut période courante
Mise à jour automatique de `crm.document_attendu` :
- Document attendu pour la période courante reçu → statut `recu`
- Document attendu pour une période passée et non reçu → `en_retard`

## 7. Validation humaine

### 7.1 File de validation
Interface principale pour Julie :

```
┌─────────────────────────────────────────────────────┐
│ 📥 À valider (12)              [Tout valider OK]    │
├─────────────────────────────────────────────────────┤
│ ☐ Relevé bancaire — UBS — Client X — Avril 2026     │
│   📎 releve_avril_ubs_x.pdf · reçu 10h12            │
│   [✓ Valider] [✏️ Corriger] [⏭ Plus tard]           │
├─────────────────────────────────────────────────────┤
│ ☐ Facture fournisseur — Swisscom — Client Y         │
│   ⚠️ Anomalie : montant détecté incohérent          │
│   [✓ Valider] [✏️ Corriger] [⏭ Plus tard]           │
└─────────────────────────────────────────────────────┘
```

### 7.2 Validation 1-clic
Si la proposition est correcte sur tous les champs critiques :
- Bouton "Valider" → tout est appliqué
- Effets de bord déclenchés en chaîne

### 7.3 Correction
Si un champ est faux, modal de correction :
- Modifier le client
- Modifier le type
- Modifier la période
- Ajouter une note interne

La correction est utilisée comme **feedback** pour améliorer les prompts (voir [`extraction-ia.md` § 12](./extraction-ia.md)).

### 7.4 Validation en lot
Pour les documents très standards (relevés mensuels d'un client habituel) :
- Sélection multiple
- "Valider tout" → applique en chaîne
- Confirmation modal si > 20 documents

## 8. Renommage et rangement

### 8.1 Convention de nommage
Chaque cabinet définit sa convention dans ses paramètres :

```
{annee}-{mois}_{type}_{client_nom_court}_{libelle_libre}.{ext}
```

Exemple : `2026-04_releve-bancaire_DupontSA_UBS.pdf`

Variables disponibles :
- `{annee}`, `{mois}`, `{trimestre}`
- `{type}` (slug)
- `{client_nom_court}`, `{client_ide}`
- `{libelle_libre}` (extrait IA)
- `{cabinet_compteur}` (numérotation interne)

### 8.2 Rangement NAS (si NAS configuré)
Structure automatique :
```
/cabinet/
  /{annee}/
    /{client_nom_court}/
      /{type_categorie}/
        2026-04_releve-bancaire_DupontSA_UBS.pdf
```

Conventions personnalisables par cabinet.

### 8.3 Stockage Supabase (par défaut)
Si pas de NAS, stockage natif dans Supabase Storage avec la même arborescence logique.

## 9. Recherche et filtres

### 9.1 Vue principale
Tableau des documents avec colonnes :
- Type
- Client
- Période
- Date de réception
- Source (email/nas/upload/dashboard)
- Statut (validé / à valider / archivé)
- Actions

### 9.2 Filtres
- Par client
- Par type
- Par période (range de dates)
- Par statut
- Par source
- Par responsable du client

### 9.3 Recherche full-text
Recherche dans :
- Nom de fichier
- Contenu du document (post-OCR)
- Métadonnées extraites

Recherche sémantique disponible via module [`Search`](./search.md) (Phase 2).

### 9.4 Bulk actions
- Sélection multiple
- Archivage en masse
- Export ZIP
- Re-classification

## 10. Effets de bord sur les autres modules

Chaque document validé déclenche :

### 10.1 Module CRM
- Mise à jour `crm.document_attendu` (statut, date de réception)
- Création d'un `crm.evenement` (type `document_recu`)
- Recalcul du score de risque client

### 10.2 Module Calendar
- Si document attendu pour une échéance proche → marquage de l'échéance comme couverte
- Si dernière pièce manquante → notification "Dossier complet"

### 10.3 Module Facture
- Si type = facture → trigger du pipeline Facture (extraction des champs détaillés)
- Voir [`facture.md`](./facture.md)

### 10.4 Module Salaire
- Si type = certificat médical / contrat / avenant → trigger du pipeline détection de changement
- Voir [`salaire.md`](./salaire.md)

### 10.5 Module Search
- Indexation du contenu post-OCR dans pgvector
- Document immédiatement requêtable

## 11. Auto-classement (configurable)

### 11.1 Niveaux de confiance
Configurable par cabinet, par type de document :
- **Strict** (défaut) : tout passe par validation humaine
- **Hybride** : auto-validation si confiance > 95% sur tous les champs
- **Aggressive** : auto-validation si confiance > 80%

### 11.2 Bypass selon contexte
Certains documents très standards peuvent être pré-configurés en auto :
- Relevés bancaires mensuels du même fournisseur pour le même client
- Confirmations de virement
- Avis de débit/crédit

Apprentissage progressif : après N validations identiques sans correction, ZARYA propose au cabinet de basculer en auto pour ce pattern.

### 11.3 Audit
Tout auto-classement reste **auditable** :
- Loggué dans `crm.evenement` avec `acteur_type = 'ia'`
- Visible dans l'historique du document
- Possibilité de "désautoriser" un pattern à tout moment

## 12. Modèle de données

Voir [`document-schema.md`](../data-model/document-schema.md) (à créer dans un sprint suivant).

Tables principales :
- `doc.email_brut` : ingestion brute des emails
- `doc.upload_brut` : ingestion brute des uploads
- `doc.document` : document final classé
- `doc.proposition_classement` : propositions IA en attente
- `doc.fichier_physique` : référence au fichier dans Supabase Storage / NAS

## 13. Performance et volumétrie

### 13.1 Volumes typiques par cabinet
- 100-500 documents/jour (selon taille)
- Pic en début/fin de mois (relevés)
- Hyper-pic en période fiscale (mars-avril)

### 13.2 Latences cibles
- Ingestion email → proposition affichée : < 30 secondes (perçu temps réel)
- OCR moyen : 5-10 secondes (Infomaniak vision, catégorie `vision` — différé Phase 4.1+)
- Classification IA moyenne : 3-5 secondes (catégorie `chat_small`, résolue au runtime)

### 13.3 Optimisations
- **Cache de classification** : même document hash → réutilisation de la classification
- **Batch processing** : ingestion NAS en lot pour amortir les appels IA
- **Priorisation** : documents urgents (échéance proche) traités en priorité

## 14. Sécurité

### 14.1 Confidentialité
- Documents chiffrés at rest (Supabase Storage)
- Accès strict par RLS (`cabinet_id`)
- Le contact RH client ne voit que les documents qu'il a uploadés (pas ceux du cabinet)

### 14.2 Détection de PII
Si un document contient des données ultra-sensibles (numéros AVS, IBAN, données médicales détaillées), tag automatique pour traçabilité.

### 14.3 Rétention
- Documents conservés 10 ans par défaut (obligation légale fiduciaire)
- Politique de suppression configurable par cabinet
- Hard delete sur demande client (RGPD/nLPD)

## 15. UX et raccourcis

### 15.1 Pour Julie (collaborateur)
- **J** : aller à la file de validation
- **V** : valider le document sélectionné
- **C** : corriger
- **N** : document suivant
- **Cmd/Ctrl + K** : recherche rapide

### 15.2 Mobile (Phase 2)
Vue simplifiée pour validation rapide en mobilité.

### 15.3 Notifications
- Par défaut : récap quotidien par email
- Possibilité d'alertes push pour documents urgents (Phase 2)

## 16. Hors-scope MVP

- **OCR multi-langues exotiques** (japonais, russe) : focus FR/DE/IT/EN
- **Signature électronique** intégrée
- **Versioning fin** des documents (Git-like)
- **Annotations** sur les PDFs (commentaires, surlignages)
- **Comparaison de versions** automatique
- **Workflow d'approbation multi-niveaux** (Phase 2 pour gros cabinets)
- **Import via fax** (lol, on est en 2026)
- **App mobile native** pour upload

## 17. Questions ouvertes

- [ ] **Convention de nommage** : standard ZARYA imposé OU 100% libre par cabinet ?
- [ ] **Stratégie NAS** : lecture-écriture ou lecture seule + copie ?
- [ ] **Documents personnels** des membres cabinet (vacances, justificatifs perso) : comment les exclure proprement ?
- [ ] **Limite de taille** par document : 50 MB ? 100 MB ?
- [ ] **Politique d'archivage** automatique après N mois ?
- [ ] **Détection de doublons** : hash exact suffit ou similarité sémantique nécessaire ?
- [ ] **Performance OCR** sur scans de mauvaise qualité : seuil minimal de qualité ?
- [ ] **Multi-PJ par email** : 1 ligne par PJ ou 1 ligne groupée ?
- [ ] **Re-traitement** : si on améliore les prompts, on re-classe les documents anciens ?
