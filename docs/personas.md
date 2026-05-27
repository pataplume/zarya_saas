---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
type: foundation
depends_on: [vision]
referenced_by: [modules/crm, modules/doc, modules/calendar, modules/facture, modules/salaire, modules/dashboard-client, modules/onboarding-fiduciaire, modules/onboarding-client, validation/interview-guide]
---

# Personas

> Les personas guident chaque décision produit. Ils ne sont pas marketing : ils sont opérationnels et utilisés pour arbitrer "pour qui on optimise ?" à chaque feature.

## 1. Vue d'ensemble

ZARYA touche **5 personas** distincts répartis sur 2 surfaces produit :

### Côté fiduciaire (le tenant cabinet)
1. **Sophie — Responsable cabinet** : pilote l'activité, prend les décisions stratégiques
2. **Marc — Gestionnaire salaires** : exécute les cycles mensuels, ultra-spécialisé
3. **Julie — Collaborateur comptable polyvalent** : traite documents, factures, support clients

### Côté client final (la PME servie par le cabinet)
4. **Patrick — Dirigeant PME** : valide ce qui engage juridiquement son entreprise
5. **Aïcha — Assistante RH/Admin** : opère le quotidien (envoie les docs, valide les salaires)

---

## 2. Sophie — Responsable cabinet

### 2.1 Carte d'identité
- **Âge** : 38-55 ans
- **Formation** : Brevet fédéral d'agent fiduciaire ou expert-comptable diplômé
- **Statut** : Associée ou directrice du cabinet
- **Cabinet typique** : 5-15 personnes, 100-250 clients PME

### 2.2 Quotidien
- Arrive à 8h, finit à 19h+
- Multitâche permanent : 30% gestion d'équipe, 30% relation client stratégique, 30% mandats complexes en direct, 10% commercial/admin
- Outils : Outlook (intensif), Bexio CRM, Excel maison pour le pilotage, logiciels comptables
- Réunions clients 2-3 fois par semaine
- Pas de temps pour des outils complexes ou des formations longues

### 2.3 Douleurs principales
1. **Aveuglement opérationnel** : ne sait pas en temps réel quels dossiers sont en retard, à risque, ou à problème
2. **Dépendance aux collaborateurs** : si un collaborateur est absent, le suivi de ses dossiers s'arrête
3. **Risque caché** : découvre les amendes ou pertes de mandats trop tard
4. **Difficulté à monter en charge** : prendre 10 clients de plus = embaucher

### 2.4 Objectifs avec ZARYA
- **Vue d'ensemble immédiate** sur les 200 dossiers (statuts, échéances, risques)
- **Identification proactive** des dossiers à problème avant qu'ils n'explosent
- **Reporting** aux associés et au client final (qualité de service mesurable)
- **Productivité de l'équipe** sans embaucher

### 2.5 Critères de décision
- **ROI mesurable** : combien d'heures gagnées par mois ?
- **Conformité** : RGPD, nLPD, secret professionnel respectés
- **Adoption équipe** : si Julie et Marc ne s'y mettent pas, c'est mort
- **Pas de risque vendor lock-in** : exports possibles à tout moment

### 2.6 Citations probables (à valider en interview)
> *"Je veux savoir le matin en arrivant ce qui est urgent, sans avoir à demander à chaque collaborateur."*

> *"Si je dois apprendre à utiliser un nouvel outil, c'est non. Mes collaborateurs doivent pouvoir l'utiliser sans formation."*

> *"Les amendes parce qu'on a raté une échéance, c'est inacceptable mais ça arrive. Une fois suffit pour saper la confiance d'un client."*

### 2.7 UX optimisée pour Sophie
- **Dashboard d'entrée** affichant les 5 actions prioritaires du jour
- **Filtres rapides** par responsable, par client, par statut de risque
- **Notifications push** uniquement pour les vraies urgences (pas spam)
- **Reporting exportable** (PDF, Excel) en 1 clic
- **Mobile-friendly** pour consulter en réunion ou en déplacement

---

## 3. Marc — Gestionnaire salaires

### 3.1 Carte d'identité
- **Âge** : 30-50 ans
- **Formation** : Spécialiste en gestion du personnel avec brevet fédéral
- **Statut** : Collaborateur spécialisé, gère 80-150 mandats salaires
- **Cabinet** : structure de 5+ personnes (les petits cabinets externalisent)

