---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
domain: architecture
depends_on: [data-residency, multi-tenant]
referenced_by: [crm, doc, facture, salaire, dashboard-client, onboarding-fiduciaire, onboarding-client, llm-strategy]
---

# Sécurité et audit

## 1. Principes directeurs

ZARYA traite des données fiduciaires hautement sensibles : salaires nominatifs, IBAN, factures détaillées, déclarations fiscales. La sécurité n'est pas une feature, c'est une **fondation**.

5 principes :
1. **Defense in depth** : pas un seul point de défaillance, plusieurs couches indépendantes
2. **Least privilege** : chaque user/service a le minimum de droits nécessaires
3. **Audit complet** : toute action sensible est tracée, conservation 6 ans (obligation fiduciaire CH)
4. **Conformité by design** : RGPD + nLPD intégrés à l'architecture, pas ajoutés après
5. **Transparence avec l'utilisateur** : le cabinet voit ses logs d'audit, le client voit qui accède à ses données

## 2. Cadre légal applicable

### 2.1 nLPD (Suisse)
**Nouvelle Loi sur la Protection des Données**, en vigueur depuis le 1er septembre 2023.

Exigences clés pour ZARYA :
- **Information** : informer les personnes concernées de la collecte et du traitement
- **Consentement** : explicite pour les données sensibles (salariales, santé)
- **Minimisation** : ne collecter que ce qui est nécessaire
- **Sécurité** : mesures techniques et organisationnelles appropriées
- **Notification des violations** : 72h pour informer le PFPDT en cas de fuite
- **Droits des personnes** : accès, rectification, suppression, portabilité
- **Sous-traitance** : contrat de sous-traitance pour chaque acteur tiers (AWS, Mistral, Supabase)

### 2.2 RGPD (UE)
Applicable si des données concernent des citoyens UE (très probable : employés frontaliers français, par exemple).

Exigences similaires à la nLPD, avec quelques spécificités :
- **DPO** : pas obligatoire pour ZARYA à court terme, mais bon à anticiper
- **Registre des traitements** : à tenir à jour
- **Études d'impact** (PIA) : pour les traitements à risque

### 2.3 Secret professionnel fiduciaire
Le secret professionnel s'étend aux **sous-traitants** du fiduciaire. ZARYA est de facto soumis à des obligations équivalentes :
- Non-divulgation à des tiers
- Pas d'utilisation des données pour autre chose que la prestation
- Pas de transfert hors mandat

## 3. Architecture de sécurité

### 3.1 Périmètres
```
[Internet]
    ↓ HTTPS (TLS 1.3)
[Cloudflare / Vercel Edge]
    ↓ Authentication required (sauf landing)
[Application Next.js]
    ↓ Server-side
[Supabase API + Auth]
    ↓ RLS Postgres + Service Role
[Postgres + Storage (eu-central-1)]
```

### 3.2 Couches de protection
1. **Edge** : protection DDoS, WAF, rate limiting général
2. **Application** : auth, session, CSRF, validation des inputs
3. **Database** : RLS, fonctions sécurisées, audit triggers
4. **Stockage** : chiffrement at rest, access control par bucket
5. **Réseau** : VPC isolé, security groups, pas d'exposition publique des DB

## 4. Authentification

### 4.1 Supabase Auth
Provider d'authentification central pour les 2 types d'utilisateurs :

**Type A — Membres du cabinet**
- Email + mot de passe (politique stricte, voir § 4.3)
- 2FA fortement recommandée (Phase 2 : obligatoire)
- Sessions 24h par défaut, configurable par cabinet
- Magic links possibles pour reset

**Type B — Contacts client final**
- Email + mot de passe
- 2FA optionnelle, recommandée si accès données salariales
- Sessions 24h
- Activation initiale par magic link (envoyé par le cabinet)

### 4.2 SSO entreprise (Phase 2)
Pour les gros cabinets : SAML, Active Directory, Microsoft Entra ID.
Pas de scope MVP.

### 4.3 Politique de mot de passe
Standards 2026 (alignés sur NIST 800-63B) :
- Longueur min : 12 caractères
- Pas de complexité forcée (chiffres/majuscules) — la longueur compte plus
- Vérification contre la liste des mots de passe compromis (haveibeenpwned API)
- Pas d'expiration forcée (sauf compromission suspectée)
- Rate limiting des tentatives : 5 essais / 15 min / IP

