# PLAN — Cohérence MVP (relier l'UI à la base)

> ⛔ **ARCHIVE — état figé, déplacé ici le 2026-06-14, ne plus utiliser comme source de vérité.**
> Chantiers 1→6.1 **livrés & mergés** (#165→#172) ; reste 6.2 (DPA/CGU, ops founder, hors code).
> État courant : [`PLAN-MVP-BETA.md`](../../PLAN-MVP-BETA.md) + mémoire `v1-etat-courant.md`.

> **But de ce document** : base de travail pour rendre le MVP **cohérent**. À lire en début de
> chaque session sur ce sujet. Source de vérité du découpage en chantiers → sous-blocs (1 PR chacun).
> Créé le 13/06/2026. Complète (ne remplace pas) `PLAN-MVP-BETA.md`, `KICKOFF-BLOCS-B-H.md`, les ADR.

## 0. Diagnostic

L'app est organisée **par module** (Documents, Factures, Calendrier, Salaire) — chaque écran est une
**liste à plat, mono-champ, sans lien transverse**. La base, elle, est **riche et reliée par
`client_id`**, et **déjà agrégée dans des vues `v_*` souvent inutilisées**. Il manque la **colonne
vertébrale client-centrée** + la **remontée des données déjà extraites**.

**Thèse directrice : ce n'est pas un MVP à re-coder, c'est un MVP à RELIER.** L'essentiel est du
**front + requêtes** sur des tables/vues existantes → rapide, faible risque, **peu/pas de migration**.

### Preuve emblématique
`crm.v_client_dashboard` fournit déjà, par client : `risque_score`, `risque_niveau`,
`prochaine_echeance`, `nb_documents_manquants`, `derniere_activite`. **`/app/clients` ne l'utilise
pas** (il lit 4 champs bruts de `crm.client`).

## 1. Principes (à respecter dans chaque sous-bloc)

1. **Client-centré** : le dossier client est la connective tissue ; tout nom de client est cliquable.
2. **Réutiliser l'existant** : privilégier les vues `v_*` et tables déjà là ; ne créer une migration
   que si une donnée/agrégat manque réellement.
3. **Surfacer l'extrait** : montrer ce que l'IA/QR a tiré (avec provenance par champ, ADR 0024).
4. **Anti-jargon** : statuts harmonisés + libellés lisibles (jamais un slug brut, jamais couleur seule).
5. **DoD universel** (rappel KICKOFF) : `biome` + `tsc --noEmit` + `next build` verts ; tests unit +
   intégration ; **label `run-integration`** sur toute PR qui touche un helper/une requête couverts par
   l'intégration ; multi-tenant : **toute requête scope `cabinet_id`** (et `client_id` côté client).
   Toute nouvelle table métier = DoD complet (migration additive + RLS + triggers + `METIER_TABLES`/
   `RLS_TABLES` + tests isolation **et** anti-fuite). Migration appliquée à la base partagée **avant** CI.
6. **1 sous-bloc = 1 PR**, vérifiée en local (tests d'intégration concernés inclus) avant push.

## 2. Inventaire de l'existant (grounding au 13/06)

**Écrans `/app/*`** : `clients` (liste 4 champs, **pas de `[id]`**), `documents` (hub + `emails` +
`validation`), `factures/validation`, `calendrier/echeances` + `relances`, `salaire` +
`salaire/referentiel/[clientId]` + `salaire/relances`, `parametres/*`, `recherche`.

**Vues DB réutilisables** : `crm.v_client_dashboard`, `crm.v_documents_manquants`,
`crm.v_echeances_a_venir`, `crm.v_dashboard_client_entreprise`, `doc.v_inbox_a_valider`,
`doc.v_dashboard_client_document`, `salaire.v_periode_fiduciaire`, `salaire.v_dashboard_client_employe`.

**Tables clés** : `crm.client`, `crm.contact`, `crm.relation`, `crm.service`, `crm.param_comptable`,
`crm.document_attendu`, `crm.echeance`, `crm.risque` ; `doc.document`, `doc.upload_brut`,
`doc.fichier_physique` ; `facture.facture`, `facture.proposition_facture` ; `salaire.periode`,
`salaire.employe`.

---

## CHANTIER 1 — CRM visuel : table riche + dossier client  ⭐ clé de voûte

**Objectif** : pouvoir répondre à « montre-moi tout sur ce client ». Rend l'app cohérente d'un coup.

### C1.1 — Table clients enrichie (`/app/clients` → `crm.v_client_dashboard`)
- **Quoi** : remplacer la query (table `client`, 4 champs) par `crm.v_client_dashboard`. Colonnes :
  Raison sociale · Type · Statut · **Risque** (badge niveau) · **Prochaine échéance** · **Docs
  manquants** (compteur) · **Dernière activité**. Tri + filtres (risque, statut). Chaque ligne →
  `/app/clients/[id]`.
- **Réutilise** : `crm.v_client_dashboard` (Drizzle view existe-t-elle ? sinon raw SQL scopé `cabinet_id`).
- **Fichiers** : `apps/web/app/(app)/app/clients/page.tsx`, `clients-client.tsx`.
- **DoD** : scope `cabinet_id` ; libellés FR ; biome/tsc/build. Pas de migration.

### C1.2 — Dossier client : squelette + en-tête + vue d'ensemble (`/app/clients/[id]`)
- **Quoi** : nouvelle page. En-tête (raison sociale, IDE, statut, **risque**, gestionnaire, services
  actifs). Section **Vue d'ensemble** « à faire » : docs manquants (`crm.v_documents_manquants`),
  échéances à venir (`crm.v_echeances_a_venir`), factures à valider (count `proposition_facture`),
  périodes salaire en cours, score de risque. 404 si client hors `cabinet_id`.
- **Réutilise** : `crm.v_client_dashboard`, `v_documents_manquants`, `v_echeances_a_venir`, `crm.client`.
- **Fichiers** : `apps/web/app/(app)/app/clients/[id]/page.tsx` (+ composants).
- **DoD** : scope `cabinet_id` strict (404 indistinct cross-tenant) ; test d'isolation lecture dossier.

### C1.3 — Dossier : section Documents (par période/type)
- **Quoi** : documents du client (`doc.document` + `doc.upload_brut` scopés), **groupés par période et
  type**, statut traduit + bouton **Ouvrir** (route aperçu existante `/api/documents/{id}/apercu`).
- **Réutilise** : pattern du hub Documents (statuts traduits déjà faits), route aperçu.
- **Fichiers** : `clients/[id]/` (section/composant).

### C1.4 — Dossier : section Échéances + section Factures
- **Échéances** : du client (à venir/en retard) + relances (`crm.echeance`, `v_echeances_a_venir`).
- **Factures** : du client avec **vrais champs** (fournisseur, montant, date, statut) depuis
  `facture.facture` + `proposition_facture` (à valider). Lien vers `/app/factures/validation`.
- **DoD** : aucun IBAN en clair affiché (Vault) ; scope `cabinet_id`+`client_id`.

### C1.5 — Dossier : section Salaires + Coordonnées/Services/Param comptables
- **Salaires** : périodes du client (`salaire.v_periode_fiduciaire`) + lien vers
  `/salaire/referentiel/[clientId]` (existant).
- **Coordonnées** : contacts (`crm.contact`), services (`crm.service`), `crm.param_comptable`.
- **DoD** : AVS/IBAN jamais en clair (booléens « renseigné »).

> **Dépendances** : C1.1 et C1.2 d'abord (table → dossier). C1.3-C1.5 = sections additives, parallélisables.
> **Schéma** : aucun a priori (lecture). Si un agrégat manque, créer une vue additive (DoD vue).

---

## CHANTIER 2 — Surfacer les données extraites (fin des silos)

**Objectif** : un document/une facture n'est plus une ligne muette ; on voit l'extrait + on navigue
entre document ↔ facture ↔ échéance.

### C2.1 — Résumé extrait par document
- **Quoi** : dans la liste Documents (hub + dossier), résumé utile par doc : facture →
  fournisseur/montant/date (join `facture.proposition_facture`/`facture`) ; autre → période/type.
- **Réutilise** : `upload_brut.email_brut_id` (lien email), `confiance_par_champ` (provenance).

### C2.2 — Liens document ↔ facture ↔ échéance
- **Quoi** : depuis un doc « facture » → sa proposition ; depuis une échéance → le document qui l'a
  couverte (`echeance.documents_requis` / couverture C4 existante).
- **Réutilise** : la boucle doc→échéance déjà câblée (mig 0048, `couvrirEcheancesParDocumentAttendu`).

### C2.3 — Fiche document (aperçu + extraction + provenance)
- **Quoi** : panneau/page montrant aperçu (route signée) + résultat d'extraction **avec badges de
  provenance** (QR ✓ / IA, ADR 0024). Réutilise les badges déjà codés côté facture.
- **DoD** : pas de données sensibles en clair ; scope cabinet.

---

## CHANTIER 3 — Dashboard & navigation actionnables

### C3.1 — `/app` orienté action
- **Quoi** : KPIs → **raccourcis filtrés** : « N factures à valider », « M échéances en retard »,
  « K documents à classer », « P périodes salaire à traiter ». Digest « à traiter ».
- **Réutilise** : `doc.v_inbox_a_valider`, `proposition_facture` (count), `v_echeances_a_venir`.
- **Fichiers** : `apps/web/app/(app)/app/page.tsx`.

### C3.2 — Navigation transversale
- **Quoi** : **nom du client cliquable partout** (Documents, Factures, Calendrier, Salaire) → dossier ;
  fils d'Ariane + retours cohérents. Lien depuis les files vers le dossier et inversement.

---

## CHANTIER 4 — Cohérence des statuts & libellés (anti-jargon)

### C4.1 — Helper partagé de libellés + harmonisation
- **Quoi** : un module partagé (ex. `apps/web/lib/libelles.ts` ou `packages/ui`) mappant
  statuts/anomalies/types → libellés FR + style (badge). Remplacer les slugs bruts restants
  (statuts doc, statuts upload, types, anomalies non couvertes). Jamais couleur seule.
- **Réutilise** : les libellés déjà faits (anomalies facture, statuts upload du hub) → centraliser.
- **DoD** : aucune string anglaise/slug brut affichée ; cohérence inter-modules.

> Transverse : appliquer au fil des chantiers 1-3.

---

## CHANTIER 5 — Portail client : finir la boucle (2e lot audit portail)

### C5.1 — Notifier le cabinet à la validation client
- **Quoi** : à la validation d'une période salaire par le client, écrire `salaire.notification`
  (type `confirmation_validation`, la table + le type existent) ; surfacer côté cabinet (digest /
  dossier). Optionnel : In-Reply-To email.
- **Fichiers** : `apps/web/app/(app)/espace/validations/actions.ts` + côté cabinet.

### C5.2 — RGPD : export des données client + profil éditable
- **Quoi** : `/espace/parametres` — bouton **Export** (portabilité, ZIP/JSON des données du client) +
  édition profil (nom/email/mot de passe). (La suppression visible côté cabinet est déjà faite, #155.)

### C5.3 — Atomicité de la validation de période
- **Quoi** : transaction + garde `WHERE statut IN (editables)` sur la transition de validation
  (anti double-soumission ; cf. audit D5).

---

## CHANTIER 6 — Dettes à fermer pour cohérence/conformité

### C6.1 — IBAN-du-QR → Vault à la proposition (ADR 0024 §5, différé)
- **Quoi** : ouvrir l'accès Vault au moteur d'extraction (injection d'un chiffreur depuis apps/web,
  même pattern que le `downloadBytes` du Lot 1) → colonne `proposition_facture.iban_paiement_vault_id`
  (migration additive + registre `SENSITIVE_COLUMNS` mécanisme `vault` + test anti-clair vert) → le
  validateur **voit l'IBAN déterministe (masqué)** au lieu de le retaper.
- **DoD** : sceau anti-clair maintenu ; **ADR 0024 §5 à réactiver**.

### C6.2 — Ops (hors code, founder)
- **DPA** (Infomaniak, Supabase, Vercel) + **CGU/politique de confidentialité** finalisées —
  pré-requis bêta (cf. `PLAN-MVP-BETA.md` Horizon 2).

---

## Séquencement recommandé

1. **Chantier 1** (C1.1 → C1.2 → C1.3/4/5) — clé de voûte, ta demande explicite, vues prêtes.
2. **Chantier 2** + **Chantier 3** — prennent leur sens une fois le dossier en place.
3. **Chantier 4** — en continu, à appliquer dans 1-3.
4. **Chantier 5** (portail) + **Chantier 6** (dettes).

## Arbitrages ouverts (à trancher avant/au début du chantier concerné)
- **C1 — forme du dossier** : page unique à **sections ancrées** (recommandé MVP : tout visible,
  moins de navigation — cohérent avec le reproche « on navigue partout ») **vs** onglets. → défaut : sections.
- **C1 — maquette d'abord ?** : option de maquetter le dossier (skill `impeccable`) avant de coder.
- **C6.1** — confirmer qu'on ouvre l'accès Vault au moteur d'extraction (petit changement archi).
- **UX/UI** : la passe design (couleurs/typo/espacement) s'applique idéalement sur le dossier client
  (C1) une fois la structure posée.

## Hors-scope (différé explicite)
- OCR `vision` qualité scans dégradés (dépend IK) ; recherche RAG avancée (streaming, Cmd+K) ;
  facturation des honoraires du cabinet (→ déciderait du sort de `relation.iban_facturation`,
  cf. mémoire) ; messagerie bidirectionnelle portail ; multi-clients par contact.

---

## Journal d'avancement (à tenir à jour)
- 13/06 : document créé. Rien démarré. `main` vert. Plan extraction facture (ADR 0024, Lots 1-3) déjà livré.
