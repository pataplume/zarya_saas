---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [doc, flow-a-document-entrant, extraction-ia]
---

# ADR 0014 — Sémantique des seuils de confiance Doc (rattachement client vs auto-classement)

## Statut
Acceptée — 30 mai 2026. Cadrage du sous-bloc **B2** (rattachement client multi-signal),
décision déléguée au moment du kickoff Blocs B→H. Tranche le « ⚠️ seuils incohérents »
listé dans `KICKOFF-BLOCS-B-H.md` §B/B2.

## Contexte

`KICKOFF-BLOCS-B-H.md` signalait une **incohérence de seuils** entre deux docs :

- `docs/modules/doc.md` §5.2 : `> 90 %` → rattachement auto ; `60-90 %` → proposition
  1-clic ; `< 60 %` → file manuelle.
- `docs/flows/flow-a-document-entrant.md` §4 (Étape 4) : `confiance_globale > 0.95` → auto
  (politique « hybride ») ; `> 0.80` → auto (politique « aggressive ») ; + un `< 0.3`
  isolé (Étape 6, « pas de client trouvé »).

Lecture rapprochée : **les deux ne portent pas sur la même grandeur**. Le KICKOFF les a
conflées.

- doc.md §5.2 = **confiance du *rattachement client*** → décide si/comment on remplit
  `doc.proposition_classement.client_id_propose`. C'est exactement ce que produit B2.
- flow-a §4 = **politique d'*auto-classement*** sur `confiance_globale` (la confiance de
  la classification *globale* du document) → décide si la proposition **saute la
  validation humaine**. Cette politique est portée par `crm.cabinet.politique_classement`
  (`strict` / `hybride` / `aggressive`).

Fait de cadrage déterminant : **le défaut MVP est `strict`** (flow-a §4 Cas A,
« défaut MVP »), c.-à-d. **toute proposition passe en validation humaine** (cohérent avec
ADR 0007, « validation humaine obligatoire par défaut »). Les tiers `0.95` / `0.80`
(hybride / aggressive) **ne se déclenchent donc jamais en MVP**.

Faits vérifiés dans le code (pas seulement la doc) :

- `doc.proposition_classement` possède `client_id_propose uuid` (FK `crm.client`),
  `confiance_globale numeric(3,2)`, `confiance_par_champ jsonb` — mais aucune colonne
  dédiée aux candidats client alternatifs.
- `crm.client` **n'a pas** de colonne `domaines_emails` (référencée par doc.md §5.1 et
  flow-a). Le signal « domaine expéditeur » n'est donc pas implémentable sans migration.