### 4.4 Récupération de compte
- Magic link par email (TTL 1h)
- Vérification de l'email avant changement de mdp
- Notification au user à chaque reset (l'utilisateur sait s'il est attaqué)

### 4.5 Détection d'anomalies
- Connexion depuis nouvelle IP / nouvelle géographie → notification email
- Multiple échecs sur un même compte → blocage temporaire
- Login en dehors des heures habituelles → alerte (configurable)

### 4.6 Sessions
- Cookies httpOnly, secure, SameSite=Strict
- Token JWT signé (HS256) avec rotation à chaque refresh
- Logout sur tous les devices possible (révocation des refresh tokens)
- Liste des sessions actives consultable par l'user

## 5. Autorisation

### 5.1 Modèle RBAC
3 niveaux de rôles côté cabinet :
- **responsable** : tous droits sur le tenant cabinet
- **gestionnaire_salaires** : accès complet aux modules Salaire + lecture autre
- **collaborateur** : accès opérationnel (Doc, CRM, Facture, Calendar) sans accès salaires détaillés
- **lecteur** : lecture seule

1 niveau de rôle côté client :
- **client_contact** : accès au dashboard client uniquement, scopé sur son `client_id`

### 5.2 Implémentation
- `auth.users.app_metadata.role` injecté dans le JWT
- Helpers applicatifs vérifient le rôle avant chaque opération sensible
- RLS Postgres filtre au niveau de la DB (deuxième couche de protection)

### 5.3 Permissions custom (Phase 2)
Possibilité de définir des permissions spécifiques par user :
- Accès à tel client seulement (cas freelance multi-clients)
- Lecture seule sur certains modules
- Limite par montant (validation facture < 5000 CHF par ex.)

Stockées dans `crm.cabinet_membre.permissions_specifiques` (jsonb).

### 5.4 Privilege escalation
- Aucun utilisateur ne peut s'auto-promouvoir
- Création d'un nouveau `responsable` : nécessite validation par un autre responsable
- Audit log sur tous les changements de rôle

## 6. Multi-tenant et isolation

Voir document dédié : [`/docs/architecture/multi-tenant.md`](./multi-tenant.md).

Points critiques rappelés :
- `cabinet_id` sur toutes les tables métier
- RLS Postgres systématique
- Tests d'isolation automatisés en CI
- Fonction `current_cabinet_id()` comme source de vérité

## 7. Chiffrement

### 7.1 In transit
- **TLS 1.3** obligatoire partout (frontend ↔ backend, backend ↔ DB, backend ↔ APIs externes)
- Certificats Let's Encrypt ou Vercel Edge
- HSTS activé avec preload
- Pas de fallback HTTP

### 7.2 At rest
- **Postgres** : chiffrement at rest natif Supabase (LUKS sur le filesystem AWS)
- **Storage** : chiffrement S3 server-side encryption (SSE-S3)
- **Backups** : chiffrés avec rotation des clés

### 7.3 Applicatif (champs ultra-sensibles)
Supabase Vault pour chiffrer **au niveau applicatif** certaines colonnes :
- IBAN (clients, fournisseurs, employés)
- Numéro AVS
- Credentials OAuth stockés (`crm.cabinet_integration.credentials`)
- Tokens API tiers

Avantage : même un admin DB ne peut pas lire ces champs en clair sans la clé Vault.

### 7.4 Clés
- Master key : gérée par Supabase / AWS KMS
- Clés applicatives : rotation annuelle minimum
- Pas de clé en clair dans le code ou les configs

### 7.5 Bedrock et données envoyées au LLM
Voir [`llm-strategy.md`](./llm-strategy.md) :
- Pas de prompt caching pour les données sensibles
- AWS contractuellement engagé à ne pas utiliser les données pour entraîner
- Logs Bedrock conservés 30 jours côté AWS, accessibles uniquement pour debug

## 8. Audit log

### 8.1 Périmètre
Toutes les actions sensibles sont **logguées** :
- Connexions / déconnexions
- Création / modification / suppression de ressources métier
- Accès aux données (read tracking pour les ressources sensibles)
- Modifications de permissions
- Exports de données
- Appels API externes (Bexio, Microsoft, Zefix, Bedrock)

