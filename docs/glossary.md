---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: ref
type: foundation
depends_on: []
referenced_by: [README, vision]
---

# Glossaire ZARYA

> Vocabulaire fiduciaire suisse + terminologie ZARYA + acronymes techniques. Référence pour toute l'équipe et les nouveaux arrivants.

## Convention de lecture

- 🇨🇭 = terme spécifique au contexte suisse
- 🏢 = terme métier fiduciaire général
- 💻 = terme technique ZARYA
- ⚖️ = terme juridique / réglementaire
- 🤖 = terme IA / data

---

## A

### AFC 🇨🇭⚖️
**Administration Fédérale des Contributions.** L'autorité fiscale fédérale suisse. Gère la TVA fédérale, l'impôt anticipé, certaines impositions des sociétés.

### Avenant 🏢
Document modifiant un contrat existant (typiquement un contrat de travail). Spécifie les changements (salaire, fonction, taux d'activité) à compter d'une date donnée.

### AVS 🇨🇭⚖️
**Assurance Vieillesse et Survivants.** Premier pilier du système de prévoyance suisse. Cotisation obligatoire (employeur + employé), basée sur le salaire. Chaque résident a un numéro AVS (format 756.XXXX.XXXX.XX).

### AbaConnect 💻
Programme partenaire d'Abacus pour connecteurs API certifiés. Nécessaire pour intégration profonde avec Abacus ERP.

### ADR 💻
**Architecture Decision Record.** Document court formalisant une décision technique structurante (contexte, options, choix, conséquences). Voir `/docs/architecture/decisions/`.

---

## B

### Bedrock 💻 (historique)
Service AWS d'accès managé aux modèles LLM. **Mention historique** : envisagé pour la couche IA de ZARYA, **remplacé par Infomaniak AI Services** (ADR 0010). Voir « Infomaniak AI Services ».

### Bexio 🇨🇭💻
Logiciel SaaS suisse de comptabilité + CRM + facturation pour PME. Très répandu (40%+ du marché PME suisse). Dispose d'une API publique mature et d'un module Payroll.

### Bouclement 🇨🇭🏢
Clôture annuelle des comptes d'une entreprise. Implique la production du bilan, compte de résultats, annexes et déclarations fiscales associées. Étape critique de l'année fiduciaire.

### Bbox 💻
**Bounding Box.** Rectangle délimitant une zone dans un document (PDF). Utilisé pour identifier visuellement les champs extraits par l'IA.

---

## C

### Cabinet 💻
Dans ZARYA, désigne un cabinet fiduciaire client de ZARYA. C'est le **tenant** principal. Voir `crm.cabinet`.

### Cabinet membre 💻
Utilisateur interne d'un cabinet (responsable, gestionnaire salaires, collaborateur, lecteur). Voir `crm.cabinet_membre`.

### CGU ⚖️
Conditions Générales d'Utilisation. Contrat entre ZARYA et ses cabinets clients.

### Chunking 🤖
Découpage d'un document en segments (chunks) avant indexation vectorielle. Typiquement 500 tokens avec overlap 50.

### Client 💻
Dans ZARYA, désigne le client final d'un cabinet fiduciaire (PME, indépendant, association). À ne pas confondre avec un cabinet (qui est un client de ZARYA, mais désigné `cabinet` dans le code). Voir `crm.client`.

### Embeddings (Infomaniak) 🤖
Modèles d'embedding fournis par Infomaniak (catégorie `embeddings`). Candidats pour le module Search. **Différé Phase 4.1+.**

### Crésus 🇨🇭💻
Suite logicielle suisse (Epsitec) pour comptabilité et salaires. Très répandue en Suisse romande. Pas d'API publique : intégration via export de fichiers.

### CRM 💻
**Customer Relationship Management.** Dans ZARYA, le schéma `crm.*` est le centre de vérité : cabinets, clients, contacts, services, échéances.

---

## D

### Décompte 🇨🇭🏢
Document récapitulant les flux comptables ou salariaux sur une période. Ex : décompte AVS trimestriel, décompte salaire mensuel.

### DPA ⚖️
**Data Processing Agreement.** Contrat de sous-traitance des données. ZARYA signe un DPA avec chaque cabinet client et avec chaque sous-traitant (AWS pour l'infra, Infomaniak pour l'IA, etc.).

### DPO ⚖️
**Data Protection Officer / Délégué à la Protection des Données.** Rôle obligatoire RGPD au-delà d'une certaine taille. ZARYA aura un DPO externe à terme.

---

## E

### Échéance 💻
Date limite pour une action (déclaration TVA, validation salaire, bouclement). Voir `crm.echeance`.

### Embedding 🤖
Représentation vectorielle d'un texte permettant la recherche sémantique. Stockée dans `pgvector`.

### ESTV 🇨🇭⚖️
**Eidgenössische Steuerverwaltung.** Nom alémanique de l'AFC. Gère le registre des numéros TVA.

### Extraction IA 💻
Brique transverse ZARYA qui transforme du contenu non structuré (PDF, Excel, email) en données structurées validées via LLM. Voir `/docs/modules/extraction-ia.md`.

---

## F

### Fiduciaire 🇨🇭🏢
Cabinet professionnel suisse offrant des services de comptabilité, fiscalité, conseil et gestion des salaires aux PME et particuliers. Équivalent fonctionnel d'un cabinet d'expertise comptable français mais avec scope plus large.

### FIDUCIAIRE|SUISSE 🇨🇭
Association faîtière des fiduciaires suisses.

### Fournisseur 💻
Dans ZARYA (module Facture), entité émettrice de factures vers un client (PME) du cabinet. Référencé par couple (cabinet, client_pme). Voir `facture.fournisseur`.

---

## G

### Gestionnaire salaires 💻
Rôle dans le cabinet, spécialisé sur les cycles de paie. Persona "Marc". Voir `personas.md`.

### Graph API 💻
**Microsoft Graph API.** Interface REST pour accéder aux données Microsoft 365 (Outlook, Calendar, OneDrive, SharePoint).

---

## H

### chat_small 🤖
Catégorie de modèle LLM rapide et économique (résolue au runtime via Infomaniak AI Services, sans id en dur). Utilisée dans ZARYA pour les volumes élevés (classification documents, détection changements salariaux).

### HNSW 💻
**Hierarchical Navigable Small World.** Algorithme d'index pour pgvector, optimisé pour la recherche vectorielle à grande échelle. Préféré à IVFFlat.

---

## I

### IBAN 🏢
**International Bank Account Number.** Identifiant standard d'un compte bancaire. Format suisse : CH + 19 caractères. Vérification par checksum mod-97.

### IDE 🇨🇭⚖️
**Identifiant des entreprises.** Numéro unique attribué à chaque entreprise enregistrée en Suisse. Format CHE-XXX.XXX.XXX. Source : Zefix.

### Inbox documentaire 💻
Vue principale du module Doc : liste des documents reçus, à classer ou validés. Vise à remplacer l'inbox email pour la gestion des PJ.

### Invocation (LLM) 💻
Un appel à un modèle LLM (catégories `chat_large`, `chat_small`, `embeddings`). Tracé dans `extraction.invocation` pour audit et facturation.

### Italien (canton du Tessin) 🇨🇭
Langue officielle dans le canton du Tessin. ZARYA supporte FR/DE/IT/EN.

---

## L

### LLM 🤖
**Large Language Model.** Modèle de langage massif. ZARYA accède aux LLM via Infomaniak AI Services, par catégorie (`chat_large`, `chat_small`), sans id de modèle en dur (ADR 0010).

### LPP 🇨🇭⚖️
**Loi sur la Prévoyance Professionnelle.** Deuxième pilier suisse (retraite professionnelle). Cotisation employeur + employé selon salaire.

### LRPC 💻
Logiciel reçu pas compte (acronyme interne, à éviter). À remplacer par les noms explicites.

---

## M

### Magic link 💻
Lien d'authentification à usage unique envoyé par email. Permet de se connecter sans mot de passe ou d'activer un compte.

### Mandat 🇨🇭🏢
Contrat de prestation signé entre une fiduciaire et son client. Définit le périmètre des services rendus (compta, fiscalité, salaires, conseil), la durée, et les honoraires. Voir `crm.mandat`.

### Microsoft 365 💻
Suite collaborative Microsoft (Outlook, OneDrive, Teams, SharePoint). Stack dominante des cabinets fiduciaires suisses. Voir `microsoft-integration.md`.

### Infomaniak AI Services 🤖
Service d'IA suisse (société + infra en Suisse), API OpenAI-compatible, qui fournit toute la couche IA de ZARYA : LLM (catégories `chat_large`/`chat_small`), reconnaissance de documents (catégorie `vision`) et embeddings (catégorie `embeddings`). Souveraineté suisse (ADR 0010). Catalogue en Beta. Remplace l'approche Bedrock/Mistral.

### MRR 💻
**Monthly Recurring Revenue.** Revenu récurrent mensuel. Métrique business clé.

### Multi-tenant 💻
Architecture où une seule instance d'application sert plusieurs clients (tenants) avec isolation stricte. ZARYA est multi-tenant natif via `cabinet_id` partout. Voir `multi-tenant.md`.

---

## N

### NAS 🏢
**Network Attached Storage.** Serveur de fichiers local d'un cabinet. Stocke typiquement 5-15 ans d'archives documentaires.

### nLPD 🇨🇭⚖️
**Nouvelle Loi sur la Protection des Données.** Loi suisse en vigueur depuis le 1er septembre 2023. Aligne la Suisse sur les standards RGPD avec quelques spécificités.

### NPA 🇨🇭🏢
**Numéro Postal d'Acheminement.** Équivalent suisse du code postal français. 4 chiffres.

### NPS 💻
**Net Promoter Score.** Métrique de satisfaction client (de -100 à +100).

---

## O

### OCR 🤖
**Optical Character Recognition.** Extraction du texte d'une image ou d'un PDF scanné. ZARYA utilisera Infomaniak vision (catégorie `vision`). **Différé Phase 4.1+.**

### Onboarding fiduciaire 💻
Processus d'inscription et de configuration d'un cabinet sur ZARYA. Une seule fois par cabinet, self-service complet. Voir `onboarding-fiduciaire.md`.

### Onboarding client 💻
Processus d'intégration d'un client (PME) dans le tenant d'un cabinet ZARYA. Inclut la fiche entreprise + le référentiel employés si service salaires. Voir `onboarding-client.md`.

---

## P

### Patrick / Aïcha 💻
Personas représentant les utilisateurs côté client final PME. Voir `personas.md`.

### Pennylane 🇫🇷
Concurrent indirect français, copilote IA pour comptables. Validation que le modèle peut marcher (levée massive).

### pgvector 💻
Extension Postgres pour stockage et recherche de vecteurs (embeddings). Utilisée pour le module Search.

### PII ⚖️
**Personally Identifiable Information.** Donnée personnelle au sens RGPD/nLPD. À filtrer dans les logs, audit, exports.

### PFPDT 🇨🇭⚖️
**Préposé Fédéral à la Protection des Données et à la Transparence.** Autorité suisse de protection des données.

### PME 🏢
**Petite et Moyenne Entreprise.** Cible principale des cabinets fiduciaires suisses. Définie en Suisse par < 250 employés et < 50M CHF de CA.

### Postgres 💻
Système de gestion de base de données relationnelle utilisé par ZARYA via Supabase. Versions 16+.

### Proposition 💻
Pattern récurrent ZARYA : une extraction IA produit une `proposition_*` qui est validée par un humain avant de devenir une entité finale. Voir `extraction-ia.md`.

### PWA 💻
**Progressive Web App.** Application web avec capacités quasi-natives (offline, push, install). Utilisée pour le dashboard client mobile.

---

## Q

### QR-facture 🇨🇭🏢
Format de facture suisse standard depuis 2022 avec QR code contenant toutes les informations de paiement. Remplace les anciens BVR/ESR.

### Quota 💻
Limite d'usage par cabinet selon son plan (clients, employés, LLM, stockage). Voir `pricing.md`.

---

## R

### RAG 🤖
**Retrieval Augmented Generation.** Technique combinant recherche documentaire et génération LLM. Cœur du module Search ZARYA.

### Relance 💻
Email automatique généré par ZARYA pour rappeler à un client une action en attente. Voir `crm.relance` et `calendar.md`.

### Responsable cabinet 💻
Rôle principal d'un cabinet sur ZARYA. Persona "Sophie". Tous droits sur le tenant.

### RGPD ⚖️
**Règlement Général sur la Protection des Données.** Réglementation européenne (UE) en vigueur depuis 2018. ZARYA traite des employés/clients UE → applicable.

### RLS 💻
**Row Level Security.** Mécanisme Postgres pour filtrer automatiquement les lignes selon le user. Cœur de l'isolation multi-tenant ZARYA.

### Run my Accounts 🇨🇭
Concurrent indirect : SaaS comptable suisse pour PME et fiduciaires.

---

## S

### SaaS 💻
**Software as a Service.** Modèle de distribution logicielle par abonnement, hébergement cloud, mises à jour continues. ZARYA est un SaaS B2B.

### chat_large 🤖
Catégorie de modèle LLM principal (résolue au runtime via Infomaniak AI Services, sans id en dur) pour les extractions critiques (factures, employés, clients).

### Sophie 💻
Persona représentant le responsable cabinet. Voir `personas.md`.

### Stripe 💻
Prestataire de paiement utilisé par ZARYA pour les abonnements cabinets.

### Supabase 💻
Stack BaaS (Backend as a Service) basée sur Postgres. Fournit DB + Auth + Storage + Vault + pgvector + Realtime. Hébergement eu-central-1.

### Swissdec 🇨🇭⚖️
Norme suisse de déclaration de salaires (formulaire ELM = Einheitliches Lohnmeldeverfahren). Permet la transmission automatique aux assurances sociales.

### SMB 💻
**Server Message Block.** Protocole de partage de fichiers réseau (standard Windows et cross-platform). Utilisé pour la connexion NAS.

---

## T

### Tenant 💻
Locataire d'une instance multi-tenant. Dans ZARYA = cabinet fiduciaire.

### Infomaniak vision 🤖
Catégorie de modèle `vision` d'Infomaniak AI Services pour la reconnaissance de documents (OCR). Candidat pour les modules Doc/Facture. **Différé Phase 4.1+.**

### Token 💻
- **OAuth token** : credentials d'accès à une API tierce (Microsoft, Bexio)
- **JWT token** : token d'authentification ZARYA contenant cabinet_id et role
- **LLM token** : unité de facturation des modèles (≈ 0.75 mot en français)

### TVA 🇨🇭⚖️
**Taxe sur la Valeur Ajoutée.** Impôt suisse principal sur la consommation. Taux 2026 : 0%, 2.6%, 3.8%, 8.1%. Déclarations trimestrielles ou semestrielles selon régime.

---

## U

### UID 🇨🇭⚖️
Anglais pour IDE. **Unternehmens-Identifikationsnummer.**

---

## V

### Validation 1-clic 💻
UX pattern central de ZARYA : quand l'IA propose une donnée avec haute confiance, l'utilisateur valide en un seul clic sans devoir tout retaper.

### Validation granulaire 💻
UX pattern de l'onboarding client : chaque champ d'un employé doit être explicitement validé (pas de bouton "Tout valider"). Voir ADR 0007.

### Vault 💻
**Supabase Vault.** Chiffrement applicatif des champs sensibles (IBAN, tokens OAuth). Indépendant du chiffrement at-rest standard.

### Vercel 💻
Plateforme d'hébergement Next.js utilisée par ZARYA. Région principale eu-central-1.

---

## W

### Webhook 💻
Notification HTTP envoyée par un service tiers à ZARYA pour signaler un événement (nouveau email Microsoft, paiement Stripe, etc.). Permet le temps réel.

### WCAG 💻
**Web Content Accessibility Guidelines.** Standards d'accessibilité web. ZARYA vise WCAG 2.1 niveau AA à terme.

### WinBIZ 🇨🇭💻
Suite logicielle suisse pour PME (comptabilité, paie, gestion commerciale). Concurrent de Bexio sur certains segments.

---

## X-Y-Z

### Zarya 💻
Nom du produit. Choisi pour sa sonorité moderne, neutre culturellement, et sa lettre Z distinctive.

### Zefix 🇨🇭💻
**Zentraler Firmenindex.** Registre central des entreprises suisses. API publique gratuite. ZARYA utilise Zefix pour l'auto-remplissage de l'identité (cabinet et clients).

---

## Acronymes par catégorie

### Légaux suisses
- AVS, LPP, AC (Assurance Chômage), IS (Impôt à la Source)
- TVA, IDE, IDE-TVA
- nLPD, PFPDT, AFC, ESTV
- Swissdec ELM

### Légaux européens
- RGPD, DPO, DPA, PII

### Techniques
- LLM, RAG, OCR, OAuth, JWT, RLS, HNSW, SaaS, PWA, NAS, SMB
- API, REST, JSON, ZIP, PDF

### Business
- MRR, ARR, CAC, LTV, NPS, NRR, PMF (Product-Market Fit)

### ZARYA interne
- ADR (Architecture Decision Record)
- Validation 1-clic, validation granulaire
- Proposition (pattern récurrent)
- Cabinet, Client, Tenant (avec leurs nuances)

---

## À tenir à jour

Ce glossaire est révisé :
- À chaque ajout de terme métier (interview, retour pilote)
- À chaque ajout de terme technique (nouveau module, nouvelle intégration)
- Lors de l'onboarding d'un nouveau membre d'équipe

Termes obsolètes marqués deprecated avec lien vers le remplaçant.
