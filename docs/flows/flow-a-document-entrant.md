---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
flow: A
depends_on: [doc, multi-tenant, microsoft-integration, extraction-ia, nas-ingestion]
referenced_by: [doc]
---

# Flow A — Document entrant

> Flow utilisateur : un document arrive dans ZARYA (par email Microsoft 365, NAS, upload manuel, ou dashboard client), est traité par le pipeline IA et finit classé dans le CRM du bon client.
>
> Voir la spec produit complète dans [`/docs/modules/doc.md`](../modules/doc.md).

## Déclencheur
4 déclencheurs possibles :
1. **Email reçu** dans Outlook du cabinet (webhook Microsoft Graph)
2. **Nouveau fichier** détecté lors du scan NAS périodique
3. **Upload manuel** par un collaborateur cabinet
4. **Upload client** depuis le dashboard client

## Acteurs
- **Système ZARYA** : ingestion, OCR, classification IA
- **Collaborateur cabinet** (Julie) : validation des propositions
- **Contact RH client** (Aïcha) : peut être à l'origine si upload dashboard
- **Microsoft Graph / NAS** : sources externes

## Pré-requis
- Cabinet onboardé et opérationnel
- Au moins une source d'ingestion configurée (Microsoft 365 ou NAS)
- Au moins un client actif dans le CRM

## Étapes détaillées

### Étape 1 — Ingestion brute

**Cas 1.A : email entrant**
1. Microsoft Graph détecte un nouveau message dans la boîte du cabinet
2. Webhook envoyé à `/api/integrations/microsoft/webhook`
3. ZARYA valide la signature et identifie le `cabinet_id` via `clientState`
4. Appel Graph pour récupérer le message complet
5. Vérification des filtres cabinet (newsletter, expéditeur interne) → ignore si match
6. Création `doc.email_brut`
7. Pour chaque pièce jointe :
   - Téléchargement
   - Hash SHA-256
   - Déduplication : si hash existant dans le cabinet → lier à `fichier_physique` existant
   - Sinon : création `doc.fichier_physique`, stockage Supabase Storage

**Cas 1.B : nouveau fichier NAS**
1. Job de scan NAS (toutes les 10 min en incrémental)
2. Détection d'un fichier dont `mtime > last_scan`
3. Download via SMB/WebDAV
4. Hash + déduplication
5. Création `doc.fichier_physique` avec `source = 'nas'` et `chemin_nas`

**Cas 1.C : upload manuel cabinet**
1. Drag & drop dans l'UI ZARYA
2. Le collaborateur peut pré-associer client/type/période
3. POST `/api/doc/upload` avec le fichier
4. Création `doc.upload_brut` + `doc.fichier_physique`

**Cas 1.D : upload client dashboard**
1. Le contact RH uploade depuis son dashboard
2. Pré-association automatique au `client_id` du contact authentifié
3. Création `doc.upload_brut` + `doc.fichier_physique`
4. Notification au cabinet (digest quotidien par défaut)

### Étape 2 — OCR si nécessaire
1. Détection automatique : PDF natif vs scan, image, etc.
2. Si OCR requis : appel à Infomaniak vision (catégorie `vision`) — différé Phase 4.1+
3. Stockage du texte extrait dans `fichier_physique.ocr_text`
4. Lien vers `extraction.invocation` (traçabilité)

### Étape 3 — Pipeline de classification IA
1. Appel à la brique Extraction IA avec contexte `classification_doc`
2. Modèle : catégorie `chat_small` (résolue au runtime) — volume élevé, qualité suffisante
3. Input : texte extrait + métadonnées (expéditeur si email, nom fichier, taille)
4. Output JSON structuré :
   - Type de document (slug)
   - Catégorie (bancaire, fiscal, salaire, commercial, administratif, autre)
   - Client probable (avec confiance)
   - Période détectée
   - Métadonnées spécifiques selon le type
   - Anomalies détectées

5. Création `doc.proposition_classement` en statut `a_valider`

### Étape 4 — Décision d'auto-classement vs validation humaine
Selon la politique du cabinet (`crm.cabinet.politique_classement`) :

**Cas A : strict (défaut MVP)**
- Toutes les propositions vont en file de validation
- Le collaborateur valide chaque proposition

**Cas B : hybride**
- Si `confiance_globale > 0.95` ET pas d'anomalie → auto-classement
- Sinon → file de validation

**Cas C : aggressive**
- Si `confiance_globale > 0.80` → auto-classement
- Sinon → validation

**Cas D : règle apprise** (Phase 2)
- Pattern matché dans `doc.regle_auto_classement` → auto
- Sinon → fallback selon politique cabinet

