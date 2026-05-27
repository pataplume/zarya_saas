---
status: validated
owner: tristan
last_updated: 2026-05-26
priority: ref
type: navigation
referenced_by: [README]
---

# Index documentation ZARYA

> Point d'entrée central. Toute la documentation est organisée en 8 sections. Ce document liste **54 documents** classés par section et par priorité.

## Comment naviguer cette doc

**Premier contact ZARYA ?** Commencez par `vision.md` puis `personas.md`, puis selon votre rôle :
- **Tristan / fondateur** : `roadmap.md`, `pricing.md`, `validation/interview-guide.md`
- **Dev** : `architecture/stack.md`, `architecture/dev-environment.md`, puis schémas et modules
- **Designer** : `ux-principles.md`, `dashboards.md`, puis modules
- **Sales / partenaire** : `vision.md`, `pricing.md`, `roadmap.md`, `glossary.md`

**Vous cherchez un sujet précis ?** Voir la table de référence en section 9 de ce document.

---

## 1. Racine

| Document | Description | Priorité |
|---|---|---|
| [`README.md`](../README.md) | Point d'entrée du repo, vision en 1 page | ref |
| [`_index.md`](./_index.md) | Ce document | ref |

---

## 2. Fondations (`/docs/`)

| Document | Description | Priorité |
|---|---|---|
| [`vision.md`](./vision.md) | Vision produit, douleurs, hypothèses | P0 |
| [`personas.md`](./personas.md) | Sophie, Marc, Julie, Patrick, Aïcha | P0 |
| [`ux-principles.md`](./ux-principles.md) | 10 principes UX non-négociables | P0 |
| [`dashboards.md`](./dashboards.md) | Architecture des 3 dashboards (fiduciaire, collaborateur, client) | P1 |
| [`roadmap.md`](./roadmap.md) | 5 phases sur 24+ mois, jalons business | ref |
| [`pricing.md`](./pricing.md) | Plans Starter/Pro/Enterprise, économie unitaire | P1 |
| [`glossary.md`](./glossary.md) | 160+ termes (suisses, métier, technique, IA, légal) | ref |

---

## 3. Modules produit (`/docs/modules/`)

| Document | Module | Priorité |
|---|---|---|
| [`onboarding-fiduciaire.md`](./modules/onboarding-fiduciaire.md) | Onboarding cabinet self-service | P0 |
| [`onboarding-client.md`](./modules/onboarding-client.md) | Onboarding PME assisté IA | P0 |
| [`dashboard-client.md`](./modules/dashboard-client.md) | Dashboard PME mobile-first | P0 |
| [`doc.md`](./modules/doc.md) | Inbox documentaire + classification IA | P0 |
| [`crm.md`](./modules/crm.md) | Centre de vérité clients | P0 |
| [`calendar.md`](./modules/calendar.md) | Échéances et relances | P0 |
| [`extraction-ia.md`](./modules/extraction-ia.md) | Brique IA transverse | P0 |
| [`facture.md`](./modules/facture.md) | Factures fournisseurs | P1 |
| [`search.md`](./modules/search.md) | Recherche RAG conversationnelle | P1 |
| [`salaire.md`](./modules/salaire.md) | Cycle mensuel salaires | P2 |

---

## 4. Flows utilisateurs (`/docs/flows/`)

| Document | Parcours | Priorité |
|---|---|---|
| [`flow-a-document-entrant.md`](./flows/flow-a-document-entrant.md) | Email/NAS/upload → classement | P0 |
| [`flow-b-facture.md`](./flows/flow-b-facture.md) | Document facture → extraction → export | P1 |
| [`flow-c-echeance-relance.md`](./flows/flow-c-echeance-relance.md) | Échéance → relance → réponse | P0 |
| [`flow-d-recherche.md`](./flows/flow-d-recherche.md) | Question → RAG → réponse avec sources | P1 |
| [`flow-e-validation-salaires.md`](./flows/flow-e-validation-salaires.md) | Cycle mensuel client + cabinet | P0 |
| [`flow-f-onboarding-fiduciaire.md`](./flows/flow-f-onboarding-fiduciaire.md) | Wizard cabinet self-service | P0 |
| [`flow-g-onboarding-client.md`](./flows/flow-g-onboarding-client.md) | Création client + référentiel employés | P0 |

---

## 5. Schémas de données (`/docs/data-model/`)

