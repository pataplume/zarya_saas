---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
domain: architecture
depends_on: [data-residency, multi-tenant, security-and-audit]
referenced_by: [doc, search, onboarding-fiduciaire]
---

# Ingestion NAS

## 1. Contexte

La plupart des cabinets fiduciaires suisses stockent leurs documents sur un **NAS** (Network Attached Storage) en réseau local : Synology, QNAP, parfois Windows Server avec partages SMB.

Ce stockage historique contient :
- 5 à 15 ans d'archives documentaires
- Documents reçus par courrier, scan, email migré manuellement
- Convention de nommage et arborescence souvent ad-hoc, par cabinet

**ZARYA doit pouvoir ingérer ce contenu** pour :
- **Module Doc** : récupérer les nouveaux documents qui n'arrivent pas par email
- **Module Search** : indexer l'historique pour permettre la recherche conversationnelle

Sans cette intégration, ZARYA est **aveugle** à 80% des documents existants d'un cabinet établi.

## 2. Stratégies possibles

### 2.1 Pattern A — Lecture seule (recommandé MVP)
ZARYA se connecte au NAS, **lit** les nouveaux fichiers, et copie les contenus pertinents dans Supabase Storage (avec un lien vers le chemin NAS original conservé).

**Avantages** :
- Le cabinet garde son NAS comme source de vérité
- Pas de risque de corruption des données existantes
- Aucune migration de données nécessaire
- Le cabinet continue d'utiliser ses logiciels comme avant

**Inconvénients** :
- Duplication potentielle (NAS + Supabase Storage)
- Synchronisation à maintenir (que faire si un fichier est modifié côté NAS ?)
- Performance dépend du NAS

### 2.2 Pattern B — Lecture/écriture (Phase 2)
ZARYA peut **écrire** sur le NAS : ranger automatiquement les documents reçus par email selon la convention du cabinet.

**Avantages** :
- Cohérence totale : le NAS reste à jour
- Le cabinet retrouve les documents au même endroit qu'avant

**Inconvénients** :
- Risque plus élevé (mauvaise opération côté ZARYA = données perdues côté NAS)
- Permissions complexes à gérer
- Tests rigoureux nécessaires

### 2.3 Pattern C — Migration complète
Le NAS est **abandonné** au profit de Supabase Storage.

**Avantages** :
- Architecture propre et unifiée
- Performance optimale
- Pas de dépendance NAS

**Inconvénients** :
- **Bloquant pour beaucoup de cabinets** (NAS = colonne vertébrale)
- Migration de 5-15 ans d'archives = projet majeur
- Trust issue : "vous voulez que je vous donne mes 10 ans d'archives ?"

### 2.4 Choix MVP
**Pattern A (lecture seule)** pour le MVP.

Justifications :
- Friction d'adoption minimale (le cabinet ne change rien à son workflow)
- Risque technique maîtrisable
- Permet de valider l'usage avant d'investir dans le pattern B
- Compatible avec tous les types de NAS

Le pattern B sera proposé en Phase 2 comme **option configurable** par cabinet.

## 3. Protocoles supportés

### 3.1 SMB / CIFS (priorité 1)
Le standard de facto en environnement Windows et cross-platform.

- **SMB 3.x** supporté par Synology, QNAP, Windows Server moderne
- **SMB 2.x** legacy, à supporter par défaut pour rester compatible
- **SMB 1.x** déprécié et insecure, **non supporté** (alerte de sécurité au cabinet)

Library Node.js : `smb2` ou `@marsaud/smb2`. Confiance 70% sur la maturité MVP, à valider en pilote.

### 3.2 WebDAV (priorité 2)
Standard pour les NAS modernes qui exposent une interface HTTP :
- Synology DSM expose WebDAV nativement
- QNAP idem
- OwnCloud / Nextcloud

Library Node.js : `webdav-client`. Plus moderne et plus stable que SMB.

### 3.3 SFTP (priorité 3)
Pour les setups custom avec serveurs Linux/BSD.

Library : `ssh2-sftp-client`. Fiable mais moins fréquent chez les fiduciaires.

### 3.4 FTP
**Non supporté**. Trop insecure (pas de chiffrement par défaut). Si un cabinet l'utilise encore, on le force à migrer vers WebDAV ou SMB.

## 4. Configuration au sein du wizard onboarding fiduciaire

### 4.1 Étape E du wizard
Section "NAS" :