### 3.2 Quotidien
- Cycle mensuel structuré : du 1er au 20 = relances + validations + calculs ; du 21 au 30 = bouclements et déclarations
- Travail répétitif et précis : la moindre erreur sur un salaire est dramatique
- 1-2 jours par mois rien que pour les relances clients
- Outils : Bexio Payroll, Crésus Salaires, Abacus Lohn ou WinBIZ selon les mandats
- Stress important autour des deadlines mensuelles

### 3.3 Douleurs principales
1. **Relances chronophages** : 80 emails individuels pour demander les variables du mois
2. **Réponses tardives** : 30% des clients répondent après J+10 (deadline = J+15)
3. **Ressaisie manuelle** : éléments envoyés par email/Excel à ressaisir dans le logiciel paie
4. **Gestion des exceptions** : un nouvel employé, un départ, un avenant = recherche d'infos dans les mails du dirigeant

### 3.4 Objectifs avec ZARYA
- **Automatiser les relances mensuelles** (validées avant envoi)
- **Centraliser les éléments du mois** (heures, primes, absences) sans copier-coller
- **Voir le statut de validation client** en temps réel (qui a validé, qui pas)
- **Exporter directement** vers le logiciel paie (CSV ou API)

### 3.5 Critères de décision
- **Précision** : zero error tolérée sur les calculs et données salariales
- **Conformité Swissdec** : norme ELM, AVS, LPP, IS, AC
- **Export vers son logiciel** : si pas de connecteur Bexio Payroll ou Crésus, c'est compliqué
- **Audit trail** : qui a modifié quoi quand (litige employé possible)

### 3.6 Citations probables
> *"Le mois dernier, j'ai envoyé 80 emails pour demander les heures. 25 m'ont répondu après le 15. C'est invivable."*

> *"Quand un client me dit 'j'ai engagé quelqu'un', je dois lui poser 15 questions par email pour avoir toutes les infos. Tipee fait ça bien, mais c'est cher pour mes clients."*

> *"Si je dois recopier les chiffres depuis ZARYA dans Bexio Payroll, je préfère continuer comme avant."*

### 3.7 UX optimisée pour Marc
- **Tableau de bord cycle mensuel** : 80 lignes clients × statut validation
- **Workflow de validation 1-clic** quand tout est conforme
- **Détection automatique des anomalies** (variation suspecte de salaire, AVS manquant)
- **Export CSV/Excel formaté** pour son logiciel (à terme : API)
- **Audit log accessible** sur chaque modification d'employé

---

## 4. Julie — Collaborateur comptable polyvalent

### 4.1 Carte d'identité
- **Âge** : 25-40 ans
- **Formation** : CFC d'employée de commerce + brevet en cours, OU diplôme HEG
- **Statut** : Collaboratrice traitant 20-40 mandats complets (compta + TVA)
- **Cabinet** : variable, surtout les structures < 15 personnes

### 4.2 Quotidien
- Multitâche absolue : 20 mandats à des stades différents
- Reçoit 100+ emails par jour avec PJ à traiter
- Saisit des factures dans Bexio toute la journée
- Répond aux questions des clients
- Prépare la TVA trimestrielle pour 10-15 clients en parallèle

### 4.3 Douleurs principales
1. **Tri d'emails sans fin** : 100 emails/jour, dont 30 avec PJ à classer et nommer
2. **Saisie factures fastidieuse** : 5 min × 50 factures/jour = 4h
3. **Recherche dans le NAS** : "où est ce document que j'ai classé l'an dernier ?"
4. **Interruptions clients** : questions par email, téléphone, qui cassent la concentration

### 4.4 Objectifs avec ZARYA
- **Inbox documentaire** unifiée : tout arrive là, classé automatiquement
- **Extraction factures** : valider en 1 clic au lieu de ressaisir
- **Recherche conversationnelle** : poser une question, avoir la réponse + source
- **Statut clients à jour** sans effort manuel

### 4.5 Critères de décision
- **Gain de temps réel** : la promesse doit se vérifier dès la 1ère semaine
- **Pas de complexité ajoutée** : si l'outil est plus lent qu'Outlook + Bexio, c'est non
- **Précision IA** : si elle doit reclasser 50% des documents, l'outil est pire que rien
- **Compatibilité Bexio** : son logiciel principal

