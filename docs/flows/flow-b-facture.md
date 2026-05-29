---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
flow: B
depends_on: [facture, doc, extraction-ia, payroll-integration, multi-tenant]
referenced_by: [facture]
---

# Flow B — Facture détectée

> Flow utilisateur : un document classé comme facture déclenche le pipeline d'extraction Facture, est validé, puis exporté vers le logiciel comptable du cabinet.
>
> Voir la spec produit complète dans [`/docs/modules/facture.md`](../modules/facture.md).

## Déclencheur
Document classé avec `type LIKE 'facture_%'` (fournisseur principalement au MVP).

Sources : pipeline Flow A (Document entrant) qui détecte un type facture.

## Acteurs
- **Système ZARYA** : extraction structurée, détection anomalies, export
- **Collaborateur cabinet** (Julie) : validation 1-clic
- **Logiciel comptable cible** (Bexio, Crésus, etc.) : récepteur des données

## Pré-requis
- Document validé en classification (Flow A)
- `mapping_export` configuré pour le cabinet (sinon : fallback Excel humain)
- Si Bexio API : intégration OAuth active

## Étapes détaillées

### Étape 1 — Trigger depuis Flow A
Quand un `doc.document` est créé avec `type LIKE 'facture_%'` :
1. Trigger DB ou code applicatif lit le document
2. Création de `facture.proposition_facture` en statut `en_extraction`
3. Lien vers `doc.document` et `extraction.invocation`

### Étape 2 — Pré-processing
1. Détection PDF natif vs scan
2. Si scan : OCR déjà fait au Flow A, réutilisation du texte
3. **Détection QR-facture suisse**
   - Recherche du QR code dans les pages
   - Si présent : décodage direct (fiabilité ~100%)
   - Extraction des champs : IBAN, montant, référence, fournisseur

### Étape 3 — Pipeline d'extraction IA
1. Appel à Extraction IA avec contexte `facture`
2. Modèle : catégorie `chat_large` (résolue au runtime) — précision critique sur montants
3. Schéma cible : `FactureSchema` (15+ champs)
4. Si QR-facture présent : données injectées comme contexte, IA complète les champs manquants
5. Output : champs proposés + bbox sources + confiance par champ

### Étape 4 — Détection d'anomalies
Règles métier appliquées :
- TVA cohérente (HT + TVA = TTC ± 0.05 CHF)
- IBAN format valide (checksum mod-97)
- IDE format valide (checksum mod-11)
- Date d'échéance plausible
- Montant > 0 et < 10M CHF
- Taux TVA suisse valide (0%, 2.6%, 3.8%, 8.1% en 2026)

Cohérence avec historique :
- Fournisseur jamais vu → flag "nouveau fournisseur"
- Montant inhabituel vs moyenne → alerte
- Fréquence inhabituelle → alerte

