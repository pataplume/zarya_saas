# Patch — onboarding-client.md § 5

> **Comment appliquer** : remplacer la section § 5 entière par le contenu ci-dessous.
> Changements :
> - Consentement opt-in (non pré-coché) — alignement ADR 0009
> - Précision route handler `/api/zefix/*`
> - IDE accepté sous deux formats
> - Auto-complétion debounce 500ms / seuil 4 caractères (vs 300ms / 3 caractères)

---

## 5. Étape 1 — Identification entreprise via Zefix

### 5.1 Recherche
- Champ unique : IDE (`CHE-XXX.XXX.XXX` ou `CHEXXXXXXXXX`) ou raison sociale ou nom
- Appel API Zefix via route handler `/api/zefix/*` (clé serveur, jamais exposée au navigateur — voir [`zefix-integration.md`](../architecture/zefix-integration.md) et [`ADR 0009`](../architecture/decisions/0009-zefix-integration.md))
- Auto-complétion debouncée à 500ms, déclenchée à partir de 4 caractères
- Résultats affichés en liste si plusieurs matches

### 5.2 Consentement nLPD
Avant l'appel Zefix, checkbox affichée **non pré-cochée** :
> *"J'autorise ZARYA à récupérer les informations publiques de mon entreprise depuis le registre du commerce suisse (Zefix), et à les conserver pour préremplir mon dossier."*

Pas d'appel sans consentement explicite. Le bouton "Saisir manuellement" reste accessible. Log de l'événement dans `crm.evenement` + ligne dans `salaire.zefix_recherche`.

### 5.3 Auto-remplissage
Champs récupérés depuis Zefix :
- Raison sociale
- Forme juridique (SA, Sàrl, raison individuelle, association...)
- Numéro IDE (CHE-)
- Adresse du siège (rue, NPA, ville, canton)
- Date d'inscription
- Capital social
- Organes (administrateurs, signataires) → suggestion de contacts `crm.contact`
- Statut (actif / en liquidation / radié)

### 5.4 Validation utilisateur
Tous les champs récupérés sont **éditables**.

[…suite inchangée par rapport à la version actuelle…]
