# PLAN — Onboarding client & module client CRM éditable

> **Plan d'exécution séquencé** (blueprint du run multi-agent). Décision : `ADR 0025`.
> État au 22/06/2026 : **cadrage figé, prêt à exécuter.** Aucune ligne de code des lots 1→6
> n'est encore écrite. Les correctifs IA-facture (hors-périmètre de ce plan) sont déjà mergés à part.

## 0. Pourquoi ce plan
Le module client est aujourd'hui une **coquille** (raison sociale + type, lecture seule). Or le
schéma `crm.*` (Bloc A scellé) porte **déjà tout le nécessaire**. Le travail = **UI + server
actions + moteur de génération**, **sans reshape**. Ce plan débloque aussi le **Run 6 de l'ADR 0011**
(génération auto des échéances) et rend le MVP cohérent (le client devient la source qui alimente
échéances, relances, salaires).

## 1. Actifs existants à RÉUTILISER (ne rien reconstruire)
| Actif | Emplacement | Usage |
|---|---|---|
| Tables identité/CRM | `crm.client, contact, adresse, mandat, service, param_comptable, salaire_config, banque, relation, note` | écriture directe (server actions) |
| Tables échéances/relances | `crm.echeance` (porte `service_id`+`template_id`), `crm.document_attendu`, `crm.relance` | générées par le moteur / relances |
| Catalogue d'échéances | `calendar.template_echeance` (seed fédéral, `cabinet_id IS NULL` + overrides) | source de la génération |
| Modèles d'emails relance | `calendar.modele_relance` (Handlebars FR/DE/IT) | corps des relances |
| Rendu relance | `@zarya/calendar` `renderRelance` (Handlebars logic-less) | texte de relance |
| Envoi email tracké | `sendCabinetEmailTracked` (Microsoft Graph, **live**) | envoi après validation |
| Pause relances | `calendar.pause_client` | mise en pause |
| Recherche Zefix | route handler `/api/zefix/*` (consentement nLPD) | préremplissage identité |
| Transitions/relances cron | `/api/calendar/maj-echeances`, `/api/calendar/generer-relances` | déjà branchés |

## 2. Enums réels (à respecter, ne pas inventer)
- `crm.service.type` (**type_service**) : `comptabilite | fiscalite | salaires | tva | bouclement | conseil`
- `crm.service.frequence` (**frequence_service**) : `mensuelle | trimestrielle | semestrielle | annuelle | ponctuelle`
- `crm.echeance.type` (**type_echeance**) : `fiscale | tva | bouclement | salaire | relance_documents | personnalisee`
- `crm.echeance.statut` : `a_venir | imminente | en_retard | traitee | reportee | annulee`
- `crm.client.type` : `pme | independant | prive | association`
- `crm.param_comptable.logiciel` : `bexio | abacus | cresus | winbiz | banana | excel | officemaker | autre`
- `crm.param_comptable.mode_transmission` : `email | nas_partage | connecteur_logiciel | physique`
- `crm.salaire_config.frequence_paie` : `mensuelle | quinzomadaire | hebdomadaire`

## 3. Séquence & dépendances (pour l'orchestration)
```
Lot 0 (ADR + ce plan)  ─ FAIT
        │
        ▼
Lot 1 (dossier éditable : identité/contacts/adresses)
        │
        ▼
Lot 2 (services + param_comptable + MOTEUR d'échéances)   ⟵ débloque CAL (Run 6)
        ├──────────────┬──────────────┐
        ▼              ▼              │
Lot 3 (complétude   Lot 4 (docs      │   (L3 et L4 parallélisables après L2)
 + parcours guidé)   attendus +      │
                     relances)       │
        └──────────────┴─────────────┘
                       ▼
Lot 5 (bancaire/facturation + Vault Phase I)   ⚠️ sceau anti-clair
                       ▼
Lot 6 (récurrence cron horizon + escalade relances)
```
Règle : **forward-only et additif**. Un lot ne réordonne pas les suivants. Lots 3 et 4 peuvent
tourner **en parallèle** une fois Lot 2 mergé.

