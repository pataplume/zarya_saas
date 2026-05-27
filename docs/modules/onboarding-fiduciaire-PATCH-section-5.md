# Patch — onboarding-fiduciaire.md § 5

> **Comment appliquer** : remplacer la section § 5 entière par le contenu ci-dessous.
> Changements :
> - Consentement nLPD : non pré-coché par défaut (alignement ADR 0009)
> - Mention explicite que l'IDE est accepté sous deux formats
> - Précision sur le `cabinet_id NULL` au moment de l'appel (le cabinet n'existe pas encore)
> - Lien vers ADR 0009

---

## 5. Étape A — Identité du cabinet (5-10 min)

### 5.1 Recherche Zefix
Premier écran post-vérification email. **Identique pattern à l'onboarding client** mais pour le cabinet lui-même.

- Champ unique : IDE (`CHE-XXX.XXX.XXX` ou `CHEXXXXXXXXX`) ou raison sociale
- Appel API Zefix via route handler `/api/zefix/*` (voir [`zefix-integration.md`](../architecture/zefix-integration.md) et [`ADR 0009`](../architecture/decisions/0009-zefix-integration.md))
- Auto-complétion à partir de 4 caractères (debounce 500ms)
- Liste de résultats avec sélection

### 5.2 Consentement nLPD
Avant l'appel, checkbox **non pré-cochée** :
> *"J'autorise ZARYA à récupérer les informations publiques de mon cabinet depuis le registre du commerce suisse (Zefix), et à les conserver pour préremplir mon dossier."*

- Pas d'appel sans consentement explicite
- Le bouton "Saisir manuellement" reste accessible sans cocher
- Log dans `crm.zefix_recherche_cabinet` avec `cabinet_id NULL` (le cabinet n'existe pas encore en DB à ce stade) + `audit.cabinet_evenement` type `consentement_zefix_donne` (backfillé une fois `crm.cabinet` créée)

### 5.3 Auto-remplissage
Champs récupérés :
- Raison sociale
- Forme juridique
- IDE (stocké en format `CHE-XXX.XXX.XXX`)
- Adresse du siège (rue, NPA, ville, canton)
- Date d'inscription
- Capital social
- Organes (administrateurs, signataires)

→ Pré-remplissage de `crm.cabinet`. Tous les champs sont éditables.

### 5.4 Compléments manuels
Le responsable doit ajouter :
- Numéro TVA (non récupérable Zefix)
- Langues opérationnelles du cabinet (multi-sélection FR/DE/IT/EN)
- Langue principale (radio)
- Fuseau horaire (Europe/Zurich par défaut)
- Devise (CHF par défaut)
- Site web et téléphone

### 5.5 Fallback : saisie manuelle
Si Zefix ne renvoie rien (cabinet récent, indépendant non inscrit, association) ou si le consentement n'est pas donné → formulaire libre. Même structure de champs que ci-dessus, sans pré-remplissage.

### 5.6 Validation
Au bout de l'étape A :
- `crm.cabinet` complétée (création atomique avec backfill des logs `zefix_recherche_cabinet`)
- `crm.cabinet_membre` (le responsable) lié à `auth.users`
- Statut session onboarding fiduciaire : `etape_a_terminee`
