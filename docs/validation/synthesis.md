---
status: template
owner: tristan
last_updated: 2026-05-26
priority: P0
type: validation
depends_on: [interview-guide, vision, personas, pricing]
referenced_by: [vision, roadmap]
---

# Synthèse des interviews qualitatives

> **Document vivant** rempli au fur et à mesure des interviews. À mettre à jour après chaque interview et synthèse partielle toutes les 3 interviews. Template à remplir.
>
> Voir le guide opérationnel dans [`interview-guide.md`](./interview-guide.md).

## 1. État d'avancement

| Métrique | Valeur cible | Valeur actuelle |
|---|---|---|
| Interviews complétées | 10-15 | **0** |
| Interviews enregistrées (consentement) | 80%+ | — |
| Profils Sophie | 5-7 | — |
| Profils Marc | 2-3 | — |
| Profils Julie | 2-3 | — |
| Profils Patrick/Aïcha | 2-3 | — |
| Cabinets pilotes engagés | 3-5 | — |

Dernière mise à jour : [DATE]

---

## 2. Interviews réalisées

Liste à jour des interviews effectuées. Voir notes détaillées dans `/docs/validation/interviews/`.

| # | Date | Persona | Cabinet (anonymisé) | Taille | Durée | Enregistré ? |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

---

## 3. Synthèse des douleurs validées

### 3.1 Douleur 1 — Visibilité sur l'état des dossiers

**Hypothèse initiale** (`vision.md`) : Sophie n'a pas de vue temps réel de l'avancement des dossiers.

**Statut** : ⏳ à valider

