---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [calendar, echeance-schema]
---

# ADR 0011 — Périmètre MVP du module Calendar (échéances & relances)

## Statut
Acceptée — 30 mai 2026. Cadrage du module Calendar avant implémentation. Tranche les
questions ouvertes de `docs/modules/calendar.md` §16 et `docs/data-model/echeance-schema.md` §15.

## Contexte

Le module Calendar (moteur d'échéances fiscales/sociales + relances clients + sync
Outlook) est le prochain module P0 de la roadmap (M4-M5). Avant d'écrire le moindre
schéma, deux docs listaient ~12 décisions ouvertes (après dédup) qui conditionnent le
périmètre, le coût et la sécurité du module.

Faits de cadrage vérifiés dans le code (pas seulement la doc) :

- `crm.echeance` / `crm.relance` **n'existent pas** (seules 2 colonnes stub dans `crm.ts`).
  Le schéma `calendar.*` **n'existe pas**.
- **Aucune intégration Microsoft/Graph** dans `packages/integrations/` (seulement
  `infomaniak` + `zefix`). La sync Outlook est un préalable à construire de zéro.
- L'intégration **Bexio est Phase 2** (roadmap §3.4) : aucune auto-détection possible
  depuis un connecteur inexistant.
- Le calendrier cantonal complet est déjà **hors-scope MVP** dans `calendar.md`.
- Mode A (validation humaine systématique des relances) est le défaut MVP.

Ligne directrice retenue : **MVP déterministe, Outlook en 1-way, Mode A, zéro
dépendance Phase 2 (Bexio), seed interne plutôt que sources externes fragiles.**

## Décision

Les 12 décisions de cadrage sont actées comme suit pour le MVP Calendar.

### Génération & moteur

1. **Granularité du job de génération** — pg_cron **nocturne quotidien** pour la
   génération des échéances futures + **job horaire léger** pour les seules transitions
   de statut (`imminente` / `en_retard`). Les échéances suisses ont une granularité au
   jour ; seul le pilotage des relances justifie le pas horaire.

2. **Format des templates** — **Handlebars (`{{var}}`)**. Logic-less par design (pas de
   code arbitraire dans un template édité par un comptable → surface d'injection nulle),
   syntaxe évidente, écosystème mûr. Dépendance npm justifiée.

### Templates & IA

3. **Granularité des templates seed** — par **contexte × langue**, PAS par canton.
   ~4 contextes (TVA, salaires/AVS, clôture annuelle, relance pièce manquante) × 3
   langues (FR/DE/IT) ≈ **12 templates seed**. Le wording d'une relance ne dépend pas
   du canton ; seules les *dates* en dépendent (portées par les échéances).

4. **Tonalité IA** — **templates simples au MVP, IA (`chat_small`) en surcouche
   optionnelle** qui reformule un brouillon. Le template seul reste un fallback complet
   et déterministe, sans appel LLM. Mode A valide de toute façon avant envoi.

### Relances & pauses

5. **Politique de pause après réponse client** — pause auto de **7 jours ouvrés** après
   détection d'une réponse client, configurable par cabinet. Pas d'approbation requise
   pour la pause auto ; les pauses *manuelles* (vacances client) sont posées par le
   cabinet. On protège le client d'une relance redondante, on ne bloque pas.

6. **Bulk relances** — plafond **configurable, défaut 50 par envoi groupé** +
   throttling **~30 mails/min** via Graph (anti-429 / anti-flood Microsoft 365).

### Outlook

7. **Calendrier cible** — **calendrier individuel du responsable du client**, en
   **1-way (ZARYA → Outlook)** au MVP. Le calendrier partagé cabinet pose des questions
   de droits/visibilité (RGPD inter-collaborateurs) non tranchées → différé.

8. **Détection de conflit Outlook** — **sans objet au MVP** (1-way ⇒ ZARYA est la
   source de vérité et écrase). Si le 2-way est construit en Phase 2, politique cible =
   *last-write-wins horodaté, ZARYA prioritaire sur les champs métier (date / statut)*.

9. **Échéances cantonales** — **table seed interne versionnée** (migration), pas de
   source externe live. Limitée aux échéances **fédérales** communes (TVA trimestrielle,
   AVS, IS fédéral) + un petit jeu cantonal pour les cantons des premiers clients.
   Il n'existe pas d'API officielle fiable des 26 calendriers cantonaux.

10. **Régimes TVA** — **saisie manuelle** dans `crm.param_comptable` au MVP.
    L'auto-détection depuis Bexio est impossible (Bexio = Phase 2).

### Sync client & rétention

11. **Sync calendrier client (contact RH)** — **non au MVP**. Écrire dans l'agenda d'un
    tiers externe = OAuth client + consentement + surface PII importante pour une valeur
    marginale. Candidat Phase 2.

12. **Purge des relances** — **pas de purge au MVP** ; rétention alignée sur l'audit
    (append-only, 6 ans). Une relance est une trace d'action sensible. La purge serait
    une optimisation prématurée et risquée vis-à-vis de la conformité.

## Conséquences

**Positives**
- Périmètre MVP resserré, livrable sans l'intégration Bexio ni le calendrier cantonal.
- Outlook 1-way élimine par construction la complexité conflit/webhooks 2-way (Run 7
  réduit, candidat Phase 2).
- Chemin déterministe garanti (templates Handlebars) même si l'IA ou IK est indisponible.
- Sécurité : templates logic-less, pas de sync dans des agendas tiers, rétention audit.

**Négatives / dette assumée**
- Le calendrier cantonal réduit nécessitera un enrichissement manuel par canton client.
- La sync 1-way ne reflète pas dans ZARYA une échéance déplacée dans Outlook (assumé MVP).
- Un nouveau package `packages/integrations/microsoft` (OAuth + Graph) reste un préalable
  lourd avant les relances par email (Run 4).

## Alternatives écartées

- **Outlook 2-way + webhooks dès le MVP** — écarté : poste le plus coûteux et le plus
  fragile (subscriptions Graph, réconciliation, conflits) pour la moindre valeur
  perçue immédiate. Reporté Phase 2.
- **Templates par canton (× 26)** — écarté : 312 templates à maintenir pour une
  variation cosmétique, alors que seules les dates varient.
- **Source externe live des calendriers cantonaux** — écarté : aucune API officielle
  fiable ; un seed interne auditable est plus honnête.
- **Auto-détection TVA via Bexio** — écarté : connecteur inexistant (Phase 2).
- **Purge programmée des relances** — écarté : conflit avec la rétention audit 6 ans.

## Conditions de révision

- Arrivée de l'intégration **Bexio** (Phase 2) → ré-ouvrir Q10 (auto-détection TVA).
- Demande client forte pour voir les déplacements Outlook côté ZARYA → ré-ouvrir Q7/Q8
  (sync 2-way + politique de conflit).
- Volume de relances devenant significatif → ré-ouvrir Q12 (purge / archivage).

## Références

- `docs/modules/calendar.md` (§16 questions ouvertes)
- `docs/data-model/echeance-schema.md` (§15 à trancher)
- `docs/roadmap.md` (Calendar = P0 M4-M5 ; Bexio / Facture = Phase 2)
- ADR 0005 (multi-tenant natif) + addendum (le db applicatif bypasse la RLS)
- ADR 0007 (validation granulaire) — Mode A relances
- ADR 0010 (couche IA via Infomaniak) — `chat_small` pour la surcouche IA des relances
