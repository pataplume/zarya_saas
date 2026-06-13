---
status: accepted
date: 2026-06-12
deciders: [tristan]
referenced_by: [extraction-ia, facture]
---

# ADR 0024 — Extraction facture en cascade + provenance par champ

## Statut
Acceptée — 12 juin 2026

## Contexte

L'extraction facture remplissait les champs en une passe IA sur le texte, sans tirer parti
du **QR-bill suisse** (déterministe) ni tracer **d'où vient** chaque champ. Conséquences :
montants/IBAN parfois imprécis, et le validateur humain doit tout re-vérifier faute de savoir
ce qui est sûr. Le Lot 1 (ADR-implicite, PR #160) a déjà branché la **lecture du QR**
(`decodeQrFromImageBytes`) ; cet ADR acte la **cascade complète** et le **modèle de provenance**.

## Décision

### 1. Cascade déterministe → probabiliste (ordre + priorité des sources)
`0. classer (type) → 1. détecter la nature du fichier → 2. QR (sûr) → 3. texte/OCR →
4. IA → 5. fusion + checksums → 6. vérif IA ciblée → 7. fraude/doublons → 8. proposition + validation.`
**Priorité d'une valeur** : `QR > champ validé par checksum > IA`. Une source plus fiable
n'est jamais écrasée par une moins fiable.

### 2. Provenance + confiance PAR CHAMP (réutilise l'existant)
On réutilise `facture.proposition_facture.confiance_par_champ jsonb` (déjà présent) ;
chaque entrée devient `{ source: "qr"|"ocr"|"ia"|"humain", confiance: number }`. **Pas de
migration** pour ça. La file de validation affiche un **badge par champ** : QR = sûr (vert),
IA = à confirmer (ambre). L'humain ne corrige que l'incertain.

### 3. Détection de la nature du fichier (pur)
Helper `detectNatureFichier(bytes, type_mime) → "pdf_natif" | "pdf_scanne" | "photo" | "autre"`
(présence d'une couche texte PDF + MIME). Sert au routage (court-circuit OCR si texte natif
exploitable) et à la traçabilité. Aucune persistance sensible.

### 4. Recoupement QR ↔ IA = signal fraude
Quand le QR couvre un champ et que l'IA en propose une valeur **différente** (surtout IBAN,
montant), on lève une anomalie `incoherence_qr_ia_<champ>`. L'IBAN divergent QR≠texte est un
**vecteur de fraude** connu (RIB substitué) → anomalie bloquante à la validation.

### 5. IBAN-du-QR → Vault dès la proposition  ⚠️ (touche le sceau anti-clair)
Aujourd'hui l'IBAN est **stripé** de la proposition (le validateur le re-saisit). Le QR donne
un IBAN **déterministe** : on le capture **chiffré** dès la proposition pour que le validateur
le **voie (masqué) et confirme** au lieu de le retaper. **Mécanisme conforme ADR 0013** :
nouvelle colonne `facture.proposition_facture.iban_paiement_vault_id uuid` (indirection Vault,
**jamais de clair**), inscrite dans `SENSITIVE_COLUMNS` (mécanisme `vault`) ; le test anti-clair
reste vert. C'est un **1er write-path** vers une colonne sensible côté proposition → cet ADR en
est la condition de révision (ADR 0013).

### 6. Lot 3 — 2e passe IA ciblée
Après la passe 1, les champs **manquants / à faible confiance / en conflit QR↔IA** déclenchent
un **2e appel IA ciblé** (chat_large) avec le contexte, pour compléter/corriger. La provenance
est mise à jour. Pas de re-extraction complète (coût maîtrisé).

## Découpage (sous-blocs, 1 PR chacun, DoD vert)
- **2a** — `detectNatureFichier` (pur + tests) + câblage métadonnée.
- **2b** — provenance par champ (source+confiance dans `confiance_par_champ`) + badges UI validation.
- **2c** — migration `proposition_facture.iban_paiement_vault_id` + registre sensitive + IBAN-du-QR
  au Vault + anomalie `incoherence_qr_ia_*` + IBAN masqué affiché. ⚠️ touche le sceau (compliant).
- **3** — 2e passe IA ciblée sur champs manquants/douteux.

## Conséquences
- **Positives** : fiabilité (QR déterministe), anti-fraude (recoupement IBAN), validation plus
  rapide (badges → 1 clic sur le sûr), coût IA réduit (court-circuit + passe ciblée).
- **Négatives / risques** : 1er write-path IBAN côté proposition (mitigé : Vault + test anti-clair) ;
  2e passe IA = coût marginal (mitigé : ciblée, seulement si nécessaire).

## Alternatives écartées
- **Table normalisée `proposition_champ`** (comme salaire) : plus lourde ; `confiance_par_champ jsonb`
  suffit pour la facture (champs fixes, peu nombreux).
- **Garder l'IBAN re-saisi à la main** : gâche la valeur déterministe du QR + risque d'erreur de saisie.

## Liens
- ADR 0007 (proposition → validation), ADR 0013 (chiffrement au repos), ADR 0023 (activation IA).
- Lot 1 : PR #160 (`decodeQrFromImageBytes`). `/docs/modules/extraction-ia.md`, `/docs/modules/facture.md`.