### 8.2 Tables d'audit
**Existantes** dans le modèle :
- `crm.evenement` : événements métier client-level
- `audit.cabinet_evenement` : événements cabinet-level
- `extraction.invocation` : appels LLM
- `salaire.evenement` : événements salaires détaillés

**À créer** dans un schéma `audit.*` dédié :
- `audit.connexion` : login/logout
- `audit.acces_donnee_sensible` : read tracking sur salaires/IBAN/etc.
- `audit.export` : tous les exports de données
- `audit.modification_permission` : changements RBAC
- `audit.api_externe` : tous les appels Bexio, Microsoft, etc.

### 8.3 Contenu d'une entrée d'audit
Pour chaque événement :
- `cabinet_id`
- `acteur_id` + `acteur_type` (cabinet_membre, client_contact, csm_zarya, systeme)
- `ressource_id` + `ressource_type`
- `action` (create, update, delete, read, export, ...)
- `timestamp`
- `ip_origine`
- `user_agent`
- `valeurs_avant` + `valeurs_apres` (pour update)
- `metadata` (jsonb)

### 8.4 Append-only
Les tables d'audit sont **append-only** :
- Pas de DELETE possible (RLS + permissions Postgres)
- Pas de UPDATE sur les logs
- Conservation 6 ans minimum (obligation fiduciaire CH)

### 8.5 Consultation
- **Cabinet** : peut consulter ses propres logs via UI (filtres par utilisateur, par ressource, par date)
- **Client final** : peut consulter qui a accédé à ses données (transparence)
- **ZARYA support** : accès aux logs uniquement avec justification + audit du support

### 8.6 Partitionnement
À partir de ~50K événements/mois/cabinet, partitionner par mois pour performance.

### 8.7 Export et archivage
- Export des logs par cabinet en JSON/CSV (RGPD : droit d'accès)
- Archivage froid (S3 Glacier) après 1 an pour réduire les coûts

## 9. Détection et réponse aux incidents

### 9.1 Monitoring temps réel
Alertes via CloudWatch / Sentry :
- Tentatives de bruteforce
- Erreurs RLS anormales (signal de bug ou attaque)
- Volume d'export anormal (signal d'exfiltration)
- Appels API tiers en échec massif
- Latence anormale sur les opérations sensibles

### 9.2 SIEM (Phase 2)
Intégration d'un SIEM (Security Information and Event Management) pour corrélation avancée. Hors-scope MVP.

### 9.3 Plan de réponse
Documenté dans un runbook séparé (à créer) :
- Détection
- Containment
- Eradication
- Recovery
- Lessons learned

### 9.4 Notification de violation
Process automatisé pour respecter le délai légal :
- nLPD : notification au PFPDT dans les 72h
- RGPD : notification à la CNIL (ou homologue) dans les 72h
- Notification aux personnes concernées si risque élevé

## 10. Gestion des secrets

### 10.1 Pas de secrets en clair
- Pas dans le code (`.gitignore` strict)
- Pas dans les configs versionnées
- Pas dans les logs (filtrage applicatif)
- Pas dans l'URL (jamais)

### 10.2 Stockage
- **Variables d'environnement** : Vercel Env, AWS Secrets Manager
- **DB credentials** : Supabase service role keys, rotation trimestrielle
- **API keys tiers** : AWS Secrets Manager, rotation selon politique du fournisseur

### 10.3 Accès
- Pas plus de 3 personnes ZARYA avec accès aux secrets prod
- 4-eyes principle pour modifications critiques
- Audit de tous les accès aux secrets

### 10.4 Rotation
- DB credentials : trimestrielle
- API keys : selon politique du fournisseur (Bedrock = annuelle min, Microsoft = en fonction)
- JWT signing keys : annuelle
- Vault keys : annuelle

## 11. Sécurité applicative

### 11.1 Validation des inputs
- **Côté client** : validation pour UX, pas pour sécurité
- **Côté serveur** : validation systématique avec Zod (schémas stricts)
- **DB level** : contraintes CHECK, FK, NOT NULL

### 11.2 SQL Injection
- Pas de SQL string concatenation
- Queries paramétrées via Supabase client ou Prisma ORM
- Code review systématique sur les routes DB