### Étape 5 — Validation humaine (si non auto)
1. La proposition apparaît dans l'inbox de validation (`doc.v_inbox_a_valider`)
2. Le collaborateur ouvre la proposition
3. Visualisation : preview du document + champs proposés
4. 3 options :
   - **Valider** : tous les champs proposés sont corrects
   - **Corriger** : modifier 1+ champs avant validation
   - **Rejeter** : pas un document métier (spam, perso)
5. Au clic "Valider" ou "Corriger + Valider" :
   - `proposition_classement.statut = 'validee'`
   - Trigger → création `doc.document`

### Étape 6 — Création du document final
Trigger SQL ou code applicatif :
1. INSERT dans `doc.document` avec toutes les valeurs validées
2. Renommage selon `doc.cabinet_convention_nommage`
3. Mise à jour des effets de bord (étape 7)

### Étape 7 — Effets de bord en chaîne

**7.A — Module CRM**
- INSERT dans `crm.evenement` (type `document_recu`)
- Si rattaché à `crm.document_attendu` : update du statut période
- Recalcul `crm.risque.score` du client

**7.B — Module Calendar**
- Si tous les documents d'une échéance reçus → marquage échéance `traitee` automatique
- Annulation des relances en cours pour cette échéance

**7.C — Module Facture (si applicable)**
- Si `type = 'facture_fournisseur'` → trigger pipeline Facture
- Voir [`flow-b-facture.md`](./flow-b-facture.md)

**7.D — Module Salaire (si applicable)**
- Si `type ∈ ('contrat', 'avenant', 'certificat_medical')` → trigger détection changement
- Création potentielle d'un `salaire.changement` proposé

**7.E — Module Search**
- Chunking du texte + génération embeddings
- Indexation dans `search.document_chunk`
- Document immédiatement requêtable

**7.F — Notifications**
- Si client final concerné (upload depuis dashboard) : confirmation reçue
- Si cabinet : notification dans le digest quotidien

## Cas d'erreur

| Cas | Comportement |
|---|---|
| OCR échoue | Retry x2 puis fallback "à classer manuellement" |
| Extraction IA échoue | File de validation manuelle complète |
| Pas de client trouvé (confiance < 0.3) | File "à classer manuellement", validation par humain |
| Doublon détecté (hash match) | Lien créé à l'existant, pas de duplication |
| Document corrompu | Skip, notification équipe ZARYA |
| Volume anormal d'un cabinet | Throttling + alerte ops |

## Cas particuliers

### Email multi-PJ
Un email avec 3 PJ génère 1 `email_brut` + 3 `fichier_physique` + 3 `proposition_classement`. Validation indépendante par PJ.

### Email forwardé
Détection via le pattern `Fwd:` ou `Re: Fwd:`. ZARYA tente d'identifier l'expéditeur d'origine (header `From` du message forwardé) pour le rattachement contact.

### Document multilingue
Détection de la langue par l'OCR. Influence le choix du prompt système pour classification.

### Document personnel collaborateur
Si l'expéditeur ou le nom de fichier suggère un document personnel (vacances, justificatifs médicaux d'un membre cabinet) → flag, pas d'indexation, alerte au membre concerné pour confirmation.

## Points d'extension Phase 2+

- **Signature électronique** intégrée
- **Annotations** PDF (commentaires, surlignages)
- **Workflow de validation multi-niveaux** (collaborateur → responsable)
- **OCR avancé** sur scans de mauvaise qualité (pré-processing)
- **Détection de doublons sémantiques** (pas juste hash exact)
- **Re-traitement** des documents anciens avec prompts améliorés

## Métriques à instrumenter

- Volume d'ingestion par source (email, NAS, upload, dashboard)
- Taux de validation 1-clic vs corrections
- Taux d'auto-classement (si politique hybride)
- Latence ingestion → proposition affichée (cible < 30s)
- Latence proposition → validation humaine (signal d'adoption)
- Taux d'anomalies détectées par catégorie

## Dépendances code

- Module Doc ([`doc.md`](../modules/doc.md))
- Module Extraction IA ([`extraction-ia.md`](../modules/extraction-ia.md))
- Intégration Microsoft Graph ([`microsoft-integration.md`](../architecture/microsoft-integration.md))
- Intégration NAS ([`nas-ingestion.md`](../architecture/nas-ingestion.md))
- Stratégie LLM ([`llm-strategy.md`](../architecture/llm-strategy.md))
- Schéma document ([`document-schema.md`](../data-model/document-schema.md))
