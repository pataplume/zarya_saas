---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [sequence-canonique-v1, calendar-mvp-scope, microsoft-integration]
---

# ADR 0016 — Séquencement Calendar / Microsoft Graph (Bloc C scindé autour du Bloc D)

## Statut

**Acceptée** — 30 mai 2026. Cadrage de l'ordre d'exécution **interne** au Bloc C et de son
imbrication avec le Bloc D, **avant** d'écrire C1. Ne modifie pas la séquence canonique
(ADR 0012) : elle l'**ordonnance** finement là où l'ADR 0012 laissait une dépendance
implicite non séquencée.

## Contexte

Le Bloc B est scellé (B1→B7 livrés). Le Bloc C (« Calendar fini ») est le prochain de la
séquence canonique (ADR 0012). Ses Runs 1-5 (templates d'échéances, modèles de relance,
politique de relance) sont déjà livrés (ADR 0011 + addendum) ; restent quatre sous-blocs
au KICKOFF :

- **C1 (Run 6)** — Génération automatique des échéances depuis `crm.service` + régime TVA
  (`crm.param_comptable`) via `calendar.template_echeance` ; job pg_cron. **Prérequis :
  A3, A4** (tous deux scellés au Bloc A → C1 est **entièrement débloqué**).
- **C2 (Run 7)** — Pipeline d'**envoi** des relances via Microsoft Graph `sendMail` depuis
  l'identité du cabinet. **Prérequis : Bloc D, Run 5.**
- **C3 (Run 9)** — UI Calendar (mois + file relances). **Prérequis : C1, C2.**
- **C4** — Tracking réponses + escalade + transitions retard. **Prérequis : C1, C2, B5.**

Le fait structurant : **C2 ne peut pas être construit aujourd'hui.** Il appelle Microsoft
Graph, or le package `packages/integrations/microsoft` **n'existe pas encore** — il est le
livrable du **Bloc D**, « à construire de zéro » (KICKOFF §BLOC D ; producteur transverse
préalable de C2, E6, G5). Toute la chaîne d'envoi (OAuth Authorization Code + refresh →
wrapper `MicrosoftGraphClient` scopé cabinet → `sendMail`) appartient au Bloc D. Sans lui,
C2 n'a ni client Graph, ni tokens cabinet chiffrés, ni route handler d'intégration.

Conséquence en cascade : **C3 et C4 dépendent de C2**, donc indirectement du Bloc D.
**Seul C1 est débloqué** à ce stade. L'ordre canonique « B → C → D » porte donc une
dépendance interne (le **cœur** de C, l'envoi, présuppose D) que cet ADR explicite et
résout, plutôt que de la découvrir au milieu de C2.

Deux faits de cadrage supplémentaires :

1. **C1 est strictement indépendant de Graph.** La génération d'échéances lit `crm.service`
   / `crm.param_comptable` / `calendar.template_echeance` et écrit `crm.echeance` via un job
   pg_cron. Aucun appel réseau, aucun secret tiers. Le livrer maintenant produit de la
   valeur (échéances réelles dans le dashboard, signal exploitable par le risque B5) sans
   rien devoir au Bloc D.
2. **Le Bloc D est de toute façon un prérequis transverse.** Il débloque non seulement C2,
   mais aussi E6 (Facture) et G5 (Salaire). Le construire tôt amortit son coût sur trois
   blocs au lieu d'un.

## Décision

### 1. Séquence retenue : **C1 → Bloc D → C2 → C3 → C4**

On **scinde le Bloc C autour du Bloc D** :

1. **C1 d'abord** (entièrement débloqué, valeur immédiate, zéro dépendance Graph).
2. **Pivot vers le Bloc D** (Microsoft Graph) — construit comme producteur transverse
   complet (OAuth + wrapper scopé cabinet), pas comme une coquille au service de C2.
3. **Retour sur C2 → C3 → C4** une fois D livré : C2 consomme le `MicrosoftGraphClient`
   réel ; C3 et C4 suivent dans l'ordre de leurs prérequis (C3 = C1+C2 ; C4 = C1+C2+B5,
   B5 étant déjà livré).

