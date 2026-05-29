---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
type: compliance
depends_on: [registre-traitements, politique-confidentialite]
referenced_by: [_index, politique-confidentialite, cgu]
---

# Procédure d'exercice des droits des personnes

> Procédure opérationnelle pour répondre aux demandes d'exercice des droits RGPD et nLPD des personnes dont ZARYA traite les données.
>
> Référence interne pour l'équipe support et DPO.

## 1. Cadre légal

ZARYA respecte les droits des personnes au titre :
- **RGPD** (UE) : articles 15 à 22
- **nLPD** (Suisse) : articles 25 à 41
- **Délai légal de réponse** : 30 jours (extensible à 90 jours dans des cas complexes avec justification)

## 2. Droits couverts

### 2.1 Droit d'accès (RGPD art. 15 / nLPD art. 25)
La personne peut obtenir :
- Confirmation que ses données sont traitées
- Catégories de données traitées
- Finalités du traitement
- Destinataires
- Durée de conservation
- Source des données (si non collectées directement)
- Existence de décisions automatisées
- Une copie de ses données

### 2.2 Droit de rectification (RGPD art. 16 / nLPD art. 32)
La personne peut demander la correction de données inexactes ou incomplètes.

### 2.3 Droit d'effacement / "droit à l'oubli" (RGPD art. 17 / nLPD art. 32)
La personne peut demander la suppression de ses données :
- Si les données ne sont plus nécessaires
- En cas de retrait du consentement
- En cas d'opposition légitime
- Si traitement illicite

**Exceptions** : obligations légales de conservation (notamment comptable/fiscale 10 ans, audit 6 ans).

### 2.4 Droit à la limitation (RGPD art. 18)
La personne peut demander la limitation du traitement :
- Pendant la contestation de l'exactitude
- En cas de traitement illicite mais sans demande de suppression
- Lorsque les données ne sont plus nécessaires mais nécessaires à des fins juridiques

### 2.5 Droit à la portabilité (RGPD art. 20 / nLPD art. 28)
La personne peut recevoir ses données dans un format structuré, couramment utilisé, lisible par machine (JSON, CSV).

### 2.6 Droit d'opposition (RGPD art. 21)
La personne peut s'opposer au traitement de ses données pour des motifs légitimes, notamment pour les communications marketing.

### 2.7 Droit à ne pas faire l'objet d'une décision automatisée (RGPD art. 22)
ZARYA ne prend pas de décision automatisée sans validation humaine pour les sujets sensibles. La personne peut demander une intervention humaine sur toute décision basée sur l'IA.

## 3. Identification de la personne et qualification

### 3.1 Demandeur potentiel
- Membre d'un cabinet client ZARYA
- Contact d'un client PME du cabinet
- Salarié d'un client PME
- Prospect ZARYA
- Ex-utilisateur

### 3.2 Qui répond à la demande ?
- **Membre cabinet** : ZARYA répond directement (relation directe ZARYA-cabinet)
- **Contact PME / salarié PME** : ZARYA redirige vers le **cabinet** (responsable du traitement principal). ZARYA peut assister techniquement le cabinet.
- **Prospect / ex-utilisateur** : ZARYA répond directement.

### 3.3 Authentification du demandeur
- Email avec preuve d'identité (copie pièce d'identité)
- Pour les utilisateurs actifs : possible depuis le compte authentifié
- En cas de doute, demander des éléments complémentaires

## 4. Workflow de traitement d'une demande

### Étape 1 — Réception
Source : email à dpo@zarya.ch ou formulaire dédié dans le compte utilisateur.

Création d'un ticket dédié avec :
- Nature de la demande (accès, rectification, effacement, etc.)
- Identité du demandeur (à vérifier)
- Données concernées
- Date de réception

### Étape 2 — Qualification (sous 5 jours)
1. Authentification du demandeur
2. Identification du rôle (membre cabinet, contact PME, salarié, prospect)
3. Détermination de la procédure applicable
4. Si demande pour le compte d'un tiers (avocat, mandataire) : vérification du mandat

### Étape 3 — Réponse initiale (sous 7 jours)
Accusé de réception envoyé au demandeur :
- Confirmation de la prise en compte
- Délai prévisible de traitement
- Coordonnées du DPO pour suivi

### Étape 4 — Instruction

#### Pour un droit d'accès
1. Extraction des données depuis Supabase (toutes tables avec `user_id` ou `contact_id` matching)
2. Récupération des logs d'audit concernant la personne
3. Génération d'un export structuré (JSON + lisible)
4. Vérification : pas d'inclusion de données tierces (autres utilisateurs)
5. Envoi sécurisé au demandeur (lien temporaire chiffré)

#### Pour un droit de rectification
1. Identification des champs à corriger
2. Vérification de la légitimité (pièces justificatives si nécessaire)
3. Mise à jour des données
4. Logging dans `audit.cabinet_evenement`
5. Notification des sous-traitants si pertinent (Bexio, etc.)
6. Confirmation au demandeur

#### Pour un droit d'effacement
1. Évaluation des obligations légales de conservation
2. Si possible : suppression complète
3. Si conservation obligatoire : anonymisation des champs PII, conservation des données financières/comptables
4. Suppression dans toutes les tables et chez les sous-traitants
5. Logging dans `audit.*`
6. Confirmation au demandeur