```
┌──────────────────────────────────────────┐
│ 📁 Connecter votre NAS                   │
│                                          │
│ ZARYA peut lire les documents stockés   │
│ sur votre NAS pour les indexer et les   │
│ rendre recherchables.                    │
│                                          │
│ Protocole : [SMB ▼]                      │
│ Adresse : [192.168.1.100         ]       │
│ Chemin :  [/volume1/fiduciaire   ]       │
│ Utilisateur : [zarya_readonly    ]       │
│ Mot de passe : [••••••••         ]       │
│                                          │
│ Stratégie : ⦿ Lecture seule              │
│             ○ Lecture + écriture (Ph.2) │
│                                          │
│ [Tester la connexion]                    │
└──────────────────────────────────────────┘
```

### 4.2 Test de connexion en live
- Tentative de connexion immédiate
- Lecture du dossier racine (liste de premier niveau)
- Détection du nombre approximatif de fichiers
- Retour clair : ✓ Connexion réussie OU ✗ Erreur détaillée

### 4.3 Recommandations affichées
- "Créez un utilisateur dédié `zarya_readonly` avec accès lecture seule"
- "Limitez l'accès à votre dossier `/fiduciaire` ou équivalent"
- "Ne donnez pas accès aux dossiers personnels des collaborateurs"

### 4.4 Stockage credentials
- Hostname / IP, port, chemin → `crm.cabinet_integration.parametres` (en clair)
- Username → `parametres` (en clair)
- Password → `credentials` chiffré (Supabase Vault)

## 5. Architecture d'ingestion

### 5.1 Modèle pull (ZARYA initie)
ZARYA scanne périodiquement le NAS et récupère les nouveaux fichiers :

```
[Job ZARYA toutes les 10 minutes]
        ↓
[Connexion au NAS avec credentials cabinet]
        ↓
[Listing récursif du chemin configuré]
        ↓
[Comparaison avec snapshot précédent]
   - Nouveaux fichiers
   - Fichiers modifiés (timestamp)
   - Fichiers supprimés
        ↓
[Pour chaque nouveau/modifié]
   - Download du contenu
   - Hash (déduplication)
   - Stockage dans Supabase Storage
   - Création doc.document_brut
   - Trigger pipeline classification (module Doc)
        ↓
[Mise à jour snapshot]
```

### 5.2 Modèle push (NAS notifie ZARYA)
**Hors-scope MVP**. Implique un agent installé côté cabinet, complexité opérationnelle élevée.

### 5.3 Fréquence et planning
- **Scan complet** : toutes les 4 heures (en dehors des heures de pointe cabinet)
- **Scan incrémental** : toutes les 10 minutes (seulement les dossiers récemment modifiés)
- **Trigger manuel** : bouton "Synchroniser maintenant" dans l'UI

### 5.4 Limites et quotas
- Volume max ingéré par cabinet par jour : 10 GB (Starter), 50 GB (Pro), illimité Enterprise
- Nombre max de fichiers scannés : 100K par cycle (sinon : alerte cabinet pour réduire le scope)
- Taille max par fichier : 100 MB (au-delà : ignoré + log)

## 6. Gestion de l'arborescence

### 6.1 Convention détectée
Au premier scan, ZARYA tente de **détecter la convention** du cabinet :
- Pattern par client : `/clients/{client_nom}/...`
- Pattern par année : `/{annee}/...`
- Pattern par type : `/factures/...`, `/salaires/...`

Détection IA légère sur les noms de dossiers + analyse des fichiers contenus.

### 6.2 Inférence du rattachement client
À partir du chemin :
- `/clients/Dupont SA/2026/factures/swisscom_avril.pdf` → client `Dupont SA`, période avril 2026, type facture
- Heuristique : si la convention est claire, le rattachement client est ~95% fiable
- Sinon : fallback sur l'extraction IA (module Doc)

### 6.3 Configuration manuelle
Le cabinet peut **override** la détection automatique :
- "Le dossier `/0_archives_2020` doit être ignoré"
- "Le dossier `/Tests_Internes` doit être ignoré"
- "Mes clients sont dans `/MANDATS/` pas `/clients/`"

## 7. Sécurité

### 7.1 Connexion sécurisée
- **SMB** : utiliser SMB 3 chiffré quand possible (négo automatique)
- **WebDAV** : HTTPS obligatoire (HTTP refusé)
- **SFTP** : SSH key authentication > password
- TLS validation stricte (pas de skip cert même en cas de cert self-signed du NAS : on documente comment installer un cert valide)