### Étape 5 — Détection de fraude au RIB ⚠️
Critère critique :
- Si fournisseur connu (match `fournisseur.id` existant)
- ET nouveau IBAN différent du `iban_principal` ou `iban_secondaires`
- → **Alerte forte** affichée dans l'UI
- → Logger dans `audit.cabinet_evenement` (type `alerte_iban_changement`)
- → Validation humaine **obligatoire** (pas d'auto même si politique aggressive)

### Étape 6 — Détection de doublons
Algorithme :
1. Match exact `(cabinet_id, fournisseur_id, numero_facture)` → doublon certain
2. Match probable `(fournisseur + montant + date ± 3 jours)` → flag pour validation
3. Si doublon : proposition de fusion ou rejet avec lien vers facture existante

### Étape 7 — Statut `a_valider`
Création terminée. `proposition_facture.statut = 'a_valider'`.

Apparition dans la file Facture pour Julie via `facture.v_a_valider`.

### Étape 8 — Validation humaine (split-screen)
1. Julie ouvre la proposition
2. UI split-screen :
   - Gauche : PDF original avec bbox surlignées (champs sources)
   - Droite : champs extraits éditables
3. Affichage des anomalies en bandeau coloré
4. 3 actions possibles :
   - **Valider** (1-clic si tout OK)
   - **Corriger** champs et valider
   - **Rejeter** (pas une facture, classement erroné)

### Étape 9 — Validation et création de la facture
À la validation :
1. Si nouveau fournisseur (`fournisseur_existant_id IS NULL`) :
   - Création `facture.fournisseur` avec les données proposées
2. Sinon : update du fournisseur (stats, dernière facture, etc.)
3. Création `facture.facture` finale
4. Trigger 10.2 (`detecter_changement_iban`) déclenché — déjà détecté en étape 5 mais double-check
5. Mise à jour `proposition_facture.statut = 'validee'`, `facture_id` lié
6. `crm.evenement` créé (type `facture_validee`)

### Étape 10 — Export selon configuration
Lookup `facture.mapping_export` pour le cabinet (et éventuellement le client) :

**Cas A : Pattern API (Bexio Compta)**
1. Si mode `au_fil_eau` : export immédiat
2. Si mode `batch_hebdo` ou `batch_mensuel` : ajout à la queue d'export
3. Appel API :
   - `findOrCreateContact(fournisseur)` → récupère/crée contact Bexio
   - `createBill(facture_data)` → crée la facture côté Bexio
4. Stockage `reponse_externe` dans `facture.export`
5. Mise à jour `facture.statut = 'exportee'`

**Cas B : Pattern fichier (Crésus, WinBIZ, Abacus)**
1. Génération du fichier au format spécifique
2. Stockage dans Supabase Storage
3. Notification cabinet : "Fichier d'export disponible"
4. Julie télécharge et importe manuellement dans son logiciel
5. Bouton "Marquer exportée" pour confirmer

**Cas C : Pattern Excel humain (fallback)**
1. Génération d'un Excel formaté
2. Téléchargement par Julie
3. Ressaisie manuelle dans le logiciel cible
4. Bouton "Marquer exportée"

### Étape 11 — Status de paiement (Phase 2)
Hors-scope MVP. En Phase 2 :
- Détection via relevé bancaire matching
- OU confirmation manuelle cabinet
- Mise à jour `facture.statut = 'payee'`

## Cas d'erreur

| Cas | Comportement |
|---|---|
| Extraction IA échoue | Validation 100% manuelle, tous les champs vides |
| QR-facture corrompu | Fallback extraction IA standard |
| Doublon avec facture déjà payée | Alerte, validation humaine obligatoire |
| Export API Bexio échoue | Retry x3, puis statut `export_echec`, notification cabinet |
| Token Bexio expiré | Refresh auto, si échec → message "Reconnectez Bexio" |
| Fournisseur ambigu (homonymes) | Validation humaine forcée |
| TVA incohérente | Anomalie signalée, validation humaine recommandée |

## Cas particuliers

### Facture avec acompte
Le `montant_a_payer` peut différer du `total_ttc` (acompte déjà versé). Extraction de la mention "Acompte versé : X CHF" puis calcul.

### Facture multi-devise
Si devise ≠ CHF : `taux_change` à appliquer. Récupération du taux du jour d'émission via API tierce (Phase 2) ou saisie manuelle.

### Avoir (note de crédit)
Type `avoir`. Montants en négatif côté compta. Mapping spécifique dans `mapping_export`.

### Facture multi-pages avec annexes
OCR sur toutes les pages. Extraction IA sur le contenu pertinent (page facture, pas les conditions générales).

### Facture en pièce jointe d'un email avec corps non vide
Le corps de l'email peut contenir des infos contextuelles (référence interne, contact). Stocké dans `doc.email_brut`, accessible depuis la facture pour contexte.

## Points d'extension Phase 2+

- **Factures de vente** (émises par le client) — Phase 2
- **Connecteurs natifs** Crésus, Abacus, WinBIZ
- **Paiement intégré** : génération d'ordres de paiement bancaires
- **Workflow multi-niveaux** : dirigeant client valide les > 5K, puis cabinet
- **Affichage dashboard client** des factures
- **Détection des avoirs** liés à des factures précédentes
- **Comptabilité par projet/affaire**

## Métriques à instrumenter

- Volume de factures par mois par cabinet
- Taux de validation 1-clic vs corrections
- Précision IA par champ (montant, IBAN, date)
- Taux de détection d'anomalies vraies vs fausses positives
- Latence ingestion → export
- Taux d'alerte fraude IBAN (signal de fraude réelle)
- Taux d'export réussi par logiciel (Bexio vs Crésus, etc.)

## Dépendances code

- Module Facture ([`facture.md`](../modules/facture.md))
- Module Doc ([`doc.md`](../modules/doc.md))
- Module Extraction IA ([`extraction-ia.md`](../modules/extraction-ia.md))
- Intégration logiciels paie/compta ([`payroll-integration.md`](../architecture/payroll-integration.md))
- Schéma facture ([`facture-schema.md`](../data-model/facture-schema.md))