### 11.3 XSS
- Next.js échappe automatiquement les outputs
- Content Security Policy stricte
- Pas de `dangerouslySetInnerHTML` sauf cas validés

### 11.4 CSRF
- SameSite=Strict sur les cookies de session
- Tokens CSRF pour les opérations sensibles (modifications)

### 11.5 Server-Side Request Forgery (SSRF)
- Whitelist stricte des URLs accessibles depuis le backend
- Pas de fetch d'URL fournie par l'utilisateur sans validation

### 11.6 Injection de prompt (LLM)
Voir [`extraction-ia.md` § 11.2](../modules/extraction-ia.md) :
- Encadrement par balises XML
- Échappement des caractères de contrôle
- Pas de suivi d'instructions venant du contenu utilisateur

### 11.7 Upload de fichiers
- Validation MIME type
- Vérification de la signature binaire (magic bytes)
- Taille max enforced (50 MB par fichier MVP)
- Scan antivirus (ClamAV ou équivalent) avant traitement (Phase 2)
- Stockage isolé du code applicatif

### 11.8 Headers de sécurité
- Strict-Transport-Security
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY (sauf iframe Stripe Checkout)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: minimal

## 12. Conformité opérationnelle

### 12.1 Registre des traitements (RGPD/nLPD)
À maintenir dans `/docs/compliance/registre.md` (à créer Phase 2 dev) :
- Liste des traitements
- Finalité
- Base légale
- Catégories de données
- Destinataires
- Durée de conservation
- Mesures de sécurité

### 12.2 DPA (Data Processing Agreement)
- DPA avec chaque cabinet client (template inclus dans les CGU)
- DPA avec chaque sous-traitant (AWS, Mistral, Supabase, Stripe)
- Versions signées conservées