### 4.6 Citations probables
> *"Je passe 2 heures par jour à trier des emails. C'est pas mon métier."*

> *"La facture du même fournisseur arrive chaque mois. Je devrais pas avoir à la ressaisir 12 fois par an."*

> *"Quand je cherche un document, je sais qu'il existe mais je ne le retrouve jamais."*

### 4.7 UX optimisée pour Julie
- **Inbox unifiée** : emails + uploads + NAS dans une seule vue
- **Validation 1-clic** sur les propositions IA (classement, extraction)
- **Raccourcis clavier** : Julie tape vite, la souris la ralentit
- **Recherche full-text + sémantique** dans tous les documents du client
- **Templates de réponse** pour les questions clients récurrentes

---

## 5. Patrick — Dirigeant PME

### 5.1 Carte d'identité
- **Âge** : 40-60 ans
- **Formation** : variable (technique, commerce, autodidacte)
- **Statut** : patron d'une PME de 5-50 employés
- **Secteur** : artisanat, services, retail, industrie locale

### 5.2 Relation avec ZARYA
- **Utilisateur occasionnel** du dashboard client
- Connexion 1-2 fois par mois : valider les salaires, consulter un document
- **Pas son outil principal** : il vit dans son métier (chantier, atelier, client)
- Délègue le quotidien à son équipe (Aïcha) mais valide les décisions engageantes

### 5.3 Douleurs principales
1. **Pas de visibilité** sur son cabinet : "Est-ce qu'ils s'occupent bien de mon dossier ?"
2. **Manque de temps** pour comprendre la compta : "Je veux pas devenir comptable"
3. **Anxiété fiscale** : peur des contrôles, amendes
4. **Communication asymétrique** : son cabinet lui demande des trucs sans contexte

### 5.4 Objectifs avec ZARYA
- **Confiance** : voir que les choses avancent (statut visible, dashboard simple)
- **Réactivité** : valider en 1 clic ce qui doit l'être, signer en mobilité
- **Continuité** : si Aïcha quitte la boîte, Patrick doit pouvoir reprendre seul
- **Conformité automatique** : ZARYA prévient avant les échéances importantes

### 5.5 Critères de décision
- **Pas un nouveau compte à gérer** : login simple, idéalement biométrie
- **Compréhensible sans jargon** : "remboursements de frais" pas "indemnités forfaitaires"
- **Mobile** : il valide depuis son téléphone entre 2 chantiers
- **Pas plus de travail qu'avant** : si ZARYA lui ajoute des tâches, c'est non

### 5.6 Citations probables
> *"Tant que c'est plus simple que ce que je fais aujourd'hui, OK. Sinon, je continue mes Excel."*

> *"Je veux pas avoir 3 mots de passe à retenir pour mon fiduciaire."*

> *"Si mon cabinet me dit 'utilise ZARYA', je dis oui. Mais si c'est compliqué, je vais demander à Aïcha de gérer."*

### 5.7 UX optimisée pour Patrick
- **Dashboard client mobile-first**
- **Connexion biométrique** (Phase 2)
- **Notifications email rares** mais claires : "Validation salaires de mai à faire avant le 20"
- **1 action principale par écran** : pas de surcharge cognitive
- **Microcopy sans jargon**

---

## 6. Aïcha — Assistante RH/Admin

### 6.1 Carte d'identité
- **Âge** : 25-50 ans
- **Formation** : CFC employée de commerce, parfois école hôtelière ou autre
- **Statut** : secrétariat/admin/RH dans la PME du dirigeant
- **PME** : 10-50 employés

### 6.2 Quotidien
- Polyvalente : RH, admin, parfois comptabilité interne, parfois support direction
- Premier point de contact des employés (questions paie, congés, etc.)
- Interface entre la PME et le cabinet fiduciaire
- Outils : Outlook, Excel maison, parfois Tipee, parfois Bexio Light

### 6.3 Douleurs principales
1. **Va-et-vient avec le cabinet** : "Le cabinet me demande tel doc, je dois le chercher dans mes emails"
2. **Manque d'autonomie** : doit attendre le cabinet pour comprendre ce qui se passe
3. **Risque d'erreurs** : un oubli sur les variables salaire et c'est elle qui est en première ligne
4. **Pression du dirigeant** : "Tu as envoyé ce qu'on devait au cabinet ?"

