---
status: accepted
date: 2026-06-02
deciders: [tristan]
referenced_by: [facture]
---

# ADR 0020 — Décodage QR-facture suisse (Swiss QR-bill) : parser/validators déterministes maintenant, extraction image différée

## Statut

**Acceptée** — 2 juin 2026. Ouvre le Bloc E (Facture) côté décodage, prérequis explicite
de **E2** (`facture.md §4.4` / §16 : « un ADR sera ouvert au démarrage »). Décision de
stratégie ; le code (parser/validators) vit en E2.

## Contexte

Le **Swiss QR-bill** (norme SIX, obligatoire depuis 2022) est la donnée de paiement la plus
fiable d'une facture suisse. Principe directeur (`facture.md §4.4`) : **décodage
déterministe AVANT tout LLM** pour les champs de paiement (IBAN/QR-IBAN, créancier, montant,
devise, débiteur, référence). L'IA (E3) ne complète que les champs **hors QR**.

Le décodage a **deux couches** :

1. **Obtenir le payload depuis le document** : le QR est une **image** dans le PDF →
   rendu d'une page en raster + lecture du code 2D. **Dur**, et l'infra image/OCR
   (`vision` Infomaniak) est **différée** (Phase 4.1+). Aucun décodeur QR ni rasteriseur PDF
   n'est présent (seul `unpdf`, extraction texte).
2. **Parser + valider le payload SPC** : structure **texte déterministe** (champs séparés
   par `\n`, en-tête `SPC`, version, IBAN/QR-IBAN, bloc créancier, montant, devise, bloc
   débiteur, type de référence `QRR`/`SCOR`/`NON`, référence). **Aucune dépendance** ;
   validations purement arithmétiques.

## Décision

**Découper le décodage : livrer la couche déterministe (2) maintenant, différer la couche
image (1) derrière un seam.**

1. **E2 = parser SPC + validators déterministes**, sans dépendance (cœur réutilisable,
   testable en CI à partir du texte QR) :
   - parser du payload SPC → structure typée (Zod) ;
   - validations : **IBAN mod-97**, **référence QRR mod-10 récursif**, **cohérence
     QR-IBAN ↔ type de référence** ;
   - **identification déterministe par l'en-tête `SPC`** (un QR-bill commence par le Swiss
     Payments Code). La « croix suisse » de la doc est le marqueur **visuel/humain** ; en
     code, l'en-tête SPC suffit et n'exige aucun traitement d'image.
2. **Extraction QR-image-depuis-PDF = DIFFÉRÉE**, branchée plus tard derrière un **seam**
   (interface type `decodeQrFromDocument(fichier) → payload | null`) qui mutualisera l'infra
   image de l'OCR `vision` (différée). E2 expose ce seam mais ne le câble pas.
3. **Fallback IA (E3)** : si aucun QR n'est trouvé / payload corrompu, l'extraction IA
   couvre aussi les champs de paiement (avec proposition + validation humaine).

## Conséquences

- ✅ **Zéro dépendance Node lourde** maintenant (pas de `pdfjs`/`canvas`/décodeur QR) ;
  cohérent avec la posture « vision/embeddings différés ».
- ✅ La valeur métier clé (« paiement jamais transcrit par l'IA quand un QR est présent »,
  checksums) est livrée et **testée** dès E2 sur des payloads de référence (QRR/SCOR/NON).
- ⚠️ **E2 ne décode pas un vrai PDF end-to-end** tant que le seam image n'est pas câblé :
  tant qu'il n'y a pas de source de payload, le chemin réel passe par le fallback IA (E3).
  Le câblage du seam = même jalon que l'OCR `vision` (tracé `PLAN-MVP-BETA`).
- ⚠️ Pas de **détection visuelle de la croix suisse** (l'en-tête SPC la remplace en code).
- **Pas de nouvelle décision** requise pour ajouter le décodeur image plus tard : ce sera
  un câblage du seam, sans changer le parser/validators.

## Alternatives rejetées

- **Pipeline image complet maintenant** (décodeur QR pur-JS + rasteriseur PDF) : dépendances
  Node lourdes à justifier, redondant avec l'infra image à venir pour `vision`, et n'ajoute
  pas de valeur testable au-delà du parser pour le MVP.
- **Identification par croix suisse** : exige le traitement d'image (couche différée) pour un
  résultat moins fiable que l'en-tête SPC.

## Références

- `docs/modules/facture.md` §4.4 (QR-bill) / §16 (ADR à ouvrir)
- KICKOFF §BLOC E (E2) ; ADR 0010 (IA Infomaniak, vision différé)
