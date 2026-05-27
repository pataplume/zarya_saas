---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
type: validation
depends_on: [vision, personas]
referenced_by: [synthesis]
---

# Guide d'interview qualitative — fiduciaires suisses

> Document opérationnel pour conduire les 10-15 interviews qualitatives de validation marché. À utiliser tel quel en entretien.

## 1. Objectifs des interviews

### 1.1 Objectifs primaires
1. **Valider les 5 douleurs** identifiées dans `vision.md` et leur intensité
2. **Vérifier la willingness to pay** à 199 / 499 CHF / mois
3. **Identifier les détracteurs** : qui ne sera jamais client, et pourquoi
4. **Détecter les douleurs manquées** que ZARYA n'adresse pas

### 1.2 Objectifs secondaires
- Tester la résonance de l'argumentaire produit
- Apprendre le vocabulaire métier réel
- Identifier les concurrents perçus
- Estimer la durée du cycle de vente
- Comprendre les freins à l'adoption d'outils SaaS

### 1.3 Anti-objectifs
- **Ne pas vendre** : c'est une interview, pas un pitch
- **Ne pas démontrer le produit** : valider d'abord les besoins
- **Ne pas filtrer** les retours qui contredisent les hypothèses

## 2. Profils ciblés

Pour les 10-15 premières interviews :
- **5-7 Sophie** (responsables cabinets variés)
  - Cabinet 1-3 personnes
  - Cabinet 5-10 personnes
  - Cabinet 15-30 personnes
- **2-3 Marc** (gestionnaires salaires spécialisés)
- **2-3 Julie** (collaboratrices polyvalentes)
- **2-3 Patrick/Aïcha** (côté client PME, via les cabinets interviewés)

### 2.1 Critères d'inclusion
- Cabinets en Suisse romande (Genève, Vaud, Neuchâtel, Fribourg, Valais, Jura)
- Activité fiduciaire principale (compta + fiscalité + salaires en mix)
- Au moins 1 an d'existence
- Utilise au moins 1 logiciel métier moderne (Bexio, Crésus, Abacus...)

### 2.2 Critères d'exclusion
- Big 4 (Big 4 ont leurs propres outils)
- Cabinets exclusivement gestion de fortune
- Cabinets < 1 an (pas assez de pratique pour identifier les douleurs)

## 3. Recrutement

### 3.1 Sources
- Réseau personnel (Tristan + cofondateur)
- LinkedIn (recherche "fiduciaire Romandie")
- Associations professionnelles (FIDUCIAIRE|SUISSE, EXPERTsuisse)
- Demandes via clients PME (référencement à leur cabinet)

### 3.2 Approche
Message type LinkedIn / email :

> *Bonjour [Prénom],*
>
> *Je travaille sur un nouvel outil destiné aux fiduciaires suisses pour simplifier la gestion documentaire et les cycles mensuels. Avant de finaliser le produit, je cherche à comprendre les vrais défis des cabinets aujourd'hui.*
>
> *Auriez-vous 45 minutes pour échanger ? Je n'ai rien à vendre, j'ai surtout besoin de comprendre. En contrepartie, je peux partager les apprentissages globaux de mes interviews.*
>
> *Bien cordialement,*
> *Tristan*

### 3.3 Compensation
- Pas de paiement direct (les fiduciaires sont peu sensibles à 50 CHF)
- Partage des résultats agrégés à tous les interviewés
- Accès prioritaire au pilote MVP gratuit (3 mois)

## 4. Logistique

### 4.1 Format
- **45 minutes** maximum (au-delà, fatigue, qualité dégrade)
- **Visio préférée** (Teams, Google Meet — utiliser ce que le cabinet préfère)
- **Présentiel possible** si proche géographiquement (meilleur rapport)
- **Pas de groupe** : 1-1 pour éviter les biais sociaux

### 4.2 Enregistrement
- **Avec consentement explicite verbal au début**
- Permet de revoir et de citer textuellement
- Stocké chiffré, accessible à l'équipe ZARYA uniquement
- Suppression après synthèse (sauf accord pour conservation)

### 4.3 Notes
- Prendre des notes en parallèle (au cas où enregistrement échoue)
- Format markdown léger, focus sur les verbatims surprenants
- Compter les "tu vois" et "j'avoue" pour mesurer l'aisance

## 5. Structure d'interview (45 min)

### 5.1 Introduction (3 min)
1. Présentation : nom, rôle, projet en cours
2. Cadre : "Je n'ai rien à vendre, je veux comprendre"
3. Confidentialité : "Tout ce que vous direz reste anonyme dans nos restitutions"
4. Consentement enregistrement
5. Durée : 45 min

### 5.2 Mise en contexte (5 min)
**But** : comprendre le cabinet et la personne.

Questions :
1. "Pouvez-vous me décrire votre cabinet en quelques mots ? Combien de personnes, quels types de mandats ?"
2. "Et vous, votre rôle exactement ?"
3. "Depuis combien de temps faites-vous ce métier ?"