### 7.2 Principe du moindre privilège
Le compte ZARYA sur le NAS doit avoir :
- **Lecture seule** sur les dossiers ciblés
- **Aucun accès** au reste du NAS
- Utilisateur dédié, mot de passe spécifique
- Documentation fournie au cabinet pour configurer correctement

### 7.3 Audit
Chaque scan logué :
- `cabinet_id`
- Volume scanné (bytes, nb fichiers)
- Volume téléchargé
- Erreurs rencontrées
- Durée

Consultable par le cabinet.

### 7.4 Données sensibles dans les noms de fichiers
Risque : un cabinet peut avoir `salaire_directeur_2020.pdf` qui révèle de l'info sensible juste par le nom.

ZARYA n'expose **jamais** les noms de fichiers à l'extérieur du tenant. Logs internes anonymisés (hash) pour les opérations cross-cabinet.

### 7.5 Pas d'écriture en MVP
Pattern A only : impossible que ZARYA modifie ou supprime un fichier sur le NAS d'un cabinet. Limite radicalement le risque.

## 8. Réplication et synchronisation

### 8.1 Fichiers nouveaux
- Download dans Supabase Storage
- Hash calculé pour déduplication
- Pipeline du module Doc déclenché

### 8.2 Fichiers modifiés
**Détection** : timestamp `mtime` plus récent que dans le snapshot ZARYA.

**Comportement** :
- Récupération de la nouvelle version
- Création d'une nouvelle version dans `doc.document` (versioning simple)
- Notification éventuelle du collaborateur (si déjà classé)

### 8.3 Fichiers supprimés côté NAS
**Détection** : fichier absent du listing alors qu'il était dans le snapshot.

**Comportement MVP** :
- NE PAS supprimer côté ZARYA automatiquement
- Marquer le `doc.document.fichier_nas_disparu = true`
- Notification au cabinet : "X fichiers ont disparu du NAS, voulez-vous les archiver côté ZARYA ?"

Évite le risque de perte massive en cas de mauvaise manip côté NAS.

### 8.4 Fichiers renommés
Cas difficile à détecter : un fichier renommé apparaît comme "nouveau + ancien disparu".

**Stratégie** : déduplication par hash du contenu.
- Si un nouveau fichier a un hash existant déjà connu dans le même cabinet → probable renommage
- Mise à jour du chemin dans `doc.document.chemin_nas`
- Pas de re-traitement du contenu

## 9. Performance

### 9.1 Volumes typiques
- 50K à 500K fichiers par cabinet
- 100 GB à 2 TB de volume total
- 100 à 1000 nouveaux fichiers par jour

### 9.2 Stratégies d'optimisation
- **Listing incrémental** : utiliser les capacités du protocole pour filtrer par date de modification
- **Parallélisation** : 4-8 connexions concurrentes max (au-delà : risque de saturer le NAS)
- **Backoff intelligent** : si le NAS rame, ralentir
- **Cache du listing** : éviter les re-scans complets inutiles

### 9.3 Latence cible
- Détection d'un nouveau fichier : 10 min max (scan incrémental)
- Latence de la classification : voir module Doc (< 30 sec après détection)
- Indexation Search : voir module Search

## 10. Gestion d'erreurs

### 10.1 NAS injoignable
- Retry exponentiel (3 fois)
- Si toujours en échec : notification cabinet "NAS hors ligne depuis X heures"
- Pause des scans automatiques après 24h sans succès
- Reprise auto à la prochaine connexion réussie

### 10.2 Authentification échoue
- Distinguer credentials expirés vs IP changée vs NAS down
- Notification cabinet ciblée : "Vérifiez les credentials" ou "Vérifiez l'adresse"

### 10.3 Permission refusée sur un fichier
- Log silencieux (peut être normal : certains fichiers ont des perms restrictives)
- Compteur affiché : "12 fichiers non lus pour raisons de permissions"
- Pas de blocage du reste du scan

### 10.4 Fichier corrompu
- Log l'erreur
- Skip le fichier
- Notification cabinet si fréquent (signal de problème NAS)

### 10.5 Disk full côté ZARYA Storage
- Alerte ops
- Notification cabinet : "Quota atteint, contactez ZARYA"
- Pause de l'ingestion

## 11. Cas particuliers

### 11.1 NAS multi-volumes
Certains cabinets ont plusieurs volumes (un par associé, un partagé). À supporter :
- Multiple `crm.cabinet_integration` de type `nas` par cabinet
- Chacun avec son propre chemin / credentials