## 4. DoD universel (chaque lot, bloquant CI)
1. Lint + `tsc --noEmit` (strict) verts. 2. Tests unitaires (logique pure : mapping, dates,
complétude). 3. **Tests d'isolation multi-tenant** + **anti-fuite** si table métier touchée.
4. Toute mutation scopée `cabinet_id` (+ `fn_check_client_cabinet`), validée **Zod**.
5. Audit `crm.evenement` sur création/édition/relance. 6. Zéro FK fantôme, zéro `any` injustifié,
zéro TODO sans ticket. 7. `next build` vert. **Bloc A jamais reshapé** (migrations additives only).

## 5. Détail par lot (briefs pour sous-agents)

### Lot 1 — Dossier client éditable (identité, contacts, adresses)
- **Cibles** : `apps/web/app/(app)/app/clients/[id]/` (rendre éditable), nouvelles server actions
  `clients/actions.ts` ; `@zarya/schemas` (Zod : `updateClient`, `createContact`, `createAdresse`…).
- **Tâches** : édition inline + « modifier » par section ; CRUD contacts (`prenom, nom, role,
  est_principal, est_contact_rh, est_signataire, email, telephone`) ; CRUD adresses ; champs client
  étendus (`ide, numero_tva, forme_juridique, langue, responsable_id, type, tags, notes_commerciales`).
- **DoD** : pas de champ sensible (pas de Vault) ; RBAC (lecteur = lecture) ; audit ; tests isolation.

### Lot 2 — Services + param_comptable + MOTEUR d'échéances (Run 6)
- **Cibles** : section « Services & régime » du dossier ; **nouveau** `@zarya/calendar`
  `genererEcheancesPourClient(cabinet_id, client_id)` (cœur PUR + persistance) ; câblage à
  l'activation de service ; tests.
- **Tâches** :
  1. CRUD `crm.service` (type/frequence/parametres) + `param_comptable` (logiciel, exercice,
     `date_bouclement`, `mode_transmission`, régime TVA) + `salaire_config` (frequence_paie, jour validation).
  2. Moteur : pour chaque service actif, lire `calendar.template_echeance` (global + override cabinet),
     calculer les dates de la/les période(s) courante(s) via le **catalogue §Annexe**, **insérer
     `crm.echeance`** (`service_id`, `template_id`, `type`, `libelle`, `date_echeance`, `date_alerte`,
     `documents_requis`) **idempotent** (unique client × type × période), + instancier
     `crm.document_attendu`.
  3. Re-générer à la modification d'un service (sans dupliquer / sans détruire l'historique traité).
- **DoD** : cœur de calcul de dates **pur + testé** (cas TVA trim./sem., bouclement, salaire mensuel) ;
  idempotence prouvée ; isolation.