Chaque sous-bloc reste **une PR** avec DoD universel (lint + typecheck + tests + build),
arbitrée par le founder. Cet ADR ne fusionne rien : il fixe l'**ordre**.

### 2. Pas de seam Graph stubbé pour avancer C2 sans D

On **ne** construit **pas** un `GraphMailer` factice (stub/no-op) pour livrer C2 avant le
Bloc D. Raisons :

- L'envoi de relances est précisément la partie où la dépendance Graph est **irréductible**
  (identité cabinet, `microsoft_message_id` stocké, 401 → alerte ops + retry backoff, audit
  append-only). Un stub ne teste aucun de ces contrats réels et créerait une fausse
  impression de complétude (« relances fonctionnelles » non vraies end-to-end — exactement
  le piège évité côté Doc avec `EXTRACTION_MODE=stub`).
- Cela dupliquerait une couche d'abstraction jetée à la livraison de D (dette de couplage).
- Le Bloc D étant un prérequis transverse (C2/E6/G5), le construire « pour de vrai »
  maintenant est de toute façon sur le chemin critique.

### 3. Périmètre inchangé du Bloc C

Cette décision est **purement séquentielle**. Elle ne modifie ni le périmètre v1.0 du
Calendar (ADR 0011), ni le hors-scope (Run 8 sync Outlook 2-way reste Phase 2), ni les
prérequis listés au KICKOFF. C4 conserve son prérequis B5 (déjà satisfait).

## Conséquences

**Positives**
- On code immédiatement ce qui est débloqué (C1) au lieu de bloquer sur la dépendance D.
- Le Bloc D est construit une fois, proprement, et amorti sur C2/E6/G5.
- Pas de stub Graph jetable → zéro dette de couplage, pas de fausse complétude.
- L'ordre des PR suit les prérequis réels : aucune PR ne référence un livrable absent.

**Négatives / limites assumées**
- Le Bloc C est livré en **deux temps** (C1, puis C2→C4 après D) : sa clôture est plus
  tardive que dans une lecture « B→C→D » naïve. Acceptable : la valeur (échéances réelles)
  arrive dès C1, et la complétude réelle de C exigeait D de toute manière.
- On « entre » dans le Bloc D avant d'avoir fini le Bloc C — léger écart à la lecture
  linéaire de la séquence canonique. L'ADR 0012 n'interdit pas le réordonnancement B→H
  selon la priorité produit (KICKOFF : « Réordonner B→H possible ») ; seul le Bloc A est
  intouchable.

## Alternatives écartées

- **Bloc D entièrement avant tout le Bloc C** : repousse C1 (pourtant débloqué et créateur
  de valeur immédiate) derrière la construction complète de l'OAuth Azure. Inutile : C1 ne
  doit rien à D. On préfère encaisser la valeur de C1 d'abord.
- **Tout le Bloc C avant le Bloc D, avec `GraphMailer` stubbé pour C2** : rejeté (cf.
  Décision §2) — fausse complétude, dette de couplage, ne teste aucun contrat Graph réel.
- **Suivre l'ordre canonique B→C→D au pied de la lettre** : impossible sans réintroduire un
  stub, puisque le cœur de C (C2, l'envoi) présuppose D. La séquence canonique autorise
  explicitement le réordonnancement intra-B→H ; cet ADR l'exerce de façon minimale et
  documentée.

## Références

- ADR 0012 (séquence canonique v1.0 — réordonnancement B→H autorisé, Bloc A intouchable).
- ADR 0011 (périmètre MVP Calendar — Runs 1-5, hors-scope Run 8) + addendum.
- `docs/architecture/microsoft-integration.md` (Bloc D : OAuth, wrapper Graph, route
  handlers `/api/integrations/microsoft/*`).
- `docs/modules/calendar.md` (Runs 6/7/9, modes de relance A/B/C).
- `KICKOFF-BLOCS-B-H.md` §BLOC C (C1→C4, prérequis) et §BLOC D (D1→D2, producteur
  transverse préalable de C2/E6/G5).
- CLAUDE.md règle 7 (intégrations tierces : secrets serveur, route handlers, jamais côté
  client) — contrainte structurante du Bloc D portée par C2.
