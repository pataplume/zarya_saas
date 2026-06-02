# PLAN MVP → Bêta — vue d'ensemble « quoi / quand »

> **Document vivant et volontairement imprécis.** Il situe TOUT ce qui reste pour atteindre
> une bêta réelle (3-5 cabinets pilotes), y compris les chantiers **hors-Bloc** (setup Azure,
> UI manquantes, validations E2E, ops go-live) qui n'apparaissaient nulle part. Il ne remplace
> pas :
> - **`docs/roadmap.md`** = phases produit/marché et jalons temporels (M0→M24).
> - **`KICKOFF-BLOCS-B-H.md`** = exécution détaillée Bloc par Bloc (séquence ADR 0012/0016, DoD).
> - **`HANDOFF_V2.md`** = état opérationnel courant.
>
> Mise à jour à chaque clôture de Bloc ou découverte transverse. Dernière maj : 2026-06-01.

## Comment lire

Trois horizons. Les dates sont **indicatives**, calées sur la roadmap (Phase 1 MVP =
M2→M6 = fenêtre des cabinets pilotes). Le séquencement technique fin reste celui du KICKOFF.

---

## Horizon 0 — En cours

| Item | Statut | Réf |
|---|---|---|
| Bloc D — Microsoft Graph (D1 OAuth, D2 wrapper, D3 région, D4 webhooks) | ✅ livré | KICKOFF §D |
| **D5 — envoi sendMail (identité cabinet + signature)** | ⬜ prochain | KICKOFF §D5 |

---

## Horizon 1 — Suite de la séquence technique (Blocs, ADR 0012/0016)

Ordre canonique restant. Détail + DoD dans le KICKOFF.

| Bloc | Objet | Statut |
|---|---|---|
| C2 → C4 | Calendar : envoi relances (Graph), UI, facteur risque relance | ⬜ après D |
| E | Facture (QR-bill + extraction IA + export) — ⚠️ ADR QR-bill à ouvrir avant E2 | ⬜ |
| F | onboarding-client + dashboard-client | ⬜ |
| G | Salaire (workflow, PAS de calcul de paie) | ⬜ |
| H | embeddings / pgvector + Search — ⚠️ bloqué tant que modèle `embeddings` IK non câblé | ⬜ |

---

## Chantier transverse — Boucler la boucle « doc → échéance » end-to-end

Le mécanisme C4 (« document reçu couvre l'échéance → `traitee` → relances stoppées »)
**existe et est testé**, mais ne tourne pas encore de bout en bout en prod. Trois maillons :

| Maillon | Statut | Détail |
|---|---|---|
| **C1+ — `echeance.documents_requis` peuplé à la génération** | ✅ fait (migration 0029) | Sans ça, la couverture C4 ne matche rien. Dépend de l'**alignement de vocabulaire** `document_attendu.type_document` ↔ `template_echeance.documents_requis_types` (sinon vide = pas de couverture erronée). ⚠️ **Backfill** des échéances déjà générées non fait (NULL) ; **seed des templates** à enrichir avec `documents_requis_types`. |
| **Dépôt côté client (upload dashboard)** | ⬜ Bloc F | Aujourd'hui l'upload est `upload_fiduciaire` uniquement ; pas de dashboard client. |
| **Le doc atteint `finaliserDocument` rattaché au bon `document_attendu`** | ⚠️ partiel | upload → classification → (politique `strict` → file de validation) → un membre valide → couverture. Donc « cabinet valide le doc reçu → relance s'arrête », pas « client upload → temps réel ». Dépend aussi du matching B3. |

→ Quand F sera fait + le seed templates enrichi + (option) backfill, la boucle tournera
end-to-end. C1+ (maillon le moins cher) est fait en premier.

---

## Horizon 2 — Pré-requis BÊTA (chantiers transverses, hors Bloc)

**À faire avant / autour du 1er cabinet pilote qui se connecte.** Ce sont les « trous »
repérés à la volée — désormais tracés ici.

| Item | Quand | Dépend de | Statut |
|---|---|---|---|
| **Setup app Azure AD** (multi-tenant, modèle A) + **vérif éditeur Microsoft** + env prod `MS_*` | Juste avant 1er pilote Microsoft (PAS avant : secret expire) | ADR 0018 | ⬜ à planifier |
| **Écran `/parametres/integrations`** : bouton Connecter/Déconnecter, statut « ✓ connecté à … », **bannière avertissement région** + accusé (D3) | Avant bêta (sinon pas de porte d'entrée visible) | Bloc D livré | ⬜ **manquant, repéré** |
| **Validation E2E Microsoft** sur vrai tenant de test (tout le Bloc D est codé contre mocks) | Après setup Azure | App Azure réelle | ⬜ |
| Réconciliation noms env vars `MICROSOFT_*` → `MS_*` (doc vs code) | — | — | ✅ fait (ADR 0018) |
| `CRON_SECRET` posé dans Vercel (renouvellement subscriptions D4c) | — | — | ✅ fait |
| **DPA à signer** (Infomaniak, Supabase, Vercel ; modèle ZARYA→cabinet) avant 1re vente | Avant bêta | — | ⬜ data-residency §4.1 |
| **Bascule `EXTRACTION_MODE` stub → live** (classif IA en prod) | Décision founder, après Bloc B clôturé + OCR prêt | OCR texte ✅ / vision ⬜ | ⬜ arbitrage |
| OCR texte natif | ✅ livré | — | ✅ |

---

## Horizon 3 — Post-bêta / Phase 2+ (différés assumés)

| Item | Réf |
|---|---|
| **Phase I — Chiffrement au repos** colonnes ultra-sensibles (IBAN/AVS) | ADR 0013 — ⚠️ à ré-arbitrer au **1er write-path E/F/G** (ne pas écrire en clair avant) |
| Option **B Azure (app par cabinet)** pour Enterprise | ADR 0018 — sur demande explicite, créera un ADR dédié |
| OCR **vision** IK + **embeddings** IK | pré-requis E/F-scans et tout Bloc H |
| Microsoft : boîtes partagées / multi-boîtes, Calendar 2-way, SharePoint/Teams | microsoft-integration §12-13 |
| Option **Suisse stricte** (Azure Switzerland North) | data-residency §6.1 / roadmap M10-M11 |

---

## Jalons connus (rappel roadmap)

- **Phase 0** (Maintenant→M2) : validation marché, 3-5 cabinets pilotes engagés.
- **Phase 1 — MVP P0** (M2→M6) : MVP opérant 3 cabinets pilotes (onboarding → cycle mensuel).
  → **C'est la fenêtre bêta** : l'Horizon 2 doit être bouclé ici.
- **Phase 2** (M6→M12) : différenciation, Horizon 3.

## ⚠️ Risques / dettes transverses à ne pas perdre de vue

- Tout le **Bloc D est validé contre mocks** : tant que l'app Azure réelle + un tenant test
  n'existent pas, « ça marche » n'est pas prouvé end-to-end (Horizon 2).
- `getDbForCabinet()` reste un stub (sécurité = filtre `cabinet_id` discipliné + triggers,
  pas la RLS sur le chemin app — addendum ADR 0005).
- **CI n'applique pas les migrations** : appliquer à la base partagée avant les tests.