**Validations** :
- — (à remplir : verbatims d'interview)

**Invalidations** :
- — (à remplir : interviewés qui contredisent)

**Quantifications** :
- — (combien de temps perdu / fréquence)

**Notes** :
- 

---

### 3.2 Douleur 2 — Relances mensuelles aux clients pour les salaires

**Hypothèse initiale** : 60-80 emails de relance par mois, occupation significative.

**Statut** : ⏳ à valider

**Validations** :
- 

**Invalidations** :
- 

**Quantifications** :
- 

**Notes** :
- 

---

### 3.3 Douleur 3 — Classement des documents (PJ d'emails, scans, NAS)

**Hypothèse initiale** : 1-2h par jour perdues à trier les emails et PJ.

**Statut** : ⏳ à valider

**Validations** :
- 

**Invalidations** :
- 

**Quantifications** :
- 

**Notes** :
- 

---

### 3.4 Douleur 4 — Saisie répétitive des factures fournisseurs

**Hypothèse initiale** : 3-5 minutes par facture × 50-200 factures/mois/client.

**Statut** : ⏳ à valider

**Validations** :
- 

**Invalidations** :
- 

**Quantifications** :
- 

**Notes** :
- 

---

### 3.5 Douleur 5 — Recherche dans les archives

**Hypothèse initiale** : difficile de retrouver un document spécifique dans le NAS.

**Statut** : ⏳ à valider

**Validations** :
- 

**Invalidations** :
- 

**Quantifications** :
- 

**Notes** :
- 

---

## 4. Douleurs **émergentes** non anticipées

Douleurs qui apparaissent en interview mais qui ne sont pas dans `vision.md`.

| Douleur | Fréquence d'évocation | Intensité ressentie | Cabinets concernés |
|---|---|---|---|
| — | — | — | — |

**Décision produit** : intégrer dans la roadmap ? Adresser dès le MVP ? Phase 2 ?

---

## 5. Hypothèses pricing

### 5.1 Plans Starter / Pro / Enterprise (199 / 499 / sur devis)

**Statut** : ⏳ à valider

**Réactions spontanées** (avant révélation pricing) :
- Question type : "Combien faudrait-il que ça coûte par mois pour que vous testiez ?"
- Verbatims :
  - 

**Réactions après révélation 199 / 499** :
- Sophie 1-3 personnes : 
- Sophie 4-15 personnes :
- Cabinets > 15 personnes : 

**Ajustements à envisager** :
- 

### 5.2 Période d'essai 14 jours

**Statut** : ⏳ à valider

**Réactions** :
- 

### 5.3 Carte bancaire en essai

**Statut** : ⏳ à valider

**Réactions** :
- 

---

## 6. Hypothèses produit

### 6.1 Onboarding self-service

**Hypothèse** : 70%+ des cabinets cibles acceptent un onboarding self-service complet.

**Statut** : ⏳ à valider

**Verbatims** :
- 

**Risques émergents** :
- 

### 6.2 Validation granulaire onboarding employés

**Hypothèse** ([ADR 0007](../architecture/decisions/0007-validation-granulaire-onboarding.md)) : la friction de la validation champ par champ est acceptable au regard de la qualité du référentiel.

**Statut** : ⏳ à valider

**Verbatims** :
- 

### 6.3 Dashboard client mobile-first

**Hypothèse** ([ADR 0008](../architecture/decisions/0008-mini-dashboard-client.md)) : les contacts RH PME en 2026 acceptent un dashboard simple plutôt qu'un Excel email.

**Statut** : ⏳ à valider

**Verbatims côté cabinet** :
- 

**Verbatims côté contact RH** :
- 

### 6.4 Résidence UE (pas Suisse stricte)

**Hypothèse** ([ADR 0001](../architecture/decisions/0001-residence-donnees.md)) : la résidence UE est acceptable pour la majorité des cabinets, l'option Suisse stricte étant Phase 2.

**Statut** : ⏳ à valider

**Verbatims** :
- 

**Risque** : un % significatif de cabinets refuse → réviser le plan

### 6.5 Modules prioritaires

**Hypothèse** : les modules P0 (Doc, CRM, Calendar, Onboarding, Dashboard Client) suffisent à apporter de la valeur au MVP.

**Statut** : ⏳ à valider

**Module le plus attendu** :
- 

**Module le moins critique** :
- 

---

## 7. Concurrence et alternatives perçues

### 7.1 Outils nommés spontanément
- 

### 7.2 Pourquoi les cabinets restent sur les outils actuels ?
- 

### 7.3 Quels outils ont été abandonnés et pourquoi ?
- 

---

## 8. Profils détracteurs

### 8.1 Qui ne sera jamais client ?
- Profils identifiés :
  - 
- Raisons :
  - 

### 8.2 Implications produit
- Pas chercher à convaincre les détracteurs au MVP
- Concentrer l'énergie sur les early adopters

---

## 9. Cabinets pilotes potentiels

### 9.1 Liste des cabinets ayant exprimé un intérêt

| Cabinet (anonymisé) | Persona contact | Engagement | Date d'engagement |
|---|---|---|---|
| — | — | — | — |

### 9.2 Critères de sélection des 3-5 pilotes finaux
- Variété de tailles (1-3, 5-10, 15+)
- Variété géographique (Genève, Vaud, Neuchâtel/Fribourg)
- Variété de logiciels comptables utilisés
- Engagement réel (pas juste curiosité)
- Volonté de feedback structuré

### 9.3 Pilotes confirmés
- 

---

## 10. Apprentissages méta

### 10.1 Ce qui résonne le plus
Les arguments produit qui font réagir positivement :
- 

### 10.2 Ce qui inquiète
Les arguments produit qui suscitent des réticences :
- 

### 10.3 Vocabulaire métier appris
Termes / expressions à utiliser dans la communication ZARYA :
- 

### 10.4 Surprises
Choses inattendues révélées en interview :
- 

---

## 11. Décisions produit prises suite aux interviews

### 11.1 Hypothèses validées
- 

### 11.2 Hypothèses invalidées
- 

### 11.3 Ajustements à la vision
- 

### 11.4 Ajustements à la roadmap
- 

### 11.5 Ajustements au pricing
- 

### 11.6 ADR à créer ou modifier
- 

---

## 12. Patterns par type de cabinet

### 12.1 Cabinets 1-3 personnes
- 

### 12.2 Cabinets 5-10 personnes
- 

### 12.3 Cabinets 15-30 personnes
- 

---

## 13. Patterns par persona

### 13.1 Sophie (responsable)
- 

### 13.2 Marc (gestionnaire salaires)
- 

### 13.3 Julie (collaboratrice polyvalente)
- 

### 13.4 Patrick / Aïcha (client PME)
- 

---

## 14. Risques et signaux faibles identifiés

### 14.1 Risques marché
- 

### 14.2 Risques produit
- 

### 14.3 Risques compétitifs
- 

### 14.4 Risques réglementaires
- 

---

## 15. Verbatims marquants

Les citations à conserver pour pitch, marketing, validation interne. Anonymisées.

> *"[citation]"*  
> — [Persona], cabinet [taille], [date]

> *"..."*  
> — ...

---

## 16. Plan d'action post-synthèse

### 16.1 Ajustements documentaires immédiats
- [ ] Mettre à jour `vision.md` si douleurs invalidées
- [ ] Mettre à jour `personas.md` si profils différents identifiés
- [ ] Mettre à jour `pricing.md` si ajustement
- [ ] Mettre à jour `roadmap.md` si re-priorisation
- [ ] Créer/modifier ADR si décisions structurantes

### 16.2 Préparation Phase 1 (MVP)
- [ ] Liste finale des cabinets pilotes
- [ ] Communication aux cabinets pilotes (planning attendu)
- [ ] Préparation onboarding "manuel guidé" pour les pilotes
- [ ] Plan de collecte de feedback continu

### 16.3 Communication
- [ ] Restitution synthèse aux interviewés (promis dans le recrutement)
- [ ] Communication équipe interne (revue produit)
- [ ] Mise à jour landing si argumentaire change

---

## 17. Calendrier de synthèses

| Synthèse | Date prévue | Status |
|---|---|---|
| Synthèse partielle 1 (après 3 interviews) | — | ⏳ |
| Synthèse partielle 2 (après 6 interviews) | — | ⏳ |
| Synthèse intermédiaire (après 10 interviews) | — | ⏳ |
| Synthèse finale (après 13-15 interviews) | — | ⏳ |

---

## 18. Annexes

### 18.1 Liste des interviewés contactés mais non aboutis
- Pour analyse des objections initiales et amélioration du recrutement
- 

### 18.2 Notes méthodologiques
- Adaptations du guide d'interview après les premières sessions
- 

### 18.3 Outils utilisés
- Visio : (Teams / Google Meet / Zoom)
- Notes : (Notion / Obsidian / fichiers MD)
- Enregistrement : (Otter.ai / Fireflies / autre)
- Stockage : (Drive / Notion / repo privé)

---

## 19. Template de note d'interview individuelle

Stocker dans `/docs/validation/interviews/YYYY-MM-DD-[initiales].md`

```markdown
# Interview #X — [Initiales] — [Date]

## Profil
- Cabinet : [nom anonymisé], [taille], [localisation]
- Rôle : [persona]
- Logiciels utilisés : [...]
- Ancienneté dans le métier : [...]

## Contexte
- Comment a-t-il/elle été contacté·e ?
- Disposition initiale : très intéressé·e / curieux / réservé·e

## Douleurs identifiées (verbatim)
1. **[Douleur 1]** — quantification : [X]
   > "[citation]"

2. **[Douleur 2]** — ...

## Réactions au concept ZARYA
- **Adore** : 
- **Inquiète** : 
- **Pricing perçu** (avant révélation) : 
- **Pricing perçu** (après révélation 199/499) : 

## Hypothèses validées
- 

## Hypothèses invalidées
- 

## Surprises
- 

## Vocabulaire métier appris
- 

## Concurrents nommés
- 

## Actions de suivi
- [ ] Follow-up dans X mois
- [ ] Inviter au pilote
- [ ] Contacter [autre personne du cabinet]
- [ ] Partager la synthèse

## Score d'intérêt (à chaud)
- /10
```

---

## 20. À tenir à jour

Ce document évolue à chaque interview. Conventions :
- ⏳ : hypothèse pas encore validée
- ✅ : hypothèse validée par 3+ interviews
- ❌ : hypothèse invalidée par 3+ interviews
- 🟡 : signaux contradictoires, à approfondir

Synthèse partielle attendue toutes les 3 interviews. Mise à jour formelle de `vision.md`, `personas.md` et `roadmap.md` après chaque synthèse.

Version actuelle : **v0.1** — template — Mai 2026.