### 5.3 Quotidien et frustrations (15 min) — le cœur
**But** : laisser émerger les vraies douleurs sans biais.

Questions ouvertes (ne pas suggérer les douleurs ZARYA) :
1. "Décrivez-moi une journée type. Vous arrivez à 8h, qu'est-ce que vous faites en premier ?"
2. "Quels sont les moments les plus stressants de votre mois ?"
3. "Qu'est-ce qui vous fait perdre le plus de temps ?"
4. "Quel processus vous frustre le plus dans votre quotidien ?"
5. "Quand un client vous dit 'je vous envoie ça', combien de fois faites-vous des relances avant de l'avoir ?"
6. "Comment classez-vous les documents reçus ? Qui s'en occupe ?"
7. "Si vous deviez retrouver un document précis d'il y a 2 ans, ça vous prend combien de temps ?"

**Technique** : laisser des silences, ne pas combler. Le silence fait sortir les vraies réponses.

### 5.4 Validation des douleurs ZARYA (10 min)
**But** : tester les hypothèses de `vision.md` § 2.2.

Pour chaque douleur, formuler **sans la suggérer** :

1. "Sur l'état d'avancement des dossiers : comment savez-vous le matin où concentrer l'attention de l'équipe ?"
2. "Sur les relances salaires : si je vous dis '80 emails par mois pour récupérer les éléments', ça vous parle ?"
3. "Sur le tri d'emails et de PJ : c'est qui qui fait ce travail ? Combien de temps par jour ?"
4. "Sur la saisie des factures : combien de minutes en moyenne par facture ? Combien de factures par jour ?"
5. "Sur la recherche dans les archives : ça vous arrive de ne pas retrouver un document ?"

**Pour chaque douleur identifiée** :
- Demander une **estimation chiffrée** ("combien de temps", "combien de fois")
- Demander un **exemple récent concret**
- Demander **comment ils gèrent ça aujourd'hui**

### 5.5 Outils et écosystème (5 min)
**But** : comprendre les concurrents et les habitudes.

1. "Quels logiciels utilisez-vous au quotidien ?"
2. "Lequel vous aide le plus ? Lequel vous frustre le plus ?"
3. "Si vous aviez une baguette magique pour automatiser une seule tâche, ce serait laquelle ?"
4. "Avez-vous testé des outils IA récents ? (ChatGPT, Copilot, autres) Pour quoi ?"

### 5.6 Réaction au concept ZARYA (5 min)
**But** : tester la résonance après avoir entendu les douleurs réelles.

Pitch en 60 secondes maximum :
> *"L'idée que je porte, c'est un outil qui ferait 3 choses : (1) classer automatiquement vos documents entrants au bon client avec le bon type, (2) générer les relances clients pour vous (que vous validez avant envoi), et (3) extraire les factures pour les pousser dans votre logiciel comptable. Le tout dans un seul outil qui voit tous vos dossiers en temps réel."*

Puis questions :
1. "À chaud, ça vous parle ? Qu'est-ce qui vous attire le plus ? Qu'est-ce qui vous inquiète ?"
2. "Qu'est-ce qui manque dans ce que je viens de décrire ?"
3. "Combien faudrait-il que ça coûte par mois pour que vous testiez ?"

**Ne pas révéler le pricing avant la réponse spontanée.**

Une fois la réponse spontanée notée, demander :
4. "Si je vous disais 199 CHF/mois pour démarrer (cabinet petit), 499 CHF/mois pour cabinet pro (jusqu'à 100 clients), c'est dans la fourchette ?"

### 5.7 Conclusion (2 min)
1. "Si je résume ce que vous me dites, vos 3 plus grandes douleurs sont X, Y, Z. C'est juste ?"
2. "Y a-t-il quelqu'un dans votre cabinet à qui je devrais aussi parler ?"
3. "Accepteriez-vous d'être contacté pour un follow-up dans 3-6 mois ?"
4. "Voulez-vous être tenu informé du lancement ?"
5. Remerciements + envoi de la synthèse promise

## 6. Tactiques d'écoute active

### 6.1 Reformulation
> *"Si je comprends bien, ce qui vous fatigue le plus, c'est X. C'est ça ?"*

Force l'interviewé à préciser, valider ou corriger.

### 6.2 Approfondissement
> *"Pouvez-vous me donner un exemple récent ?"*
> *"Ça représente combien de temps par semaine ?"*
> *"Et comment vous faites pour gérer ça aujourd'hui ?"*

Quantifier et concrétiser.

### 6.3 Silence
**Ne pas combler les silences**. Compter mentalement jusqu'à 5 avant de relancer.

### 6.4 Décourager les réponses polies
> *"Soyez vraiment honnête : qu'est-ce qui vous embête le plus dans ce que je décris ?"*

### 6.5 Tester l'engagement
> *"Si je vous proposais de tester ça pendant 2 mois gratuitement, vous seriez intéressé·e ?"*

