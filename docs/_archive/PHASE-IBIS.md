# PHASE Ibis — Correction & polish avant Phase 2

> ⛔ **ARCHIVE — état figé, déplacé ici le 2026-06-14, ne plus utiliser comme source de vérité.**
> Phase intermédiaire bouclée. État courant : [`PLAN-MVP-BETA.md`](../../PLAN-MVP-BETA.md) + mémoire `v1-etat-courant.md`.

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

**Ordre d'exécution : STRICT alphabétique A→B→C→D→E→F→G→H→I** (décision founder 05/06).

| Run | Objet | Type | Effort | Statut |
|---|---|---|---|---|
| **A — Navigation** | | | | |
| A1 | Déverrouiller sidebar + corriger hrefs (`/app/salaire`, redirects `/app/calendrier`,`/app/factures`) + home en tuiles cliquables | UI | S | ✅ **MERGÉ (#129)** |
| **B — Flux client (dépôt → traitement)** | | | | |
| B1 | Upload de document côté client (espace client → `/api/documents/upload` scopé client) | UI+API | M | ✅ **MERGÉ (#131)** |
| B2 | Accueil espace client = vrai tableau de bord (actions, docs à fournir, validations) | UI | M | ✅ **MERGÉ (#132)** |
| **C — Onboarding client guidé** (PAS de signup public — le fiduciaire invite ses clients) | | | | |
| C1 | Onboarding/activation client guidé à la 1re connexion (post-invitation) | UI | M | ✅ **MERGÉ (#135)** |
| **D — Page d'entrée** (login + signup) | | | | |
| D1 | Landing d'entrée : Login + Demander un accès → **formulaire interne en base** (`crm.demande_acces`, hors multi-tenant). Détails copy à venir : `LANDING-NOTES.md` | UI | S-M | ✅ **MERGÉ (#136)** |
| **E — Onboarding ↔ connecteurs** | | | | |
| E1 | CTA « Connecter Microsoft 365 » dans l'onboarding fiduciaire | UI | S | ✅ **MERGÉ (#133)** *(fait hors-ordre, inoffensif)* |
| **F — Chaîne email salaire** | | | | |
| F1 | Salaire : surfacer la validation des relances (G5b construit ; notifications = envoi direct, pas de file) | UI | S-M | ✅ **MERGÉ (#137)** |
| ~~F2~~ | ~~Facture : envoi au client~~ — **SUPPRIMÉ** (erreur : module = factures fournisseurs, pas d'envoi client) | — | — | ❌ retiré |
| **G — Activation IA prod** | | | | |
| G1 | Mettre `EXTRACTION_MODE=live` sur Vercel (1 réglage) + activer flags cabinets pilotes. **Action OPS founder** (IA déjà branchée Infomaniak ; switch off par défaut) | Ops | XS | ⬜ founder |
| **H — Pré-bêta Microsoft réel** | | | | |
| H1 | Setup app Azure réelle (multi-tenant, ADR 0018) + validation E2E vrai tenant. **Action OPS founder (plus tard)** | Ops+infra | M | ⬜ founder |
| H2 | UI renouvellement/reconnexion Microsoft (token expiré) — bannière de reconnexion proéminente quand statut `revoque` | UI | S | ✅ **MERGÉ (#138)** |
| **I — Polish & conformité** | | | | |
| I1 | RGPD / suppression compte (client + cabinet) — demande enregistrée (`crm.demande_suppression`) + soft-archive cabinet ; client route vers cabinet ; effacement = process DPO | UI+API | M | ✅ **MERGÉ (#139)** |
| I2 | Profil fiduciaire complet (`/parametres/profil`) — téléphone + signature email (migration additive 0047 ; câblage signature→relances différé) | UI | S | ✅ **MERGÉ (#140)** |
| I3 | Remplacer le placeholder Calendly (onboarding import) — URL configurable `ONBOARDING_BOOKING_URL` + fallback mailto | UI | XS | ✅ **MERGÉ (#141)** |
| I4 | Page contact espace client (`/espace/contact`) — coordonnées cabinet (email/tél/adresse/site) + gestionnaire assigné | UI | S | ✅ **MERGÉ (#142)** |

## Prochain
**Tous les runs code A→I terminés.** Reste : vérif globale propre (demandée après I4) +
actions founder ops G1 (`EXTRACTION_MODE=live`) et H1 (app Azure réelle).
Faits : A1, B1, B2, C1, D1, E1, F1, H2, I1, I2, I3, I4.

## Hors Phase Ibis (différé Phase 2+)
OCR vision + embeddings/recherche avancée (streaming, Cmd+K), base éphémère CI, import auto
Bexio/Crésus, sync bidirectionnelle, app Azure par-cabinet (Enterprise).
