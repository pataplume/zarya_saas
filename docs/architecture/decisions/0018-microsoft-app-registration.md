---
status: accepted
date: 2026-06-01
deciders: [tristan]
referenced_by: [microsoft-integration, dev-environment]
---

# ADR 0018 — Enregistrement de l'app Azure AD : une app multi-tenant ZARYA (A) par défaut, app par cabinet (B) à la demande

## Statut

**Acceptée** — 1er juin 2026. Tranche la question ouverte `microsoft-integration.md` §14
(« un seul Azure AD multi-tenant ou un par cabinet ? »). Décision de modèle, pas de code :
le Bloc D (D1→D4, mergé) implémente **déjà** le modèle A (`MS_TENANT=common`).

## Contexte

ZARYA s'intègre à Microsoft 365 (lecture/envoi email, calendrier) via OAuth Authorization
Code (Bloc D). Deux modèles d'enregistrement d'app Azure AD sont possibles :

- **A — une app multi-tenant ZARYA** : une seule application enregistrée dans le tenant
  Azure de ZARYA, marquée « multi-tenant ». Chaque cabinet consent indépendamment ; un
  service principal de l'app ZARYA est créé dans le tenant du cabinet au consentement.
- **B — une app par cabinet** : une application distincte (single-tenant) enregistrée dans
  le tenant de chaque cabinet, avec son propre `client_id` / `client_secret`.

Cibles ZARYA : fiduciaires suisses, majoritairement PME, **sans admin Azure dédié**. Le
code D1 lit **une** configuration OAuth globale (`getMicrosoftOAuthConfig`, env `MS_*`) et
utilise l'endpoint `common` → c'est le modèle A.

## Décision

**Option C (hybride) : A par défaut pour tous les cabinets ; B uniquement sur demande
explicite d'un cabinet Enterprise (Phase 2+).**

### Pourquoi A par défaut
- Modèle SaaS B2B standard (Slack, Notion… s'intègrent ainsi à M365).
- **Onboarding zéro-friction** : la fiduciaire clique « Connecter » et consent ; aucune
  manip Azure de son côté. Décisif pour des PME non-techniques.
- **Ops minimales** : un `client_id`, un `client_secret`, un jeu de permissions, une
  redirect URI à gérer et faire tourner.
- **Déjà implémenté** (D1, `MS_TENANT=common`) → zéro réécriture.
- Le rayon d'impact d'une fuite de secret est atténué : les refresh tokens par cabinet sont
  chiffrés dans Supabase Vault (ADR 0013 addendum) + rotation du secret.

### Pourquoi garder B en option (différé)
- Certains cabinets Enterprise interdisent par politique IT les apps tierces multi-tenant et
  exigent de **posséder** l'app dans leur tenant.
- B impose : N apps / N secrets à gérer + une refonte (config + stockage `client_id`/secret
  par cabinet dans `crm.cabinet_integration`). **Hors-scope MVP** — à ouvrir si un cabinet
  Enterprise le requiert réellement.

## Conséquences

1. **Pré-requis avant bêta (modèle A)** — à exécuter juste avant le 1er cabinet pilote qui
   connecte Microsoft (cf. `PLAN-MVP-BETA.md`), **pas avant** (un `client_secret` Azure a une
   durée de vie limitée → ne pas le créer des mois à l'avance) :
   - Enregistrer l'app multi-tenant dans le tenant Azure de ZARYA (redirect URI prod, scopes
     de moindre privilège de D1, génération d'un client secret).
   - **Vérification d'éditeur Microsoft** (publisher verified) pour éviter l'écran
     « application non vérifiée » au consentement — la confiance compte pour des fiduciaires.
   - Poser les env vars en prod (Vercel) : `MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
     `MS_REDIRECT_URI`, `MS_TENANT=common`, `NEXT_PUBLIC_APP_URL` (URL webhook).
2. **Correction de nommage** : la doc `dev-environment.md` citait `MICROSOFT_CLIENT_ID/SECRET` ;
   le code D1 lit **`MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_REDIRECT_URI` / `MS_TENANT`**.
   La doc est alignée sur le code (le code fait foi).
3. **Consentement admin** : pour les scopes/cabinets le nécessitant, l'admin Microsoft du
   cabinet devra autoriser ZARYA (flux déjà prévu `microsoft-integration.md` §2.4).
4. **Permissions déléguées** (et non application/app-only) : ZARYA n'accède qu'à ce que
   l'utilisateur connecté peut voir — pas d'accès tenant-wide. Choix de moindre privilège
   conservé.
5. **B (per-cabinet)** : si ouvert un jour, créera un ADR dédié (refonte config + stockage).

## Alternatives rejetées

- **B pour tous** : ops ingérables + onboarding infaisable pour un fiduciaire PME +
  réécriture de D1. Surdimensionné pour 3-5 pilotes.
- **Statu quo (ne rien acter)** : laissait un trou implicite (« qui crée l'app, quand ? »)
  → c'est précisément ce que cet ADR + `PLAN-MVP-BETA.md` ferment.

## Références

- `docs/architecture/microsoft-integration.md` §2.2 / §2.4 / §14 (question close ici)
- `PLAN-MVP-BETA.md` — track « Pré-requis bêta » (setup Azure)
- ADR 0013 (chiffrement tokens Vault), Bloc D (D1→D4)