Un "oui mou" vaut un "non". Un "oui" + question concrète ("quand ça démarre ?") vaut un "très intéressé".

## 7. Biais à éviter

### 7.1 Biais de confirmation
On entend ce qu'on veut entendre. **Toujours demander un exemple concret**, pas une opinion.

### 7.2 Biais de complaisance
Les fiduciaires sont polis. Ils diront que c'est une bonne idée même s'ils ne paieraient pas. **Toujours demander un engagement** (test, follow-up, recommandation).

### 7.3 Biais de leading
Ne pas formuler les questions de manière à induire la réponse souhaitée.

**Mauvais** : "C'est frustrant de relancer 80 fois par mois, non ?"
**Bon** : "Comment gérez-vous les relances mensuelles aux clients ?"

### 7.4 Biais d'autorité
L'interviewé peut se conformer à ce qu'il imagine que vous attendez. Insistez sur "il n'y a pas de bonne réponse".

## 8. Trames spécifiques par persona

### 8.1 Pour Sophie (responsable cabinet)
- Focus sur la vue d'ensemble et le pilotage
- Question pricing pertinente (elle décide)
- Question recrutement (croissance bloquée par embauche)

### 8.2 Pour Marc (gestionnaire salaires)
- Focus sur le cycle mensuel
- Détails sur les logiciels paie utilisés
- Question Swissdec et conformité

### 8.3 Pour Julie (collaboratrice polyvalente)
- Focus sur le quotidien opérationnel
- Volume d'emails, factures
- Outils utilisés au quotidien

### 8.4 Pour Patrick/Aïcha (client PME)
- Focus sur la relation avec le cabinet
- Friction perçue côté client
- Acceptation d'un outil dashboard

## 9. Après l'interview

### 9.1 Dans les 24h
- Retranscrire les verbatims-clés
- Identifier les **3 points forts** (ce qui a marqué)
- Identifier les **3 surprises** (ce qui contredit nos hypothèses)
- Tagger les douleurs validées vs invalidées
- Noter dans `validation/synthesis.md`

### 9.2 Pattern matching
Toutes les 3 interviews :
- Identifier les patterns récurrents
- Identifier les divergences (par taille de cabinet, par persona)
- Affiner les questions pour les prochaines interviews

### 9.3 Mise à jour produit
Si une hypothèse majeure de `vision.md` est invalidée :
- Documenter dans `synthesis.md`
- Discussion équipe
- Ajustement de la roadmap si nécessaire

## 10. Métriques de qualité des interviews

### 10.1 Quantitatives
- 10-15 interviews complétées en 6-8 semaines
- 80%+ d'interviews enregistrées (consentement obtenu)
- Au moins 30 verbatims documentés
- Au moins 3 douleurs validées avec quantification
- Au moins 3 hypothèses produit ajustées

### 10.2 Qualitatives
- Conversations qui dépassent les 45 min (signal d'intérêt)
- Demandes spontanées de follow-up
- Recommandations à d'autres fiduciaires
- Engagement à tester le pilote

## 11. Template de notes par interview

```markdown
# Interview #X — [Prénom] [Initiale] — [Date]

## Profil
- Cabinet : [nom anonymisé], [taille], [localisation]
- Rôle : [persona]
- Logiciels utilisés : [...]

## Douleurs identifiées
1. [Douleur 1] — quantification : [X]
2. ...

## Verbatims marquants
> "[citation exacte]"

## Réactions au concept
- Adore : [...]
- Inquiète : [...]
- Pricing perçu : [...]

## Hypothèses validées
- [...]

## Hypothèses invalidées
- [...]

## Surprises
- [...]

## Actions
- [ ] Follow-up dans X mois
- [ ] Inviter au pilote
- [ ] Contacter [autre personne du cabinet]
```

## 12. Calendrier suggéré

| Semaine | Activités |
|---|---|
| S1 | Recrutement des 5 premières interviews, 2 interviews réalisées |
| S2 | 2 interviews réalisées, première synthèse partielle |
| S3 | 2-3 interviews réalisées, ajustement des questions |
| S4 | 2-3 interviews réalisées, début pattern matching |
| S5 | 2 interviews réalisées, focus sur les patterns à valider |
| S6 | 2 interviews complémentaires si manque, synthèse complète |
| S7 | Restitution équipe, ajustements vision/roadmap |
| S8 | Sélection 2-3 cabinets pilotes parmi les interviewés |

## 13. Ressources externes

- *The Mom Test* (Rob Fitzpatrick) : référence absolue sur les interviews qualitatives
- *Inspired* (Marty Cagan) : sur la discovery produit
- *Continuous Discovery Habits* (Teresa Torres) : méthode de discovery continue

## 14. À tenir à jour

Ce guide est vivant :
- Ajuster les questions selon les apprentissages
- Affiner les profils ciblés selon les patterns
- Documenter les pièges rencontrés
- Synthèse régulière dans `synthesis.md`
