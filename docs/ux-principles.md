---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
type: foundation
depends_on: [vision, personas]
referenced_by: [dashboard-client, doc, calendar, facture, onboarding-fiduciaire, onboarding-client]
---

# Principes UX ZARYA

> Règles de design produit non-négociables. À appliquer dans chaque écran. À tester contre chaque décision UX.

## 1. Pourquoi ces principes existent

ZARYA cible deux publics très différents (fiduciaire expert vs contact RH PME). Sans principes communs, le produit risque :
- Incohérence visuelle entre les écrans
- Surcharge cognitive (l'expert veut dense, le PME veut simple)
- Pertes de confiance dues à des choix UX flous
- Re-debat de chaque petite décision

Les principes ci-dessous sont **non-négociables** et **transverses**.

## 2. Les 10 principes directeurs

### Principe 1 — L'IA propose, l'humain valide

**Règle** : L'IA ne prend jamais de décision irréversible seule. Chaque proposition est validable, modifiable, rejetable.

**Application concrète** :
- Pipeline Doc : classification proposée → validation humaine (sauf politique cabinet permissive)
- Pipeline Facture : extraction proposée → validation 1-clic ou correction
- Salaire : changements détectés → toujours validation client + cabinet
- Onboarding : extraction employés → validation granulaire champ par champ

**Anti-pattern** : auto-classement sans audit possible, suppression auto, envoi email sans validation (sauf opt-in explicite cabinet).

### Principe 2 — Validation 1-clic quand l'IA est fiable

**Règle** : Si la proposition IA est correcte (cas le plus fréquent), l'utilisateur valide en un seul clic. Pas de friction inutile.

**Application concrète** :
- Bouton "Valider" toujours présent, visible, accessible au clavier
- Raccourci clavier global (Enter, V, etc.)
- Validation en lot possible pour les cas répétitifs
- Pas de modal de confirmation pour les actions réversibles

**Anti-pattern** : multi-étapes pour valider un cas évident, confirmation forcée systématique, dialogue "Êtes-vous sûr ?" omniprésent.

### Principe 3 — Correction sans friction

**Règle** : Corriger une proposition IA doit être aussi rapide que la valider. Si modifier prend 5x plus de temps que valider, l'utilisateur valide à l'aveugle.

**Application concrète** :
- Édition inline (clic sur le champ → édition immédiate)
- Pas de mode "édition" séparé
- Sauvegarde automatique à chaque modification
- Raccourcis clavier pour naviguer entre champs
- Annulation (Ctrl+Z) toujours disponible

**Anti-pattern** : modal d'édition séparée, validation "Save" requise, perte de données si refresh.

### Principe 4 — Sources et traçabilité visibles

**Règle** : Chaque donnée affichée a une source identifiable. L'utilisateur peut toujours comprendre **d'où vient** une information et **pourquoi** elle est là.

**Application concrète** :
- Module Search : citations [1], [2] cliquables menant à la source
- Module Facture : bbox surlignées sur le PDF source
- Module Doc : indication de l'expéditeur, de la date, du chemin
- Onboarding : "Détecté depuis votre contrat", "Repris d'avril", "Modifié par X"
- Audit log accessible pour les actions sensibles

**Anti-pattern** : données magiques sans origine, IA opaque, modifications anonymes.

### Principe 5 — Statuts simples et actionnables

**Règle** : Un statut doit indiquer ce qui doit être fait ensuite. Pas de jargon, pas d'ambiguïté.

**Application concrète** :
- Statut document : **à traiter / incomplet / en retard / complet / à risque**
- Statut échéance : **à venir / imminente / en retard / traitée**
- Statut facture : **à valider / validée / exportée / payée**
- Pas de "Processing", "In progress", "Open" : préférer un statut métier

**Anti-pattern** : statuts techniques, codes internes affichés, multiplicité de statuts qui se chevauchent.

### Principe 6 — Action prioritaire en premier

**Règle** : L'écran d'accueil de chaque rôle affiche **une seule action prioritaire** ou au plus 3-5. Pas de mur de notifications.

**Application concrète** :
- Dashboard fiduciaire : "5 échéances à traiter aujourd'hui, 3 relances à valider"
- Dashboard client : action contextuelle unique (onboarding, validation salaire, ou rien)
- Inbox documentaire : trier par urgence + confiance, pas par date
- Notifications : digest quotidien, pas alertes en continu

**Anti-pattern** : panneau de bord avec 12 widgets, listes infinies sans hiérarchie, notifications continues.

### Principe 7 — Confiance avant automatisation

**Règle** : Ne pas automatiser une action tant que l'utilisateur n'a pas confiance dans la qualité de l'IA pour ce cas précis. Confiance se construit progressivement.

**Application concrète** :
- Politique par défaut MVP : validation humaine systématique
- Apprentissage progressif : après N validations identiques, proposer l'auto pour ce pattern
- Toujours possibilité de revenir à la validation manuelle
- Audit log pour chaque action automatisée
- Transparence sur les règles d'auto-classement (UI lisible)

**Anti-pattern** : automation par défaut, opacité sur ce qui est auto vs humain, impossibilité de désautomatiser.

### Principe 8 — Pas de jargon côté client final

**Règle** : Le dashboard client utilise un vocabulaire de PME, pas de fiduciaire. Le contact RH n'est pas comptable.

**Application concrète** :
- "Remboursements" au lieu de "indemnités forfaitaires"
- "Bonus du mois" au lieu de "variables"
- "Récap des cotisations" au lieu de "décompte AVS"
- "Salaire de base" au lieu de "rémunération contractuelle"
- Aide contextuelle pour les termes techniques inévitables (AVS, LPP, IBAN)

**Anti-pattern** : termes Swissdec bruts, codes comptables affichés, abréviations métier non expliquées.

### Principe 9 — Mobile-first pour le client, desktop-first pour le cabinet

**Règle** : Le dashboard client est utilisé majoritairement sur mobile (entre 2 rendez-vous, entre 2 chantiers). Le dashboard fiduciaire est utilisé sur grand écran (productivité).

**Application concrète** :
- Dashboard client : design mobile-first, testé sur 375px (iPhone SE)
- Dashboard fiduciaire : design desktop-first, optimisé pour 1440px+, mobile-friendly mais pas mobile-first
- Tableau employés : vue carte verticale sur mobile, tableau dense sur desktop
- Navigation : bottom tab sur mobile, sidebar sur desktop

**Anti-pattern** : dashboard client conçu pour desktop puis "responsivisé", interfaces fiduciaire bridées par contrainte mobile.

### Principe 10 — Sauvegarde temps réel, jamais de bouton "Save" global

**Règle** : Toute modification est sauvegardée en temps réel. Le bouton "Save" rassure les utilisateurs mais introduit des risques de perte (oubli, crash).

**Application concrète** :
- Chaque champ : sauvegarde au blur (sortie du focus) ou debounce 500ms
- Indicateur discret : "✓ Sauvegardé il y a 2 secondes"
- Pas de prompt "Avez-vous des modifications non sauvegardées ?"
- Possibilité de quitter et reprendre sans perte

**Anti-pattern** : bouton Save central, perte de données si refresh, multi-étapes avec validation finale.

## 3. Principes secondaires (utiles mais non-bloquants)

### Principe 11 — Density appropriée selon le contexte
- Cabinet expert : densité haute, beaucoup d'infos par écran
- Client final : densité basse, focus sur l'action

### Principe 12 — Couleurs cohérentes avec le branding cabinet
- Dashboard client affiche les couleurs et logo du cabinet (pas ZARYA)
- Le contact RH se sent "chez son cabinet"

### Principe 13 — Microcopy empathique
- Tonalité chaleureuse côté client final
- Tonalité directe et efficace côté cabinet
- Jamais condescendante

### Principe 14 — Performance ressentie > performance technique
- Streaming progressif (Search, Onboarding IA)
- Skeletons et placeholders pendant le chargement
- Optimistic UI quand possible (validation immédiate, sync en background)

### Principe 15 — Accessibilité comme standard, pas option
- Contraste WCAG AA minimum
- Navigation au clavier complète
- Lecteurs d'écran supportés
- Pas de couleur seule pour transmettre info (icône + couleur)

## 4. Patterns UX concrets

### 4.1 Validation d'une proposition IA

```
┌─────────────────────────────────────────┐
│ Facture Swisscom — Avril 2026           │
│                                         │
│ Fournisseur : Swisscom (Schweiz) AG     │
│ Montant : 245.80 CHF                    │
│ Échéance : 30/06/2026                   │
│                                         │
│ ⚠️ Nouveau fournisseur                  │
│                                         │
│ [✓ Valider]  [✏️ Corriger]  [⏭ Plus tard]│
└─────────────────────────────────────────┘
```

Clic sur "Valider" : action en 1 clic, feedback immédiat ("Validé"), passage au suivant.

### 4.2 Inbox avec priorisation
- Tri par défaut : par urgence (anomalies) puis par confiance (basse en premier = à examiner)
- Pas par date pure (sinon les vieux items urgents disparaissent)

### 4.3 Modification inline
- Clic sur un champ → édition immédiate
- Pas de bouton "Edit" séparé
- Save sur blur ou debounce

### 4.4 Sources visibles dans Search
```
Le dernier mandat de Dupont SA expire le 12 mars 2027 [1].

Sources :
[1] 📄 Contrat_dupont_2024.pdf • 12/03/2024 • [Ouvrir →]
```

### 4.5 Notifications maîtrisées
- Pas de toast pour chaque action mineure
- Toast uniquement pour résultats d'actions explicites
- Erreurs : claires, actionnables
- Digest email quotidien plutôt que notifications continues

## 5. Anti-patterns à bannir

### 5.1 La "modal hell"
Multi-modales empilées, perte de contexte. Préférer drawers ou pages dédiées.

### 5.2 La validation décorrelée du contenu
Bouton "Save" en bas d'une longue page. L'utilisateur a oublié ce qu'il a modifié en haut.

### 5.3 Le "Wizard infini"
Wizard de 20 étapes pour configurer une feature. Préférer settings progressifs.

### 5.4 La surcharge de notifications
Notifications continues qui forment du bruit. L'utilisateur les ignore toutes après 2 jours.

### 5.5 Le "Mystery meat"
Boutons sans label, icônes sans signification. Toujours un label texte ou tooltip explicite.

### 5.6 La couleur comme seul vecteur d'info
"Le rouge est urgent" : OK, mais ajouter aussi un icône ⚠️ et un texte.

### 5.7 Le menu hamburger sur desktop
Caché là où il n'a pas besoin de l'être. Sidebar visible si > 768px.

## 6. Quand un principe entre en conflit avec un autre

**Hiérarchie de résolution** :

1. **Principe 1** (IA propose, humain valide) > tous les autres
2. **Principe 7** (Confiance avant automatisation) > Principe 2 (Validation 1-clic)
3. **Principe 4** (Sources visibles) > Principe 6 (Action prioritaire)
4. **Principe 8** (Pas de jargon côté client) > Principe 11 (Density appropriée)

Exemple de conflit : la validation 1-clic (Principe 2) doit être désactivée si l'utilisateur n'a pas encore confiance dans l'IA (Principe 7). C'est la politique par défaut MVP.

## 7. Outils de mesure et tests UX

### 7.1 Métriques quantitatives
- Taux de validation 1-clic vs corrections (signal de qualité IA)
- Temps moyen pour une action récurrente (validation, classement)
- Taux d'abandon par écran/flow
- Taux de retour à un écran (signal de mauvaise compréhension)

### 7.2 Tests utilisateurs
- Tests cliquables sur Figma avant développement (5 testeurs minimum)
- A/B testing sur les écrans critiques (Search, Validation facture)
- Feedback in-app : 👍/👎 sur les écrans critiques
- Interviews qualitatives post-pilote

### 7.3 Heuristics check
Avant chaque release majeure :
- ✓ Validation 1-clic présente sur les actions principales ?
- ✓ Sources visibles ?
- ✓ Pas de jargon côté client ?
- ✓ Mobile-first respecté pour client ?
- ✓ Sauvegarde temps réel ?

## 8. Cas spéciaux

### 8.1 Onboarding (fiduciaire et client)
- Plus de hand-holding (microcopy explicatif)
- Tooltips sur les champs sensibles
- Estimation du temps restant
- Possibilité de quitter et reprendre

### 8.2 Erreurs et states vides
- Empty states : illustration + texte + action principale
- Erreurs : titre clair + cause + action de récupération
- Pas de "Quelque chose s'est mal passé" sans précision

### 8.3 Onboarding du contact RH client
- Wizard simplifié, action par action
- Microcopy très soignée
- Aide contextuelle accessible
- Possibilité de contacter le cabinet (Phase 2 : messagerie)

## 9. Outils et stack UX

- **Maquettes** : Figma
- **Design tokens** : centralisés dans le repo, partagés Figma ↔ code
- **Composants** : shadcn/ui customisé + Tailwind pour le frontend, Storybook pour la documentation
- **A/B testing** : PostHog Feature Flags (Phase 2)
- **Analytics** : PostHog (events, funnels, replays)
- **Tests utilisateurs** : Lookback ou tests in-app (5-7 utilisateurs par cycle)

## 10. Cycle de revue

Ces principes sont revus :
- **Trimestriellement** : ajustement si patterns récurrents incompatibles émergent
- **Annuellement** : revue complète
- **Sur événement** : retours pilotes massifs négatifs sur un principe

Toute modification structurante des principes nécessite une discussion équipe + documentation dans un ADR.

## 11. Inspirations

Produits dont l'UX résonne avec les principes ZARYA :
- **Linear** : opinion forte, microcopy excellente, raccourcis clavier
- **Notion** : flexibilité + simplicité initiale
- **Stripe Dashboard** : densité d'info contrôlée pour experts
- **Apple HIG** : accessibilité et respect du user
- **Pennylane (FR)** : ergonomie comptable moderne

## 12. À tenir à jour

Modification ces principes :
1. Discussion en équipe (au moins 2 personnes)
2. Documentation dans un ADR si décision structurante
3. Mise à jour de ce document
4. Communication équipe
5. Re-audit des écrans existants si principe nouveau

Version actuelle : **v0.1** — Mai 2026.