#### Pour un droit à la portabilité
1. Extraction des données fournies activement par la personne (pas les données dérivées)
2. Format : JSON structuré + CSV humain
3. Inclusion du schéma de données pour faciliter l'import ailleurs
4. Envoi sécurisé

#### Pour un droit d'opposition (marketing)
1. Désinscription immédiate des listes
2. Marquage `marketing_opt_out = true` dans la DB
3. Vérification chez l'outil emailing
4. Confirmation au demandeur

### Étape 5 — Réponse finale (sous 30 jours max)
Email contenant :
- Confirmation des actions réalisées
- Documents/données si applicable
- Possibilité de recours (PFPDT en Suisse, CNIL en UE)

### Étape 6 — Archivage
Conservation de la trace de la demande dans `audit.*` pendant **6 ans** (preuve de conformité).

## 5. Cas particuliers

### 5.1 Demande complexe
Si la demande nécessite plus de 30 jours, notification au demandeur :
- Avant la fin des 30 jours
- Avec justification
- Avec nouveau délai (max 90 jours total)

### 5.2 Demande manifestement infondée ou excessive
Refus possible, motivé. Possibilité de facturer des frais raisonnables (rare).

### 5.3 Demande émanant d'une personne dont le cabinet est responsable principal
1. Réorientation vers le cabinet (avec contact)
2. Si le cabinet sollicite ZARYA pour exécuter techniquement, ZARYA accompagne
3. Documentation du rôle de sous-traitant

### 5.4 Demande lors d'un litige
- Conservation des données nécessaires au litige (limitation, pas suppression)
- Coordination avec service juridique du cabinet concerné

### 5.5 Décès de la personne
- Pas de droits exercés au nom de la personne décédée (sauf représentant légal)
- Données conservées selon obligations légales

## 6. Outils techniques nécessaires

### 6.1 À implémenter
- [ ] **Endpoint admin** d'extraction de données par personne
- [ ] **Endpoint admin** d'anonymisation
- [ ] **Endpoint admin** de suppression cascade
- [ ] **Logging spécifique** des demandes droits
- [ ] **Procédure de notification** sous-traitants (manuelle ou automatique)

### 6.2 Workflow technique

```
Demande reçue
    ↓
Authentification demandeur
    ↓
Lookup user_id / contact_id / salarie_id
    ↓
Extraction via SQL :
  - auth.users WHERE id = X
  - crm.cabinet_membre WHERE auth_user_id = X
  - crm.contact WHERE user_id = X (avec join cabinet)
  - salaire.employe WHERE auth_user_id = X
  - doc.email_brut WHERE from_email = email
  - doc.document WHERE associated_with(user)
  - audit.* WHERE acteur_id = X
    ↓
Filtrage des données tierces (autres users)
    ↓
Export structuré JSON + CSV humain
    ↓
Notification sous-traitants si applicable :
  - Microsoft : pas applicable (cabinet contrôle)
  - Bexio : si données pushed, demander suppression
  - Infomaniak (IA, Suisse) : pas de rétention longue (rien à faire)
  - Sentry/PostHog : anonymiser via API
    ↓
Documentation dans audit.cabinet_evenement
    ↓
Envoi sécurisé au demandeur
```

## 7. SLA internes

| Action | Délai cible | Délai max légal |
|---|---|---|
| Accusé de réception | < 48h ouvrées | 7 jours |
| Réponse initiale qualifiée | < 7 jours | — |
| Réponse complète | < 14 jours | 30 jours |
| Cas complexe | 30 jours | 90 jours max |

## 8. Statistiques et reporting

### 8.1 Métriques à suivre
- Nombre de demandes par type
- Délai moyen de réponse
- Taux de demandes complexes
- Taux de demandes refusées (avec motifs)

### 8.2 Reporting
- Annuel : rapport de conformité incluant statistiques droits
- À la demande du PFPDT ou CNIL si contrôle

## 9. Formation équipe

L'équipe support et le DPO doivent être formés sur :
- Cette procédure
- L'identification des demandes (parfois implicites)
- L'authentification et la vérification
- L'outillage technique d'extraction

Formation initiale lors de l'embauche + rappel annuel.

## 10. Coordination avec les cabinets clients

### 10.1 Le cabinet est responsable principal
Pour les données des contacts et salariés des PME clientes, le cabinet est responsable principal. ZARYA :
- Reçoit la demande si adressée à ZARYA
- La redirige vers le cabinet concerné
- Peut accompagner techniquement (export, suppression) à la demande du cabinet
- Documente cette assistance dans le DPA

### 10.2 Procédure cabinet
Le cabinet doit avoir sa propre procédure pour traiter les demandes de ses clients. ZARYA peut fournir un template (Phase 2).

## 11. Contact

📧 **dpo@zarya.ch** (canal principal)

📧 **security@zarya.ch** (si la demande implique une violation suspectée)

## 12. Documents associés

- [`registre-traitements.md`](./registre-traitements.md) — liste des traitements pour identifier les données concernées
- [`sous-traitants.md`](./sous-traitants.md) — liste pour propagation des demandes
- [`politique-confidentialite.md`](./politique-confidentialite.md) — communication publique
- [`dpa-template.md`](./dpa-template.md) — articulation avec les cabinets clients

## 13. À tenir à jour

Cette procédure est révisée :
- À chaque évolution réglementaire majeure
- Au moins une fois par an
- Après chaque demande complexe (lessons learned)

Formation équipe associée mise à jour en conséquence.