### 6.4 Objectifs avec ZARYA
- **Centraliser les échanges** avec le cabinet (plus de chaîne email à 15 messages)
- **Voir ce qui est attendu** d'elle ce mois-ci
- **Valider rapidement** sans appeler le cabinet pour chaque détail
- **Garder la trace** de ce qui a été envoyé et quand

### 6.5 Critères de décision
- **Gain de temps** : doit pouvoir traiter le cycle salaire mensuel en 30 min max
- **Clarté** : "qu'est-ce que je dois faire cette semaine ?"
- **Pas de dépendance technique** : doit pouvoir bosser sans appeler l'IT
- **Continuité** : ses échanges avec le cabinet doivent rester accessibles

### 6.6 Citations probables
> *"Le 15 du mois, je suis sous l'eau pour préparer les variables. Si je peux faire ça en 30 minutes au lieu de 2 heures, j'achète."*

> *"Le cabinet me demande toujours les mêmes documents. Pourquoi je dois les renvoyer chaque mois ?"*

> *"Quand mon patron me demande 'tu as envoyé ça au fiduciaire ?', je veux pouvoir lui montrer en 5 secondes."*

### 6.7 UX optimisée pour Aïcha
- **Dashboard client** comme cockpit mensuel
- **Checklist documents** du mois bien visible
- **Tableau salaires** intuitif (vue grille Excel-like)
- **Historique des envois** consultable
- **Notifications proactives** : "Reste 3 jours pour valider"

---

## 7. Matrice persona × module

Quel persona utilise quel module ? Aide à prioriser les UX :

| Module | Sophie | Marc | Julie | Patrick | Aïcha |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard fiduciaire | ⚡ | • | • | — | — |
| CRM | ⚡ | • | ⚡ | — | — |
| Doc | • | • | ⚡ | — | — |
| Calendar | ⚡ | ⚡ | • | — | — |
| Facture | — | — | ⚡ | — | — |
| Salaire | • | ⚡ | • | — | — |
| Dashboard client | — | — | — | ⚡ | ⚡ |
| Onboarding fiduciaire | ⚡ | — | — | — | — |
| Onboarding client | • | • | • | • | ⚡ |
| Search | ⚡ | • | ⚡ | — | — |

⚡ = user principal, • = user occasionnel, — = pas concerné

## 8. Arbitrages produit liés aux personas

### Quand 2 personas ont des besoins contradictoires

**Cas 1 : Densité d'information**
- Marc (gestionnaire salaires) veut un tableau dense, 50 lignes visibles
- Aïcha (admin PME) veut peu d'éléments par écran
→ **Décision** : densité différente selon le contexte (vue fiduciaire vs vue client final)

**Cas 2 : Volume de notifications**
- Sophie veut être alertée des urgences seulement
- Julie veut savoir dès qu'un email arrive sur un client
→ **Décision** : préférences personnalisables, défauts différents par rôle

**Cas 3 : Validation manuelle vs auto**
- Sophie pousse pour l'auto-envoi (gain de temps)
- Marc pousse pour validation humaine (peur des erreurs salariales)
→ **Décision** : politique par cabinet, par défaut humain pour les salaires, opt-in auto-envoi pour les relances doc

## 9. Personas en interview (validation)

Cible des 10-15 premières interviews qualitatives :
- 5-7 **Sophie** (responsables cabinets variés en taille)
- 2-3 **Marc** (gestionnaires salaires spécialisés)
- 2-3 **Julie** (collaboratrices polyvalentes)
- 2-3 **Patrick** ou **Aïcha** (côté client PME, via les cabinets)

Voir [`validation/interview-guide.md`](./validation/interview-guide.md) pour le guide détaillé.

## 10. À valider / à enrichir

- [ ] **Distribution réelle des personas** : combien de Marc dédiés vs Julie polyvalents ?
- [ ] **Patrick vs Aïcha** : qui valide vraiment les salaires (selon taille PME) ?
- [ ] **Sophie vs associés** : dans les cabinets > 10 personnes, qui décide vraiment ?
- [ ] **Persona junior fiduciaire** (apprenti, stagiaire) : à inclure ou à ignorer ?
- [ ] **Conjoint(e) dirigeant** : souvent en charge admin dans les petites PME (cas particulier d'Aïcha ?)
- [ ] **Persona externe** : expert comptable d'une PME qui ne passe pas par le cabinet fiduciaire ?
