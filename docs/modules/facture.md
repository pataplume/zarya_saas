---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
module: facture
depends_on: [crm, multi-tenant, doc, extraction-ia, payroll-integration]
referenced_by: [doc]
---

# Zarya Facture — Extraction et export de factures

## 1. Rôle dans le produit

**Zarya Facture** automatise le traitement des **factures fournisseurs** reçues par les clients du cabinet : extraction des champs, détection des anomalies, validation 1-clic, export vers le logiciel comptable.

C'est le module qui résout la douleur n°4 de Julie : "Je ressaisis les factures dans 2 logiciels".

**Promesse produit** : passer de 5 minutes par facture (lecture + saisie + vérification) à 30 secondes (validation 1-clic).

**Scope MVP** : factures **fournisseurs des clients** (ce qu'une PME doit payer). Pas les factures émises par les clients (vente) — Phase 2.

**Multi-tenant** : factures scopées par `cabinet_id` ET `client_id`. Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Cycle de vie d'une facture

```
[Facture reçue]
   (via Doc : email PJ, NAS, upload, dashboard client)
        ↓
[Détection type = facture]
   (par module Doc lors du classement)
        ↓
[Pipeline d'extraction Facture]
   - OCR si scan
   - Extraction structurée des champs (15+ champs)
   - Détection des anomalies
   - Détection des doublons
        ↓
[proposition_facture créée]
   - Avec confiance par champ
   - Bbox sources surlignées (PDF natif)
        ↓
[Validation humaine]
   - 1-clic si tout OK
   - Correction sur champs ambigus
        ↓
[facture.facture créée]
        ↓
[Export vers logiciel comptable]
   - CSV/Excel/API selon config cabinet
        ↓
[Statut payée éventuellement remonté]
   - Quand confirmation de paiement reçue (relevé bancaire)
```

## 3. Champs extraits

### 3.1 Identité du fournisseur
- Raison sociale
- IDE (CHE-...)
- Numéro TVA
- Adresse complète
- IBAN de paiement
- BIC
- QR-IBAN (QR-facture suisse)

### 3.2 Identité du client (PME)
- Raison sociale (vérification cohérence avec `crm.client`)
- IDE
- Adresse de facturation
- Référence client interne (si présente)

### 3.3 Détails de la facture
- Numéro de facture
- Date d'émission
- Date d'échéance (date limite de paiement)
- Référence (numéro de commande, contrat)
- Devise (CHF par défaut, EUR/USD possibles)

### 3.4 Montants
- Total HT
- Taux de TVA (potentiellement multiple)
- Montant TVA
- Total TTC
- Montant à payer (peut différer du total si acompte versé)

### 3.5 Lignes de détail (Phase 1.5)
- Description ligne
- Quantité
- Prix unitaire
- Taux TVA spécifique
- Total ligne

MVP : extraction du total uniquement. Lignes de détail = Phase 1.5.

### 3.6 Métadonnées
- Catégorie comptable suggérée (achat marchandises, services, télécoms, énergie...)
- Compte comptable suggéré (selon plan comptable du client)
- Affectation analytique (si activée)

## 4. Pipeline d'extraction

### 4.1 Réutilisation du module Extraction IA
Voir [`extraction-ia.md`](./extraction-ia.md) pour l'architecture générique.

Configuration spécifique facture :
- Contexte : `facture`
- Modèle : Claude Sonnet 4.6 (précision critique sur les montants)
- OCR : Mistral OCR pour scans
- Schéma cible : `FactureSchema` (Zod, 15+ champs)
- Détection doublons : par `fournisseur_id + numero_facture`

### 4.2 Pre-processing PDF
- Détection si PDF natif (texte directement extractible) ou scan
- Si natif : extraction texte + position (bbox) directement
- Si scan : OCR via Mistral, perte des bbox précises

### 4.3 Bbox source pour validation
Quand possible (PDF natif), chaque champ extrait pointe vers sa position dans le PDF original.

UX bénéfique : lors de la validation, surlignage du PDF → l'utilisateur voit immédiatement d'où vient chaque chiffre.

### 4.4 Cas QR-facture suisse
Format standard suisse depuis 2022. Très structuré :
- QR code en bas de la facture avec toutes les infos
- Décodage direct (pas besoin d'IA) → fiabilité ~100%

ZARYA détecte la présence d'un QR-facture en priorité. Si trouvé : décodage direct, IA appelée uniquement pour les champs hors QR (catégorie, etc.).

## 5. Détection d'anomalies

### 5.1 Règles métier
- TVA cohérente (HT + TVA = TTC ± 0.01 CHF)
- IBAN format valide (checksum mod-97)
- IDE format valide (checksum mod-11)
- Date d'échéance future ou récente (pas 2010)
- Montant > 0 et < 10M CHF (alerte si > 100K)
- Devise reconnue
- Taux TVA suisse valide (0%, 2.6%, 3.8%, 8.1% en 2026)

### 5.2 Cohérence avec l'historique
- Fournisseur jamais vu → flag "nouveau fournisseur"
- Montant inhabituel vs historique du même fournisseur (×2 ou plus) → alerte
- Fréquence inhabituelle (2 factures du même fournisseur dans le mois alors que mensuel d'habitude)

### 5.3 Détection de fraude
- Changement d'IBAN d'un fournisseur connu → alerte forte (fraude au RIB)
- Domaine email expéditeur incohérent avec l'identité fournisseur prétendue
- URL/coordonnées suspectes

Les alertes sont affichées dans la validation, le collaborateur décide.

### 5.4 Détection de doublons
Algorithme :
1. Match exact : `fournisseur_id + numero_facture + montant`
2. Match probable : `fournisseur_id + montant + date_emission ± 3 jours`
3. Match flou : similarité montant + dates proches

Si doublon détecté : proposition de fusion ou rejet, avec lien vers la facture existante.

## 6. Validation humaine

### 6.1 Interface de validation
Vue principale split-screen :

```
┌──────────────────────┬───────────────────────────┐
│                      │ Fournisseur :             │
│                      │ Swisscom (Schweiz) AG  ✏️ │
│                      │ IDE: CHE-101.654.232      │
│   [PDF original      │                           │
│    avec bbox         │ Montant TTC : 245.80 CHF  │
│    surlignées]       │ TVA 8.1% : 18.45 CHF      │
│                      │ Total HT : 227.35 CHF     │
│                      │                           │
│                      │ Échéance : 30.06.2026     │
│                      │ IBAN : CH93 0076 ...    ✏️│
│                      │                           │
│                      │ ⚠️ Nouveau fournisseur    │
│                      │                           │
│                      │ [✓ Valider] [⏭ Plus tard] │
└──────────────────────┴───────────────────────────┘
```

### 6.2 Validation 1-clic
Si tous les champs critiques ont une confiance > 95% et qu'aucune anomalie majeure n'est détectée : validation 1-clic possible.

### 6.3 Correction
Au clic sur un champ : édition inline. La correction est utilisée comme feedback pour améliorer le modèle.

### 6.4 Validation en lot
Pour les factures très standards (même fournisseur, même client, format identique) :
- Sélection multiple → "Valider tout"
- Confirmation si > 10 factures

### 6.5 Rejet
Possibilité de rejeter une "facture" mal détectée (ce n'était pas une facture). Le document retourne dans la file Doc pour reclassification.

## 7. Export vers logiciel comptable

### 7.1 Stratégie par logiciel

| Logiciel | Stratégie MVP | Stratégie cible |
|---|---|---|
| Bexio Compta | Export CSV au format Bexio | API Bexio (Phase 2) |
| Crésus | Export Crésus-compatible | Pas d'API publique |
| Abacus | Export XML standard | Connecteur partenaire (Phase 3) |
| WinBIZ | Export CSV | Pas d'API |
| Banana | Export TSV | Plugin Banana (Phase 2) |
| Excel maison | Export Excel formaté | — |

Voir [`payroll-integration.md`](../architecture/payroll-integration.md) pour les détails techniques (le doc couvre paie ET compta).

### 7.2 Mapping des champs
Chaque cabinet configure une fois pour toutes le mapping :
- Compte fournisseur par catégorie
- Compte de charge par catégorie
- Compte TVA selon taux
- Centre de coût par client (si analytique activée)

Mapping appliqué automatiquement à chaque facture validée.

### 7.3 Cycle d'export
Deux options par cabinet :
- **Au fil de l'eau** : chaque facture validée est exportée immédiatement
- **En lot** : export hebdomadaire ou mensuel

Le mode "lot" est souvent préféré pour grouper les saisies dans le logiciel comptable.

### 7.4 Status de paiement
**Phase 2** : suivi du statut de paiement.

Sources possibles :
- Relevé bancaire (matching montant + IBAN + date)
- Confirmation manuelle par le cabinet
- Intégration banque (open banking)

Status possibles :
- `recu` : facture en attente de validation
- `validee` : validée par le cabinet
- `exportee` : poussée vers le logiciel comptable
- `payee` : paiement confirmé
- `litigieuse` : contestation en cours
- `annulee` : facture invalidée (avoir reçu)

## 8. Modèle de données

Voir [`facture-schema.md`](../data-model/facture-schema.md) (à créer sprint suivant).

Tables principales :
- `facture.facture` : la facture validée
- `facture.proposition_facture` : extraction IA en attente
- `facture.ligne_detail` : lignes de détail (Phase 1.5)
- `facture.fournisseur` : référentiel fournisseur (cabinet × client_pme)
- `facture.mapping_export` : mapping vers logiciel comptable

## 9. Référentiel fournisseur

### 9.1 Création automatique
Au premier rencontre d'un fournisseur sur les factures d'un client PME :
- Création d'une entrée `facture.fournisseur`
- Champs : IDE, raison sociale, IBAN principal, taux TVA habituel, catégorie habituelle

### 9.2 Enrichissement progressif
À chaque nouvelle facture du même fournisseur :
- Confirmation des champs habituels
- Détection d'anomalies par rapport à l'historique
- Apprentissage des patterns (catégorie suggérée plus précise)

### 9.3 Partage entre clients du cabinet
Un même fournisseur (ex: Swisscom) apparaît chez plusieurs clients du cabinet.

**Décision** : référentiel par couple (cabinet, fournisseur), pas global ZARYA.
- Évite les biais de matching
- Permet aux cabinets d'avoir des règles différentes pour le même fournisseur réel

## 10. Performance et volumétrie

### 10.1 Volumes typiques
- 30-100 factures par client par mois
- 50-200 clients par cabinet
- Total : 1500-20000 factures par cabinet par mois

### 10.2 Latences cibles
- Extraction d'une facture : 5-15 secondes (Sonnet + OCR éventuel)
- Affichage en file de validation : < 30 secondes après réception
- Export logiciel : asynchrone, batch nightly par défaut

### 10.3 Optimisations
- **Cache d'extraction** : facture déjà vue (hash) → réutilisation directe
- **Batch d'extraction** : factures du même fournisseur du même jour → 1 seul appel LLM (Phase 2)
- **Pre-warming** des modèles Bedrock (provisioned throughput pour gros cabinets)

## 11. Sécurité

### 11.1 Données sensibles
- IBAN traité comme donnée sensible (Supabase Vault)
- Montants accessibles uniquement aux rôles autorisés
- Audit complet sur tous les accès

### 11.2 RLS
Pattern multi-tenant standard + filtre par `client_id` selon le rôle :
- Membre cabinet : voit tout son cabinet
- Contact RH client : voit uniquement les factures de son client (Phase 2 — pas exposé MVP)

### 11.3 Anti-fraude
Voir § 5.3. Alertes affichées dans l'UI mais pas de blocage automatique (décision humaine).

## 12. Intégration avec autres modules

### 12.1 Module Doc
- Réception des factures depuis Doc (classement initial)
- Le pipeline Facture est déclenché automatiquement quand type = facture
- Retour de signal vers Doc si rejet (mauvaise classification)

### 12.2 Module CRM
- Mise à jour `crm.evenement` pour chaque facture validée
- Recalcul `crm.risque` si anomalies fréquentes
- Statistiques par client : volume mensuel, top fournisseurs, ratio anomalies

### 12.3 Module Search
- Indexation du contenu de la facture
- Recherche : "trouve toutes les factures Swisscom de Q1"
- RAG : "combien Dupont SA a-t-il dépensé en télécom en 2025 ?"

### 12.4 Module Calendar
- Date d'échéance facture → création d'une échéance "à payer"
- Alerte si échéance imminente sans paiement détecté

## 13. UX et productivité

### 13.1 Vue principale
- Liste filtrable des factures (état, client, fournisseur, montant, date)
- File de validation prioritaire en haut
- Bouton "Tout valider OK" pour les batches simples

### 13.2 Raccourcis (pour Julie)
- **F** : aller à la file de factures
- **V** : valider la facture sélectionnée
- **R** : rejeter
- **Cmd/Ctrl + clic sur champ** : édition rapide

### 13.3 Mobile
**Phase 2**. MVP focus desktop pour la validation (besoin d'écran large pour le split PDF/données).

## 14. Côté client final (Phase 2)

**Hors-scope MVP** : exposition des factures dans le dashboard client.

Phase 2 : le contact RH client pourrait voir ses factures validées et leur statut de paiement. Utile pour les PME qui veulent suivre leurs charges en temps réel.

## 15. Hors-scope MVP

- **Factures de vente** (émises par le client) : Phase 2
- **Connecteur API Bexio Compta** : Phase 2
- **Connecteurs natifs autres logiciels** : Phase 3
- **Paiement intégré** (générer ordres de paiement bancaires depuis ZARYA) : Phase 3
- **Workflow de validation multi-niveaux** (dirigeant client valide, puis cabinet) : Phase 2
- **OCR multi-pages avancé** (factures de 10+ pages avec annexes)
- **Reconnaissance de factures non-standard** (notes de frais manuscrites)
- **Comptabilisation par projet/affaire** : Phase 2
- **Détection automatique des avoirs** (notes de crédit)

## 16. Questions ouvertes

- [ ] **Niveau de granularité d'extraction MVP** : juste totaux ou aussi lignes de détail ?
- [ ] **Stratégie pour le QR-facture** : décodage direct uniquement OU vérification IA en plus ?
- [ ] **Politique fournisseur** : un seul fournisseur partagé par cabinet (Swisscom = 1 entrée) ou par couple (cabinet, client_pme) ?
- [ ] **Délai d'export** : au fil de l'eau ou batch ? Default ?
- [ ] **Connecteur Bexio Compta** : prioriser Phase 1 ou Phase 2 ?
- [ ] **Format CSV générique** : un format unique ou un par logiciel ?
- [ ] **Anti-fraude IBAN** : bloquer ou juste alerter quand IBAN change ?
- [ ] **Affichage côté client final** : MVP ou Phase 2 ?
- [ ] **Stockage du PDF original** : combien de temps après export ?
- [ ] **Plan comptable client** : import standard ou saisie manuelle obligatoire ?