- `crm.cabinet.politique_classement` n'est pas encore câblé à un quelconque
  auto-classement (chemin `strict` exclusif aujourd'hui).
- L'« entité spéciale cabinet lui-même » (doc.md §5.3, factures fournisseurs du cabinet)
  n'a **aucune table identifiée**.

## Décision

1. **Seuils de rattachement client = doc.md §5.2, exprimés en décimales.** C'est la
   spec canonique du rattachement client, et donc la grandeur que B2 produit :

   | Palier | Confiance match client | Effet B2 |
   |---|---|---|
   | `auto` | `≥ 0.90` | `client_id_propose` renseigné, confirmation 1-clic en validation |
   | `proposer` | `0.60 – 0.90` | `client_id_propose` renseigné, marqué « à confirmer » |
   | `manuel` | `< 0.60` | `client_id_propose` laissé `NULL` → file « à classer manuellement » |

   Le `< 0.3` isolé de flow-a (Étape 6) est **caduc**, remplacé par le `< 0.60` de
   doc.md §5.2.

2. **Les seuils flow-a §4 (`0.95` / `0.80`) ne sont PAS un concurrent** : ils régissent
   l'**auto-classement** (saut de validation), une décision distincte portée par
   `crm.cabinet.politique_classement`. **Inactifs en MVP** (politique `strict`
   exclusive). Différés Phase 2, sans valeur de seuil retenue ici (à fixer quand
   `hybride` / `aggressive` seront câblés).

3. **Rattachement ≠ saut de validation.** Même un match client `auto` (`≥ 0.90`) **ne
   saute pas** la validation humaine en MVP : il pré-remplit `client_id_propose` pour une
   confirmation 1-clic. La création de `doc.document` reste déclenchée par la validation
   humaine (ADR 0007).

### Périmètre B2 retenu (conséquence directe)

4. **Signal « domaine expéditeur » différé** : `crm.client.domaines_emails` n'existe pas
   et aucune UI ne le peuplerait. B2 livre les trois signaux exploitables sur le schéma
   actuel :
   - **explicite** : email expéditeur ↔ `crm.contact.email` / `crm.client.email_contact` ;
   - **contenu (IDE)** : IDE `CHE-XXX.XXX.XXX` extrait du texte/nom ↔ `crm.client.ide`
     (unique par cabinet → match fort) ;
   - **contenu (raison sociale)** : nom détecté ↔ `crm.client.raison_sociale` / `nom_court`
     (trigram, index GIN existant).

   Le signal sémantique pur (flow-a signal 4) et le signal domaine sont différés.

5. **« Entité spéciale cabinet lui-même » (doc.md §5.3) hors périmètre B2** : aucune table
   ne la matérialise aujourd'hui. Question ouverte (cf. Conditions de révision).

6. **Top-3 homonymes** persistés dans une nouvelle colonne additive
   `doc.proposition_classement.client_candidats jsonb` (candidats classés + score + raison
   + palier). On évite de surcharger `confiance_par_champ` (qui porte la confiance *par
   champ de classification*, sémantique distincte).

## Conséquences

**Positives**
- Lève une fausse contradiction : deux axes, deux décisions, aucune valeur à « perdre ».
- B2 livrable **sans toucher la politique d'auto-classement** (strict MVP intact, ADR 0007).
- Sémantique de confiance client réutilisable par les modules futurs (Facture, Search).

**Négatives / dette assumée**
- Le signal domaine expéditeur attend une migration `crm.client.domaines_emails` + une UI
  de saisie (Phase ultérieure).
- Les factures fournisseurs *du cabinet* ne sont pas rattachables tant que l'entité
  cabinet-lui-même n'a pas de table.
- Les seuils d'auto-classement (`hybride` / `aggressive`) restent à fixer quand la
  politique sera câblée.

## Alternatives écartées

- **« Choisir un gagnant » entre 90/60 et 0.95/0.80** — écarté : c'est une erreur de
  catégorie ; les deux jeux régissent des décisions différentes.
- **Activer l'auto-classement hybride/aggressive en MVP** — écarté : contraire au défaut
  `strict` et à ADR 0007 (validation humaine obligatoire).
- **Surcharger `confiance_par_champ` pour stocker les candidats client** — écarté :
  mélange deux sémantiques et casse le contrat de tests existant (clôture B1).
- **Ajouter `domaines_emails` en colonne dormante dès B2** — écarté : aucune UI ne la
  peuplerait, signal mort.

## Conditions de révision

- Câblage de `crm.cabinet.politique_classement` (auto-classement réel) → fixer les seuils
  `hybride` / `aggressive` (décision #2).
- Ajout d'une UI de gestion des domaines emails client → ré-ouvrir le signal domaine
  (décision #4) avec migration `crm.client.domaines_emails text[]`.
- Besoin de rattacher les factures fournisseurs du cabinet → trancher l'entité
  « cabinet lui-même » (décision #5).

## Références

- `docs/modules/doc.md` §5 (rattachement client)
- `docs/flows/flow-a-document-entrant.md` §4 (politique d'auto-classement)
- `KICKOFF-BLOCS-B-H.md` §B/B2 (seuils à trancher)
- ADR 0007 (validation humaine obligatoire par défaut)
- ADR 0010 (couche IA Infomaniak) — classification `chat_small`
- ADR 0012 (séquence canonique) — Bloc B
