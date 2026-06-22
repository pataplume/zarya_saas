---
status: accepted
date: 2026-06-22
deciders: [tristan]
referenced_by: [crm, calendar, onboarding-client, echeance-schema]
---

# ADR 0025 — Onboarding client & module client CRM éditable (+ achèvement du moteur d'échéances)

## Statut
Acceptée — 22 juin 2026. Débloque le **Run 6 de l'ADR 0011** (génération automatique des
échéances), resté en attente de l'« extension CRM » côté client.

## Contexte

Le test de bout en bout (compte `rich@ik.me`) a confirmé l'état réel du module client :
un client se crée avec **raison sociale + type seulement**, le dossier est en **lecture
seule**, et il porte **0 contact / 0 service / 0 adresse / 0 échéance**. Conséquences en
cascade observées : le moteur d'échéances (CAL) ne peut **rien générer** (aucun service d'où
partir), et le module n'est pas utilisable comme CRM.

Fait de cadrage vérifié **dans la base** (pas seulement la doc) : le schéma `crm.*` (Bloc A,
scellé) contient **déjà** tout le nécessaire — `client` (identité riche : ide, forme_juridique,
numero_tva, langue, responsable_id, dates, tags…), `contact`, `adresse`, `mandat`, `service`
(`type_service`, `frequence_service`, `parametres jsonb`), `param_comptable` (logiciel, exercice,
`date_bouclement`, `mode_transmission`), `salaire_config`, `banque` (iban, credentials),
`relation` (iban_facturation, honoraires), `document_attendu` (service_id, frequence, deadline),
`echeance` (porte déjà `service_id` + `template_id`), `relance`. Le catalogue `calendar.template_echeance`
porte déjà un **seed fédéral** (ADR 0011 Run 4).

Ligne directrice : **aucun reshape du Bloc A**. Le manque est de l'**UI + des server actions +
le moteur de génération** — pas du schéma. C'est précisément l'« extension CRM » qui bloquait
ADR 0011 Run 6.

## Décision

### 1. Le module client est un CRM **éditable**, pas un wizard rigide
Le dossier `/app/clients/[id]` devient éditable **section par section** (identité, contacts,
adresses, services, params comptables, mandat, bancaire, notes). On **n'impose pas** un parcours
linéaire bloquant : la fiduciaire remplit dans l'ordre qu'elle veut, et un **« assistant de
complétude »** (indicateur + checklist de ce qui manque pour activer tel service) guide sans
contraindre. *(Arbitrage founder : édition libre + complétude, pas wizard.)*

### 2. On écrit sur le schéma existant (Bloc A intact)
Toutes les mutations passent par des **server actions scopées `cabinet_id`** (+ trigger
`fn_check_client_cabinet`), validées **Zod**. Chaque création/édition émet un `crm.evenement`
(audit). Si une colonne s'avère réellement manquante, elle est **additive** (migration + DoD
complet) — jamais une refonte d'une table scellée.

### 3. Moteur d'échéances = achèvement d'ADR 0011 Run 6
Déclencheur : **activation/mise à jour d'un `crm.service`** (ou édition du régime dans
`param_comptable` / `salaire_config`). Le moteur mappe `service.type` × `service.frequence` ×
régime (TVA, `date_bouclement`, `frequence_paie`) → instancie des `crm.echeance` depuis
`calendar.template_echeance` (lignes globales `cabinet_id IS NULL` + overrides cabinet),
**idempotent** (pas de doublon par client × type × période). Il instancie aussi les
`crm.document_attendu` correspondants. La **récurrence** (rouler l'horizon quand une période se
clôt) est portée par un cron (Lot 6), en plus de la génération initiale à l'onboarding.