| Document | Schéma Postgres | Priorité |
|---|---|---|
| [`crm-schema.md`](./data-model/crm-schema.md) | `crm.*` — cabinets, clients, contacts, échéances | P0 |
| [`document-schema.md`](./data-model/document-schema.md) | `doc.*` — documents, propositions, fichiers | P0 |
| [`facture-schema.md`](./data-model/facture-schema.md) | `facture.*` — factures fournisseurs, exports | P1 |
| [`echeance-schema.md`](./data-model/echeance-schema.md) | `calendar.*` — templates, sync Outlook, pauses | P0 |
| [`salaire-schema.md`](./data-model/salaire-schema.md) | `salaire.*` — employés, périodes, éléments paie | P0 |
| [`onboarding-fiduciaire-schema.md`](./data-model/onboarding-fiduciaire-schema.md) | Sessions onboarding cabinet | P0 |
| [`onboarding-client-schema.md`](./data-model/onboarding-client-schema.md) | Propositions employés/champs | P0 |
| [`entity-relationships.md`](./data-model/entity-relationships.md) | ERD global Mermaid de toutes les relations | ref |

---

## 6. Architecture (`/docs/architecture/`)

| Document | Sujet | Priorité |
|---|---|---|
| [`stack.md`](./architecture/stack.md) | Vue d'ensemble technique consolidée | P0 |
| [`data-residency.md`](./architecture/data-residency.md) | Résidence des données UE/Suisse | P0 |
| [`llm-strategy.md`](./architecture/llm-strategy.md) | Stratégie LLM via Bedrock | P0 |
| [`multi-tenant.md`](./architecture/multi-tenant.md) | RLS, isolation, cabinet_id | P0 |
| [`security-and-audit.md`](./architecture/security-and-audit.md) | Sécurité, audit, conformité | P0 |
| [`dev-environment.md`](./architecture/dev-environment.md) | Setup dev, conventions, CI/CD | P0 |
| [`microsoft-integration.md`](./architecture/microsoft-integration.md) | Microsoft Graph API | P0 |
| [`zefix-integration.md`](./architecture/zefix-integration.md) | Identité entreprises suisses | P0 |
| [`nas-ingestion.md`](./architecture/nas-ingestion.md) | NAS cabinets (SMB/WebDAV) | P1 |
| [`payroll-integration.md`](./architecture/payroll-integration.md) | Logiciels paie/compta (Bexio, Crésus, etc.) | P1 |

---

## 7. ADR — Architecture Decision Records (`/docs/architecture/decisions/`)

| ADR | Décision | Statut |
|---|---|---|
| [`0001-residence-donnees.md`](./architecture/decisions/0001-residence-donnees.md) | Résidence UE (eu-central-1) au MVP, Suisse stricte option Phase 2 | ✅ accepted |
| [`0002-stack-backend.md`](./architecture/decisions/0002-stack-backend.md) | Next.js 15+ TypeScript end-to-end, modulith | ✅ accepted |
| [`0003-llm-via-bedrock.md`](./architecture/decisions/0003-llm-via-bedrock.md) | LLM via AWS Bedrock eu-central-1 uniquement | ✅ accepted |
| [`0004-supabase-vs-self-hosted.md`](./architecture/decisions/0004-supabase-vs-self-hosted.md) | Supabase Cloud Pro jusqu'à 100 cabinets | ✅ accepted |
| [`0005-multi-tenant-natif-mvp.md`](./architecture/decisions/0005-multi-tenant-natif-mvp.md) | Multi-tenant natif dès le MVP, cabinet_id partout | ✅ accepted |
| [`0006-onboarding-self-service-mvp.md`](./architecture/decisions/0006-onboarding-self-service-mvp.md) | Onboarding fiduciaire 100% self-service | ✅ accepted |
| [`0007-validation-granulaire-onboarding.md`](./architecture/decisions/0007-validation-granulaire-onboarding.md) | Validation champ par champ pour employés | ✅ accepted |
| [`0008-mini-dashboard-client.md`](./architecture/decisions/0008-mini-dashboard-client.md) | Dashboard client dédié, pas d'Excel email | ✅ accepted |

---

## 8. Validation marché (`/docs/validation/`)

| Document | Description | Priorité |
|---|---|---|
| [`interview-guide.md`](./validation/interview-guide.md) | Guide opérationnel pour 10-15 interviews qualitatives | P0 |
| [`synthesis.md`](./validation/synthesis.md) | Template structuré à remplir au fil des interviews | P0 |

---

## 9. Table de référence par sujet

Trouver rapidement où chercher un sujet.

### Architecture et technique
| Sujet | Document principal |
|---|---|
| Stack complète | `architecture/stack.md` |
| Setup dev local | `architecture/dev-environment.md` |
| Résidence données | `architecture/data-residency.md` + ADR 0001 |
| Multi-tenant et isolation | `architecture/multi-tenant.md` + ADR 0005 |
| LLM et IA | `architecture/llm-strategy.md` + ADR 0003 |
| Sécurité et conformité | `architecture/security-and-audit.md` |
| ERD global | `data-model/entity-relationships.md` |

