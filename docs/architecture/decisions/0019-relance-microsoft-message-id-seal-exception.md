---
status: accepted
date: 2026-06-01
deciders: [tristan]
referenced_by: [echeance-schema, microsoft-integration]
---

# ADR 0019 — Tracking des relances : exception au sceau du Bloc A (`crm.relance.microsoft_message_id`) + envoi par draft+send

## Statut

**Acceptée** — 1er juin 2026. Décision **founder** explicite levant le sceau du Bloc A
de façon ADDITIVE pour le besoin de tracking des réponses (C4). Le changement de schéma
réel intervient en **C2b** (pas en C2a, qui ne touche pas au schéma scellé).

## Contexte

Le pipeline d'envoi des relances (Bloc C2b) doit, à terme (C4), **détecter les réponses**
des clients pour clore une échéance et arrêter les relances. Le mécanisme standard est le
rapprochement des en-têtes `In-Reply-To` / `References` d'un email entrant avec
l'`internetMessageId` du message envoyé.

Deux obstacles :

1. **`crm.relance` (Bloc A, SCELLÉ)** ne possède pas de colonne pour stocker l'identifiant
   du message Microsoft. Le Bloc A est « jamais reshapé » (ADR 0012) — toute modification
   exige une décision founder explicite.
2. **`POST /me/sendMail` (utilisé en D2/D5) retourne 202 sans corps** → on n'obtient PAS
   l'identifiant du message envoyé. Pour l'obtenir, il faut **créer un brouillon**
   (`POST /me/messages` → renvoie `id` + `internetMessageId`) puis l'**envoyer**
   (`POST /me/messages/{id}/send`).

## Décision

**Founder lève le sceau du Bloc A de façon additive** : ajout d'une colonne nullable
`crm.relance.microsoft_message_id text` (et, si utile à C4, `internet_message_id text`).
**Exception documentée et bornée** : additive uniquement (aucune colonne existante touchée,
aucun type modifié), au service d'un besoin produit réel (tracking réponses C4).

**Mécanisme d'envoi (C2b)** : pour les relances, envoyer via **draft+send**
(`POST /me/messages` puis `/send`) afin de récupérer et persister l'`internetMessageId`
(clé du rapprochement `In-Reply-To` en C4), plutôt que le `sendMail` direct fire-and-forget.

## Conséquences

1. **C2a (cette livraison) ne touche PAS au sceau** : génération des brouillons + vue —
   aucune modification de `crm.relance`.
2. **C2b** : migration additive `crm.relance.microsoft_message_id` (+ éventuellement
   `internet_message_id`) ; nouvelle méthode client Graph draft+send (auditée) ; le pipeline
   d'envoi des relances stocke l'id retourné.
3. **Périmètre de l'exception** : strictement additif sur `crm.relance`. Toute autre
   modification du Bloc A reste interdite sans nouvelle décision founder.
4. **Alternative écartée** : ne rien stocker et rapprocher les réponses par fenêtre
   client+échéance+date — fragile (faux positifs), retenue seulement en secours.

## Références

- ADR 0012 (séquence canonique + sceau Bloc A), ADR 0011 (Calendar)
- `docs/architecture/microsoft-integration.md` §7 (envoi) / §9.2 (révocation)
- KICKOFF §C2 (C2a génération+vue ; C2b envoi+message_id)
