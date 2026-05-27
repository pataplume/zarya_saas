---
status: accepted
date: 2026-05-26
last_amended: 2026-05-26 (addendum setup fees)
deciders: [tristan]
referenced_by: [onboarding-fiduciaire, multi-tenant, pricing]
---

# ADR 0006 — Onboarding fiduciaire self-service complet dès le MVP

## Statut
Acceptée — 26 mai 2026. Addendum ajouté le 26 mai 2026 pour articulation avec les setup fees.

## Contexte

ZARYA est un SaaS B2B destiné aux cabinets fiduciaires suisses. La question s'est posée du mode d'acquisition et d'onboarding de ces cabinets : faut-il proposer un onboarding self-service complet (à la Notion, Linear) ou un modèle high-touch B2B avec accompagnement humain par défaut (à la Salesforce, Workday) ?

Options évaluées :

1. **Self-service complet** : le cabinet s'inscrit, configure, importe son portefeuille et démarre seul, sans intervention humaine ZARYA
2. **High-touch par défaut** : tout cabinet est accompagné par un CSM ZARYA en visio (1-3h), pas de sign-up direct
3. **Hybride avec call de bienvenue** : self-service possible mais call de 30 min recommandé en début d'utilisation
4. **Modèle partenaire** : un réseau de revendeurs configure pour les cabinets

## Décision

**Onboarding self-service complet dès le MVP, avec une exception cadrée : l'import du portefeuille existant est assisté en live par un CSM ZARYA.**

Tous les autres aspects (identité, équipe, branding, paramètres, intégrations) sont réalisés en autonomie par le responsable du cabinet via un wizard. L'import du portefeuille reste accompagné parce que c'est l'étape la plus à risque (données hétérogènes, decisions structurantes irréversibles).

## Raisons