### Lot 3 — Assistant de complétude + parcours guidé (non bloquant)
- **Cibles** : composant « complétude » sur le dossier + `/app/clients/nouveau` enrichi (Zefix).
- **Tâches** : score/checklist de complétude (« il manque : adresse, ≥1 contact, régime TVA pour
  activer la génération TVA… ») ; préremplissage Zefix (identité + adresse — corrige le bug ONB
  « Zefix ne remplit pas l'adresse ») ; reprise (rien de bloquant, on peut sortir/revenir).
- **DoD** : aucune étape obligatoire forcée ; l'assistant **n'empêche jamais** la sauvegarde.

### Lot 4 — Documents attendus + relances docs
- **Cibles** : section « Documents attendus » + « Relances » du dossier ; server actions relance ;
  réutilise `modele_relance` + `renderRelance` + `sendCabinetEmailTracked`.
- **Tâches** :
  1. CRUD `crm.document_attendu` (par service/période, `obligatoire`, `deadline_jours_apres_periode`).
  2. **Bouton « Relancer »** → crée un **brouillon** `crm.relance` (Mode A) ; envoi via Graph **après
     validation** ; statut `brouillon → envoyee`, stocke `microsoft_message_id`.
  3. **Log des relances** : timeline par client (date, destinataire, sujet, statut, n° série).
  4. **Vue « Relances à venir »** : brouillons cron + échéances `imminente`/`en_retard` sans doc reçu,
     + bouton **pause** (`calendar.pause_client`).
- **DoD** : confirmation avant tout envoi (action sortante) ; jamais d'envoi auto ; audit ; isolation.

### Lot 5 — Bancaire / facturation / accès externe + Vault Phase I ⚠️
- **Cibles** : sections bancaire/facturation du dossier ; `tests/integration/anti-plaintext/sensitive-columns.ts`.
- **Tâches** : write-path `crm.banque.iban` + `credentials_open_banking`, `crm.relation.iban_facturation`,
  `crm.param_comptable.acces_logiciel_externe` **via Vault** (chiffré au repos, masque à l'affichage) ;
  inscription au **registre anti-clair** ; honoraires/pack (`crm.relation`, non sensibles).
- **DoD** : test anti-clair **vert** (aucun IBAN/credential en clair au repos) ; masque affiché ; isolation.

### Lot 6 — Récurrence + escalade
- **Cibles** : cron « horizon » (génère la prochaine occurrence à la clôture d'une période) ;
  escalade relances (compteur série déjà géré → surfacer + politique d'arrêt).
- **DoD** : idempotence cron ; pas de double génération ; tests.

## 6. Choses à NE PAS faire
- Ne pas reshaper `crm.*` (Bloc A scellé). Migration additive uniquement, avec DoD complet.
- Ne pas écrire IBAN/credentials/accès externe **avant le Lot 5** (Vault requis).
- Ne pas envoyer de relance sans validation humaine (Mode A).
- Ne pas coder de `model_id` IA en dur (sans objet ici, mais règle générale).
- Ne pas inventer d'enum : utiliser §2.

---

## Annexe — Catalogue V1 des obligations CH (à valider — dates légales = placeholder)
> S'appuie sur le seed fédéral existant (`calendar.template_echeance`, ADR 0011 Run 4). Les **dates
> exactes et spécificités cantonales** restent à valider (founder / expert métier) — condition de
> révision ADR 0025. Le `service` du client (type + fréquence + régime) **déclenche** la génération.

| Déclencheur (service) | Régime / source de date | Échéance (`type_echeance`) | Périodicité | Date limite — règle V1 | Documents attendus |
|---|---|---|---|---|---|
| `tva` + `trimestrielle` | TVA méthode effective | `tva` | 4 / an (Q1–Q4) | dernier jour du **2ᵉ mois** après le trimestre (Q1→31.05, Q2→31.08, Q3→30.11, Q4→fin févr.) | journaux + factures du trimestre |
| `tva` + `semestrielle` | TDFN / forfaitaire | `tva` | 2 / an (S1, S2) | S1→31.08 · S2→fin févr. | idem |
| `tva` + `mensuelle` | TVA mensuel (remb.) | `tva` | 12 / an | fin du **2ᵉ mois** suivant | idem |
| `salaires` + `mensuelle` | `salaire_config.date_validation_jour_du_mois` | `salaire` | 12 / an | jour du mois configuré | validation des éléments variables |
| `salaires` (dérivé annuel) | certificats + décompte annuel AVS/AC/LPP/IS | `fiscale` | 1 / an | ~ **31.01** pour l'année N-1 | certificats de salaire, décomptes annuels |
| `bouclement` + `annuelle` | `param_comptable.date_bouclement` | `bouclement` | 1 / an | `date_bouclement` **+ délai** (V1 : +6 mois, à valider) | pièces de clôture |
| `fiscalite` + `annuelle` | déclaration personne morale | `fiscale` | 1 / an | **échéance cantonale** (variable — à seeder par canton client) | déclaration + annexes |
| (transverse) | document attendu non reçu | `relance_documents` | événementiel | `deadline_jours_apres_periode` du `document_attendu` | pièce(s) manquante(s) |

**Notes de génération** : (1) `date_alerte` = `date_echeance − N jours` (N configurable cabinet,
défaut 7) ; (2) idempotence sur (`client_id`, `type`, période) ; (3) un cabinet peut **surcharger**
un template global via une ligne `template_echeance` à `cabinet_id` renseigné.