### 12.3 Audits externes
- Audit annuel de sécurité (penetration test)
- Audit RGPD/nLPD par juriste spécialisé (à l'année 2)
- Certifications éventuelles : ISO 27001 (Phase 3+)

## 13. Sauvegardes et continuité

### 13.1 Backups Postgres
- Backups automatiques quotidiens via Supabase (rétention 7-30 jours selon plan)
- Point-in-time recovery (PITR) sur 7 jours
- Test de restauration mensuel (drill)

### 13.2 Backups Storage
- Versioning S3 activé
- Réplication cross-region (Phase 2)

### 13.3 RTO / RPO
- **RTO** (Recovery Time Objective) cible : 4 heures
- **RPO** (Recovery Point Objective) cible : 1 heure

### 13.4 Plan de continuité
- Documentation runbooks (à créer)
- Tests de basculement annuels
- Communication client en cas d'incident

## 14. Sécurité des intégrations

### 14.1 OAuth flows (Microsoft, Bexio)
- State parameter pour anti-CSRF
- PKCE si supporté
- Validation des redirect URIs stricte
- Stockage chiffré des refresh tokens

### 14.2 Webhooks entrants
- Validation de signature systématique (HMAC)
- IP whitelist quand possible
- Idempotence pour éviter rejouage malveillant

### 14.3 APIs sortantes
- TLS validation stricte (pas de skip cert)
- Timeouts configurés
- Rate limiting interne pour ne pas saturer les tiers

## 15. Personal Data Lifecycle

### 15.1 Création
- Saisie utilisateur OU import OU extraction IA
- Consentement enregistré quand pertinent

### 15.2 Stockage
- Chiffrement at rest
- RLS multi-tenant
- Champs sensibles chiffrés applicativement

### 15.3 Utilisation
- Logs d'accès
- Permissions vérifiées à chaque accès
- Pas d'usage hors finalité initiale

### 15.4 Conservation
- Durée selon type :
  - Données comptables/fiscales : 10 ans (obligation CH)
  - Données salariales : 10 ans
  - Logs d'audit : 6 ans
  - Données prospects abandonnés : 90 jours

### 15.5 Suppression
- Soft delete d'abord (`archived_at`)
- Hard delete après délai (30 jours par défaut)
- Anonymisation des logs (les identifiants restent, le PII est masqué)

### 15.6 Portabilité
- Export complet en JSON / CSV / ZIP à la demande
- Format documenté pour import dans autre solution

## 16. Tests de sécurité

### 16.1 Tests automatisés
- Tests d'isolation multi-tenant en CI (obligatoire)
- Tests d'authentification et autorisation
- Tests de validation des inputs
- Tests de présence des headers de sécurité

### 16.2 Tests manuels
- Penetration test annuel (externe)
- Code review systématique sur tous les changements touchant l'auth/RLS/secrets
- Threat modeling pour chaque nouveau module

### 16.3 Dependency scanning
- Snyk ou Dependabot pour vulnérabilités tierces
- Mise à jour mensuelle des dépendances
- Réaction < 24h sur vulnérabilités critiques

## 17. Formation et culture

### 17.1 Onboarding sécurité dev
- Lecture de ce document obligatoire
- Formation aux pièges courants (OWASP Top 10)
- Pair programming pour les premiers PRs

### 17.2 Code review
- 100% des PRs reviewées
- Checklist sécurité dans le template de PR

### 17.3 Veille
- Veille sur OWASP, CVE, blogs sécurité majeurs
- Conférence sécurité par an minimum (équipe)

## 18. Sécurité du dashboard client (rappel critique)

Voir [`dashboard-client.md` § 13](../modules/dashboard-client.md).

Points critiques rappelés :
- RLS double : `cabinet_id` ET `client_id`
- Vues filtrées dédiées, pas d'accès direct aux tables
- Champs invisibles au client : notes internes, identité gestionnaire, tarification, risque, audit interne
- 2FA recommandée pour les accès données salariales

## 19. Risques majeurs identifiés

### 19.1 Fuite cross-tenant
**Probabilité** : moyenne (erreurs RLS possibles)
**Impact** : critique (perte de confiance massive)
**Mitigation** : tests automatisés, code review, audits

### 19.2 Compromission d'un compte cabinet
**Probabilité** : moyenne (phishing courant)
**Impact** : élevé (accès à toutes les données du cabinet)
**Mitigation** : 2FA recommandée puis obligatoire, détection d'anomalies, audit

### 19.3 Compromission d'un sous-traitant
**Probabilité** : faible (AWS, Microsoft, Supabase sont solides)
**Impact** : très élevé (données massives)
**Mitigation** : DPA, monitoring, plan de réponse

### 19.4 Injection de prompt LLM
**Probabilité** : faible
**Impact** : faible (LLM n'a pas accès aux outils sensibles directement)
**Mitigation** : encadrement, validation des outputs, pas d'exécution directe

### 19.5 Fraude au RIB
**Probabilité** : élevée (attaque classique des fiduciaires)
**Impact** : élevé (perte financière côté client)
**Mitigation** : détection automatique de changement IBAN, alertes fortes, validation humaine

## 20. Hors-scope MVP

- **Penetration test** complet : Phase 2 (avant les 10 premiers clients payants)
- **Certification ISO 27001** : Phase 3+
- **SIEM** intégré : Phase 2
- **Scan antivirus** des uploads : Phase 1.5
- **2FA obligatoire** : Phase 2 (recommandée au MVP)
- **SSO entreprise** : Phase 2
- **Bug bounty program** : Phase 3
- **HSM** (hardware security module) : non-applicable (Supabase Vault suffit)

## 21. Questions ouvertes

- [ ] **Politique de mot de passe exacte** : 12 caractères suffisants ? Vérification haveibeenpwned obligatoire ?
- [ ] **2FA obligatoire** : à partir de quand ? Pour quels rôles ?
- [ ] **Durée de conservation des logs d'audit** : 6 ans obligatoires CH, mais après ?
- [ ] **Read tracking** : tracer chaque lecture de salaire ? Volume de logs énorme à anticiper
- [ ] **Détection d'exfiltration** : seuil de volume à partir duquel on alerte ?
- [ ] **Notification au client final** : doit-il être notifié si son cabinet exporte ses données ?
- [ ] **Pénétration test** : interne (employé sécurité) ou externe (cabinet spécialisé) ?
- [ ] **Cyber-assurance** : pertinente dès le MVP ou Phase 2 ?
- [ ] **DPO externe** : nécessaire à quelle taille ?
- [ ] **Stockage des hash mot de passe** : argon2id (Supabase défaut) suffit ?