### Intégrations externes
| Intégration | Document |
|---|---|
| Microsoft 365 (Outlook, Calendar) | `architecture/microsoft-integration.md` |
| Zefix (entreprises suisses) | `architecture/zefix-integration.md` |
| NAS cabinets (SMB/WebDAV) | `architecture/nas-ingestion.md` |
| Bexio, Crésus, WinBIZ, Abacus | `architecture/payroll-integration.md` |
| Bedrock (LLM) | `architecture/llm-strategy.md` |
| Mistral OCR | `architecture/llm-strategy.md` |

### Modules métier
| Cas d'usage | Module + Flow |
|---|---|
| Email arrive → classé | `modules/doc.md` + `flows/flow-a-document-entrant.md` |
| Facture → extraction → export | `modules/facture.md` + `flows/flow-b-facture.md` |
| Échéance → relance | `modules/calendar.md` + `flows/flow-c-echeance-relance.md` |
| Question → réponse IA | `modules/search.md` + `flows/flow-d-recherche.md` |
| Cycle salaire mensuel | `modules/salaire.md` + `flows/flow-e-validation-salaires.md` |
| Création cabinet | `modules/onboarding-fiduciaire.md` + `flows/flow-f-onboarding-fiduciaire.md` |
| Création client + employés | `modules/onboarding-client.md` + `flows/flow-g-onboarding-client.md` |

### Business
| Sujet | Document |
|---|---|
| Vision produit | `vision.md` |
| Cibles utilisateurs | `personas.md` |
| Modèle économique | `pricing.md` |
| Calendrier produit | `roadmap.md` |
| Vocabulaire | `glossary.md` |
| Conduite interviews | `validation/interview-guide.md` |
| Synthèse interviews | `validation/synthesis.md` |

### UX et design
| Sujet | Document |
|---|---|
| Principes UX | `ux-principles.md` |
| Dashboards | `dashboards.md` + `modules/dashboard-client.md` |
| Onboarding UX | `modules/onboarding-fiduciaire.md` + `modules/onboarding-client.md` |

### Schémas Postgres
| Schéma SQL | Document |
|---|---|
| `crm.*` | `data-model/crm-schema.md` |
| `doc.*` | `data-model/document-schema.md` |
| `facture.*` | `data-model/facture-schema.md` |
| `salaire.*` | `data-model/salaire-schema.md` |
| `calendar.*` | `data-model/echeance-schema.md` |
| Onboarding fiduciaire | `data-model/onboarding-fiduciaire-schema.md` |
| Onboarding client | `data-model/onboarding-client-schema.md` |

---

## 10. Conventions documentaires

### Frontmatter standardisé
Chaque document débute par un bloc YAML avec :
- `status` : draft, validated, frozen, template
- `owner` : responsable du document
- `last_updated` : date du dernier changement structurant
- `priority` : P0, P1, P2, ref
- `depends_on` : documents prérequis
- `referenced_by` : documents qui réfèrent à celui-ci

### Patterns récurrents documentés
Plusieurs patterns reviennent dans le code et la doc :
- **Pattern proposition → validation → entité finale** : Doc, Facture, Salaire, CRM
- **Pattern héritage templates** : `cabinet_id NULL = template ZARYA global`
- **Pattern wrapper interne par intégration** : `/lib/integrations/*`
- **Pattern cabinet_id partout** : isolation multi-tenant systématique
- **Pattern validation 1-clic + correction inline** : UX universelle

### Niveaux de confiance
Certains documents indiquent un niveau de confiance (~80%, ~50%) sur des hypothèses non encore validées en terrain. À traiter avec précaution avant pilote.

---

## 11. Statistiques

- **54 documents** au total
- **18'869 lignes** cumulées
- **103'967 mots** (~620 pages)
- **8 ADR** acceptées
- **7 flows utilisateurs** documentés
- **10 modules produit** spécifiés
- **8 schémas de données** prêts pour migrations

---

## 12. Gestion documentaire

### Mise à jour
- Modification structurante → mettre à jour `last_updated`
- Création/suppression d'un document → mettre à jour cet index
- Décision majeure → créer un nouvel ADR
- Synthèse interview → mettre à jour `vision.md`, `personas.md` si nécessaire

### Documents vivants
Ces documents sont **explicitement vivants** et doivent être mis à jour régulièrement :
- `validation/synthesis.md` : à chaque interview
- `roadmap.md` : trimestriellement
- `ux-principles.md` : si principe contredit en pratique
- Tout schéma de données : à chaque migration

### Documents stables
Ces documents changent rarement après validation :
- ADR (sauf statut `superseded`)
- `architecture/data-residency.md`
- `architecture/multi-tenant.md`
- `personas.md`

### Documents à geler (post-MVP)
Pour éviter la doc-driven paralysis, geler ces documents pendant les 3 premiers mois de code, sauf apprentissage majeur :
- Tous les schémas de données
- Toutes les spec modules
- Tous les flows

---

Version actuelle : **v1.0** — Mai 2026. Documentation initiale complète.