### 4. Catalogue V1 des obligations CH — établi puis validé
Le mapping obligation → échéance (périodicité, règle de date limite, documents attendus) est
établi en **V1** (cf. `PLAN-ONBOARDING-CLIENT.md` §Catalogue). Il **s'appuie sur le seed fédéral
existant** (`template_echeance`, ADR 0011 Run 4). Les **dates légales précises et les spécificités
cantonales** restent un **placeholder à valider** (même posture que l'ADR 0011 et l'ADR 0015) —
condition de révision. Aucune source externe live (pas d'API officielle fiable des 26 cantons).

### 5. Relances documents = **brouillon à valider** (Mode A)
Cohérent avec ADR 0011 #5 et ADR 0019. *(Arbitrage founder.)*
- **Bouton « Relancer »** (client / échéance / document manquant) → génère un **brouillon**
  depuis `calendar.modele_relance` (Handlebars, FR/DE/IT) ; l'envoi part via Microsoft Graph
  (`sendCabinetEmailTracked`, déjà live) **après validation humaine**, jamais en automatique.
- **Log des relances** : timeline par client depuis `crm.relance` (date, destinataire, sujet,
  statut envoyé/répondu, `microsoft_message_id`, n° dans la série).
- **Vue « Relances à venir »** : brouillons générés par le cron + prochaines relances prévues
  (échéances `imminente`/`en_retard` sans document reçu), avec mise en **pause** possible
  (`calendar.pause_client`, déjà présent).

### 6. Phase I (chiffrement au repos) = **Lot 5**
Les **premiers write-paths** vers des colonnes ultra-sensibles — `crm.banque.iban`,
`crm.banque.credentials_open_banking`, `crm.relation.iban_facturation`,
`crm.param_comptable.acces_logiciel_externe` — déclenchent la **bascule Vault** (ADR 0013) +
inscription au registre anti-clair (`tests/integration/anti-plaintext/sensitive-columns.ts`).
Avant le Lot 5, ces champs **ne sont pas écrits en clair** (sections bancaire/accès externe
livrées au Lot 5, pas avant). *(Arbitrage founder.)*

## Découpage (lots — 1 PR chacun, DoD universel vert)
- **Lot 0** — cet ADR (décision) + `PLAN-ONBOARDING-CLIENT.md` (blueprint d'exécution).
- **Lot 1** — Dossier client éditable : identité + contacts + adresses (CRUD + audit). *(pas de champ sensible)*
- **Lot 2** — Services + `param_comptable` + **moteur d'échéances** (génération initiale, idempotente). ⟵ **Run 6**
- **Lot 3** — Assistant de complétude + parcours guidé non bloquant (assemble L1+L2, Zefix, reprise).
- **Lot 4** — `document_attendu` + **relances docs** : bouton manuel + log + vue « relances à venir ».
- **Lot 5** — Bancaire / facturation / accès externe + **bascule Vault Phase I** (ADR 0013). ⚠️ sceau anti-clair.
- **Lot 6** — Récurrence des échéances (cron horizon) + escalade relances.

## Conséquences
- **Positives** : débloque CAL (Run 6) et rend le MVP cohérent (le client devient la source qui
  alimente échéances, relances, salaires) ; **quasi aucune migration** (schéma déjà conçu) ;
  Bloc A intact ; chemin déterministe (templates) indépendant de l'IA.
- **Négatives / dette assumée** : le catalogue d'échéances V1 demande une validation métier
  (dates légales / cantons) ; le Lot 5 ouvre un write-path sensible (mitigé : Vault + test
  anti-clair, isolé en fin de séquence).

## Alternatives écartées
- **Wizard d'onboarding rigide et bloquant** (comme le cabinet) — écarté : un CRM client est un
  outil de saisie quotidien et itératif ; un parcours linéaire forcé gêne l'usage réel. L'assistant
  de complétude apporte le guidage sans la contrainte.
- **Nouveau schéma / reshape du Bloc A** — écarté : le schéma scellé porte déjà tous les champs ;
  reshaper violerait l'invariant « Bloc A jamais reshapé » (ADR 0012) pour rien.
- **Catalogue d'échéances depuis une source externe live** — écarté (cf. ADR 0011) : aucune API
  officielle fiable ; seed interne auditable + override cabinet.
- **Relances auto par défaut** — écarté : Mode A (validation humaine) reste le défaut MVP (ADR 0011).

## Conditions de révision
- Validation métier du **catalogue d'échéances** (dates légales fédérales + premiers cantons clients)
  → fige la V1.
- Arrivée d'un connecteur compta (**Bexio**, Phase 2) → auto-détection du régime TVA (ré-ouvre ADR 0011 #10).
- Demande d'**envoi auto** des relances pour certains services → ré-ouvre la politique Mode A.

## Références
- ADR 0005 (multi-tenant natif + addendum RLS), ADR 0007 (proposition → validation / Mode A),
  ADR 0011 (périmètre Calendar — **Run 6** débloqué ici), ADR 0012 (séquence canonique — Bloc A scellé),
  ADR 0013 (chiffrement au repos — Phase I, Lot 5), ADR 0019 (tracking relances), ADR 0023 (activation IA).
- `PLAN-ONBOARDING-CLIENT.md` (blueprint d'exécution + catalogue V1).
- `docs/modules/calendar.md`, `docs/data-model/echeance-schema.md`, `docs/data-model/` (schémas `crm.*`).
