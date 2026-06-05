# PHASE Ibis — Correction & polish avant Phase 2

> Phase intermédiaire ouverte le 2026-06-05 (founder). Objectif : combler les trous
> **visibles** et raccorder les derniers maillons pour atteindre un MVP démontrable à des
> cabinets pilotes. Le socle B→H + Phase I + chantiers pré-bêta (intégrations Microsoft,
> bascule IA par cabinet, CI scindée, boucle doc→échéance) est **livré**.
>
> Numérotation : **Run <Lettre>** (thème) → sous-tâches **<Lettre><n>**. Une sous-tâche = une PR.
> DoD par PR : biome + typecheck + test:unit + build (CI rapide ~2 min). L'intégration tourne
> au merge sur `main` + la nuit (cf. split CI). Le founder arbitre chaque PR.

## Constat fondateur (audit UI 05/06)
Beaucoup d'UI était **construite mais cachée** (`locked:true` sidebar) → ressenti « il manque
l'UI ». Le gros du restant = **dépôt/inscription client**, **landing publique**, et **2 chaînes
email** ; plus deux interrupteurs ops (allumer l'IA, app Azure réelle).

## Tableau des Runs

| Run | Objet | Type | Effort | Statut |
|---|---|---|---|---|
| **A — Navigation** | | | | |
| A1 | Déverrouiller sidebar + corriger hrefs (`/app/salaire`, redirects `/app/calendrier`,`/app/factures`) + home en tuiles cliquables | UI | S | ✅ **MERGÉ (#129)** |
| **B — Flux client (dépôt → traitement)** | | | | |
| B1 | Upload de document côté client (espace client → `/api/documents/upload` scopé client) | UI+API | M | ✅ **MERGÉ (#131)** |
| B2 | Accueil espace client = vrai tableau de bord (actions, docs à fournir, validations) | UI | M | ✅ **PR en cours** |
| **C — Acquisition & onboarding client** | | | | |
| C1 | Signup client self-service (landing client + inscription / activation améliorée) | UI+auth | M-L | ⬜ |
| C2 | Onboarding client guidé (1re connexion) | UI | M | ⬜ |
| **D — Landing publique** | | | | |
| D1 | Landing marketing fiduciaire (hero, valeur, CTA signup ; pricing optionnel) | UI | M | ⬜ |
| **E — Onboarding ↔ connecteurs** | | | | |
| E1 | Étape/CTA « Connecter Microsoft 365 » dans l'onboarding fiduciaire | UI | S | ⬜ |
| **F — Chaînes email restantes** | | | | |
| F1 | Salaire : surfacer la validation des notifications/relances (G5 construit) | UI | S-M | ⬜ |
| F2 | Facture : envoi au client après validation (aujourd'hui export seulement) | API+UI | M | ⬜ |
| **G — Activation IA prod** | | | | |
| G1 | Flip `EXTRACTION_MODE=live` (Vercel) + activer flags pilotes + vérif garde-fous coûts | Ops | S | ⬜ |
| **H — Pré-bêta Microsoft réel** | | | | |
| H1 | Setup app Azure réelle (multi-tenant, ADR 0018) + validation E2E vrai tenant | Ops+infra | M | ⬜ |
| H2 | UI renouvellement/reconnexion Microsoft (token expiré) | UI | S | ⬜ |
| **I — Polish & conformité** | | | | |
| I1 | RGPD / suppression compte (client + cabinet) | UI+API | M | ⬜ |
| I2 | Profil fiduciaire complet (`/parametres/profil`) | UI | S | ⬜ |
| I3 | Remplacer le placeholder Calendly (onboarding import) | UI | XS | ⬜ |
| I4 | Page contact espace client (`/espace/contact`) | UI | S | ⬜ |

## Ordre recommandé
A1 ✅ → B1+B2 (boucle client) → D1 (landing) → C1+C2 (acquisition) → E1, F1, F2 → G1+H1
(juste avant 1er pilote) → I* (polish au fil de l'eau).

## Hors Phase Ibis (différé Phase 2+)
OCR vision + embeddings/recherche avancée (streaming, Cmd+K), base éphémère CI, import auto
Bexio/Crésus, sync bidirectionnelle, app Azure par-cabinet (Enterprise).