### Pourquoi self-service par défaut
- **Scalabilité** : un modèle high-touch nécessite N CSM pour onboarder N cabinets par mois. Un modèle self-service permet de signer 10-50 cabinets/mois avec une équipe constante.
- **Time-to-value** : un cabinet peut être opérationnel dans la même journée, sans attendre la disponibilité d'un CSM.
- **Coûts d'acquisition** : self-service = CAC plus bas, marge plus haute, pricing plus accessible.
- **Marché cible** : les cabinets fiduciaires modernes acceptent les SaaS self-service (Bexio, Klara, Run my Accounts ont prouvé que c'est viable en Suisse).
- **Itération produit** : le funnel d'onboarding instrumenté donne des signaux quantitatifs sur ce qui marche / ce qui bloque.

### Pourquoi l'import portefeuille est l'exception
- **Hétérogénéité des données sources** : chaque cabinet a un format différent (Bexio CRM export, Abacus, Excel maison, listes Word, archives papier). Pas de format standard à attaquer en self-service.
- **Volume critique d'erreurs** : 50-200 clients à valider, des erreurs cascadent sur tout l'usage futur de ZARYA.
- **Décisions structurantes** : faut-il inclure les clients inactifs ? Migrer l'historique ? Découper les contacts ? Ces décisions méritent un dialogue avec un expert ZARYA.
- **Effet pédagogique** : pendant le call, le CSM forme le responsable au produit en même temps qu'il aide à l'import. ROI commercial fort.

## Conséquences

### Positives
- **Croissance scalable** : pas de goulot d'étranglement humain pour les phases A-E (qui font 90% du travail)
- **Branding moderne** : message produit "onboarding en 1h sans rien à installer"
- **Données quantitatives** sur le funnel : amélioration produit data-driven
- **Coût d'acquisition réduit** vs full high-touch
- **Pricing accessible** : permet de proposer un Starter à 199 CHF/mois (vs 1000+ pour du high-touch)
- **L'exception import portefeuille** garde un point de contact humain qualifié, utile pour upsell

### Négatives
- **Investissement initial dev important** : construire le wizard self-service avec import IA est plus long que d'avoir un CSM qui configure tout
- **Risque d'abandon en cours** : sans CSM, certains cabinets vont coincer et partir. Mitigé par les emails de relance automatiques.
- **Cabinets traditionalistes** : 10-20% du marché préfère un contact humain dès le début. À traiter via le canal "Demander une démo" qui reste disponible.
- **Support utilisateurs** : volume initial plus élevé pendant l'onboarding (questions UX). À anticiper avec FAQ, chatbot, documentation utilisateur soignée.
- **Découverte produit en autonomie** : risque que le cabinet n'utilise que 20% des features. À mitiger avec tour produit (Phase 2) et campagnes d'activation.

### Neutres
- L'équipe ZARYA reste impliquée sur l'import portefeuille (l'étape la plus critique)
- Le modèle "Demander une démo" reste disponible pour les cabinets qui le préfèrent
- Calendly intégré pour le booking de la session import

## Alternatives écartées

### Pourquoi pas full high-touch (option 2) ?
- **Non scalable** : limite la croissance à ~5-10 cabinets/mois par CSM
- **Coût d'acquisition prohibitif** : pricing devient incompatible avec un cabinet PME (qui n'a pas le budget pour 3000 CHF/mois)
- **Friction d'achat** : nécessité de passer par un call avant même de tester crée un frein
- **Pas aligné** avec les attentes modernes d'achat SaaS

### Pourquoi pas l'hybride avec call de bienvenue (option 3) ?
- **Friction additionnelle** sans bénéfice clair : si le call est obligatoire, on retombe sur high-touch ; s'il est optionnel, c'est ce qu'on fait déjà avec "Demander une démo"
- **Ajoute de la complexité** sans répondre à un vrai problème utilisateur

### Pourquoi pas le modèle partenaire (option 4) ?
- **Pas la priorité au MVP** : construire un réseau de revendeurs est un produit en soi
- **Conflit potentiel** avec la marque et l'expérience produit
- **Pertinent en Phase 3** pour atteindre les marchés alémanique et tessinois via des partenaires locaux

## Risques mitigés

### Risque : taux d'abandon élevé du wizard
**Mitigation** : 
- Instrumentation complète du funnel (où les gens décrochent ?)
- Sauvegarde automatique à chaque étape (pas de perte de données)
- Possibilité de "passer pour l'instant" sur les étapes non bloquantes
- Emails de relance automatiques après 3, 7, 14 jours d'inactivité
- A/B testing du wizard en Phase 2

### Risque : qualité de configuration médiocre par les cabinets
**Mitigation** :
- Templates ZARYA hérités par défaut (le cabinet n'a rien à configurer si pas besoin)
- Aide contextuelle sur chaque champ
- Validation des données critiques (IDE, IBAN, emails)
- Possibilité de modifier tous les paramètres après l'onboarding

### Risque : import portefeuille raté
**Mitigation** : c'est précisément pourquoi on garde cette étape en accompagné. Possibilité de re-faire un import plus tard si besoin.

### Risque : insatisfaction des cabinets traditionalistes
**Mitigation** : maintenir le canal "Demander une démo" + option d'accompagnement payant pour la configuration complète.

## Conditions de révision

À reconsidérer si :
- Taux d'abandon du wizard > 50% (signal d'UX à revoir radicalement)
- Taux de conversion essai → payant < 10% (signal que self-service ne suffit pas)
- Volume de tickets support pendant onboarding > 5 par cabinet en moyenne (signal de friction)
- Feedback qualitatif négatif récurrent des cabinets pilotes
- Demande forte d'un modèle accompagné premium (peut devenir une offre supplémentaire)

## Implémentation

Voir :
- [`/docs/modules/onboarding-fiduciaire.md`](../onboarding-fiduciaire.md) pour la spec complète du wizard
- [`/docs/flows/flow-f-onboarding-fiduciaire.md`](../../flows/flow-f-onboarding-fiduciaire.md) pour le flow utilisateur
- [`/docs/data-model/onboarding-fiduciaire-schema.md`](../../data-model/onboarding-fiduciaire-schema.md) pour le schéma de données

## Liens connexes

- [`ADR 0005 — Multi-tenant natif`](./0005-multi-tenant-natif-mvp.md) — le self-service implique le multi-tenant
- Module [`extraction-ia.md`](../../modules/extraction-ia.md) — réutilisé pour l'import portefeuille

---

## Addendum — Articulation avec les setup fees (mai 2026)

L'introduction de **Pack de déploiement initial (setup fee)** dans [`/docs/pricing.md`](../../pricing.md) ne remet pas en cause cette décision. L'articulation est la suivante :

### Le self-service reste le chemin par défaut
- **Starter** : self-service complet à 0 CHF de setup. Le pack à 490 CHF est **optionnel** pour ceux qui veulent un accompagnement.
- **Pro** : self-service reste possible techniquement, mais le pack à 2'900 CHF est **fortement recommandé** (et obligatoire si > 50 clients à importer).
- **Enterprise** : accompagnement systématique sur devis.

### Pourquoi ce n'est pas une contradiction
1. **Le wizard self-service est l'infrastructure produit** : il existe et fonctionne pour tous les plans. C'est la base technique.
2. **Le setup fee est un service additionnel** : il ne remplace pas le wizard, il l'enrichit (accompagnement humain, formation, import complexe).
3. **Le choix reste au cabinet** : un cabinet 1-3 personnes peut toujours faire l'onboarding seul en 30 min. Un cabinet 4-15 personnes peut techniquement le faire seul mais bénéficie largement de l'accompagnement.

### Pourquoi la décision initiale tient
Les raisons originelles de l'ADR 0006 restent valides :
- Vélocité de l'acquisition (Starter signable en quelques minutes)
- Argumentaire commercial différenciateur ("self-service par design")
- Scalabilité opérationnelle (pas dépendant d'une équipe CSM)
- Rapidité de conversion essai → payant

L'ajout du setup fee **renforce** plutôt qu'il ne contredit cette logique : il capture de la valeur additionnelle pour les cabinets qui souhaitent être accompagnés, sans imposer cette friction à ceux qui veulent y aller seuls.

### Conditions de révision actualisées
À reconsidérer si :
- Plus de 80% des Starter prennent le pack à 490 CHF → le self-service pur ne correspond pas au marché, le pack devient le défaut
- Moins de 20% des Pro prennent le pack à 2'900 CHF → le prix est trop élevé ou la valeur perçue trop faible
- Les cabinets se plaignent que le self-service est trop friction-heavy malgré l'option pack → refondre le wizard