### 11.2 Réseau cabinet derrière VPN/NAT
Le NAS d'un cabinet n'est pas accessible publiquement (heureusement). Options :
- **Option 1** : Le cabinet ouvre un port (WebDAV HTTPS) vers internet. Solution simple mais expose le NAS.
- **Option 2** : ZARYA fournit un agent à installer dans le réseau cabinet qui fait le pont. Plus sécurisé mais complexité opérationnelle.

**Décision MVP** : Option 1 avec recommandations sécurité strictes (VPN, IP whitelist côté cabinet, certificat valide).

Option 2 à considérer en Phase 2 pour les cabinets exigeants.

### 11.3 Multiples conventions
Un cabinet peut avoir des conventions différentes selon les périodes ou les collaborateurs :
- `/anciens/clients/...` (avant 2020)
- `/MANDATS/...` (depuis 2020)

Configuration de plusieurs racines de scan possibles.

### 11.4 Symboliques liens et raccourcis
- Ignorer par défaut (risque de boucles infinies)
- Configurable si le cabinet en a besoin

## 12. Coûts d'ingestion

### 12.1 Stockage Supabase
- Volume dupliqué entre NAS et Supabase Storage
- Stockage : ~0.021 USD/GB/mois (S3 standard)
- Pour 500 GB par cabinet : ~10 USD/mois de stockage

### 12.2 Bande passante
- Download initial massif (premier scan)
- Bande passante AWS : entrée gratuite, sortie payante
- Pas d'impact significatif

### 12.3 LLM (classification + indexation)
- Premier scan : peut générer un coût LLM significatif (50K fichiers × extraction)
- Solution : limiter à la classification "essentielle" au premier scan, indexation Search en background

## 13. Migration vers Pattern B (Phase 2)

### 13.1 Pourquoi
- Ranger automatiquement les documents reçus par email dans la bonne structure NAS
- Cohérence totale du référentiel cabinet
- Évite la duplication NAS/Supabase

### 13.2 Setup
- Le cabinet bascule l'utilisateur ZARYA en lecture/écriture (action manuelle côté NAS)
- ZARYA détecte le changement et propose l'activation du mode B

### 13.3 Garanties
- **Aucune écriture destructive** : pas de DELETE, pas d'écrasement
- Renommage uniquement de fichiers créés par ZARYA
- Audit trail strict de chaque écriture

## 14. Hors-scope MVP

- **Pattern B** (lecture/écriture)
- **Agent installé côté cabinet** (pour NAS derrière NAT sans port ouvert)
- **Migration complète** vers Supabase Storage (Pattern C)
- **Sync vers d'autres cloud** (Dropbox, Google Drive, OneDrive Business autre que celui du tenant Microsoft)
- **OCR au scan** : l'OCR est fait par le module Doc au moment du traitement, pas à l'ingestion
- **Compression** des archives anciennes
- **Tiered storage** (chaud / froid) Phase 2

## 15. Alternatives à considérer pour les cabinets sans NAS

Certains cabinets utilisent OneDrive Business / SharePoint au lieu d'un NAS. Pour ceux-là :
- Pas besoin de l'intégration NAS
- L'intégration Microsoft 365 couvre déjà OneDrive (voir [`microsoft-integration.md`](./microsoft-integration.md))

Le cabinet choisit à l'onboarding : NAS, OneDrive/SharePoint, ou les deux.

## 16. Questions ouvertes

- [ ] **Choix de la library SMB** : `smb2` (pure JS) vs binding natif (plus rapide mais cross-platform difficile) ?
- [ ] **Politique d'ouverture du port côté cabinet** : recommander un VPN ou tolérer un port ouvert avec restrictions ?
- [ ] **Agent local** : Phase 2 vraiment ou plus prioritaire si demande forte ?
- [ ] **Versioning** des fichiers modifiés : combien de versions conservées ?
- [ ] **Quota par plan** : 10 GB / 50 GB / illimité réaliste ?
- [ ] **Premier scan d'un gros cabinet** : peut prendre des heures. UX pendant cette période ?
- [ ] **Compatibility matrix** : quels NAS testés en pilote (Synology, QNAP, autre) ?
- [ ] **Synology spécifique** : utiliser l'API Synology native (plus riche que SMB) pour les cabinets Synology ?
- [ ] **Détection de sécurité** : alerter si le NAS est exposé sans protection ?
