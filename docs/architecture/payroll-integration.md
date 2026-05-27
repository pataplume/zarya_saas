---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
domain: architecture
depends_on: [data-residency, multi-tenant, llm-strategy]
referenced_by: [salaire, facture, onboarding-fiduciaire]
---

# Intégration logiciels de paie et de comptabilité

## 1. Contexte

ZARYA n'est **pas** un logiciel de paie ni de comptabilité. Les cabinets continuent d'utiliser leurs outils existants (Bexio, Crésus, Abacus, WinBIZ, OfficeMaker, Banana...).

ZARYA fournit la **couche d'orchestration** au-dessus : collecte, validation, structuration des données, puis **export** vers le logiciel cible du cabinet.

Ce document couvre la **stratégie d'export et d'intégration** avec les logiciels métier suisses, à la fois pour le module **Salaire** (employés, périodes, éléments paie) et le module **Facture** (extractions comptables).

## 2. Logiciels cibles en Suisse

### 2.1 Vue d'ensemble du marché
Confiance ~80%. Les parts de marché exactes ne sont pas publiques, à valider en interview.

| Logiciel | Type | Part de marché estimée fiduciaires CH | API publique |
|---|---|---|---|
| **Bexio** | Compta + Payroll | ~40% (croissant) | ✅ Bonne |
| **Crésus** (Epsitec) | Compta + Salaires | ~25% (historique CH romande) | ❌ Aucune |
| **Abacus** | ERP + Lohn | ~15% (cabinets enterprise) | 🟡 Partenaires uniquement |
| **WinBIZ** | Compta + Salaires | ~10% | 🟡 Limitée |
| **OfficeMaker (Staff)** | Salaires | ~5% | ❌ Aucune publique |
| **Banana** | Compta | ~5% | ❌ Aucune |
| **Excel maison** | Variable | présent partout en complément | n/a |

### 2.2 Stratégie de couverture MVP
- **P0** : Bexio (API) + Excel/CSV générique
- **P1** : Crésus (export fichier) + WinBIZ (export CSV)
- **P2** : Abacus (partenaire) + Banana
- **P3** : OfficeMaker + autres niches

## 3. Patterns d'intégration

ZARYA utilise **3 patterns** selon la maturité technique du logiciel cible :

### 3.1 Pattern A — API native (idéal)
**Logiciels concernés** : Bexio (Compta + Payroll)

- Authentification OAuth 2.0 du cabinet
- Push direct des données validées (employés, factures, écritures)
- Lecture possible pour synchronisation bidirectionnelle
- Webhooks pour notifications temps réel

**Avantages** :
- Fluidité maximale : 0 manipulation utilisateur après validation
- Synchronisation possible (détection de changements côté Bexio)
- Erreurs remontées en temps réel

**Inconvénients** :
- Dépendance API (down, breaking changes, throttling)
- Complexité d'implémentation et de maintenance

### 3.2 Pattern B — Export structuré importable
**Logiciels concernés** : Crésus, WinBIZ, Abacus (formats natifs documentés)

- Génération d'un fichier au format spécifique au logiciel
- Téléchargement par l'utilisateur
- Import manuel dans le logiciel cible

**Avantages** :
- Pas de dépendance API
- Contrôle total côté cabinet
- Compatible toutes versions du logiciel

**Inconvénients** :
- Étape manuelle (download + import)
- Erreurs d'import gérées dans le logiciel cible, pas dans ZARYA
- Pas de sync bidirectionnelle

### 3.3 Pattern C — Excel humain
**Logiciels concernés** : tous les autres, fallback universel

- Export Excel propre, lisible, prêt pour saisie humaine
- Le cabinet ressaisit dans son logiciel à la main

**Avantages** :
- Universel
- Aucune dépendance technique
- Peut servir d'archive

**Inconvénients** :
- Le moins efficient en temps utilisateur
- Risque d'erreurs de ressaisie

**Important** : Excel humain n'est PAS un échec, c'est un **fallback assumé**. Beaucoup de cabinets continueront longtemps avec Crésus + Excel ressaisi, et ZARYA leur apporte déjà énormément de valeur (l'extraction et la validation).

## 4. Bexio (intégration prioritaire)

### 4.1 API Bexio en bref
Confiance 90%. Documentation : https://docs.bexio.com/

- **REST API** avec authentification OAuth 2.0
- **Endpoints principaux** :
  - `/2.0/contact` : contacts (clients + fournisseurs)
  - `/2.0/kb_invoice` : factures clients (vente)
  - `/2.0/kb_bill` : factures fournisseurs (achat) ← critique pour module Facture
  - `/2.0/accounting_journal` : écritures comptables
  - `/3.0/payroll/employees` : employés Bexio Payroll ← critique pour Salaire
  - `/3.0/payroll/payslips` : bulletins de paie
  - `/3.0/payroll/payroll_periods` : périodes de paie
- **Rate limiting** : ~30 req/sec par token (à vérifier)
- **Webhooks** : disponibles pour événements clés

### 4.2 Setup côté cabinet
Au moment de l'étape E de l'onboarding fiduciaire ou plus tard :
1. Section "Connecter Bexio" dans Intégrations
2. Bouton "Connecter Bexio" → OAuth flow Bexio
3. Le cabinet log dans son compte Bexio
4. Consent ZARYA accède aux scopes demandés
5. Stockage credentials chiffrés dans `crm.cabinet_integration`

**Scopes demandés** (principe du moindre privilège) :
- `contact_show`, `contact_edit` (référentiel clients/fournisseurs)
- `kb_bill_show`, `kb_bill_edit` (factures fournisseurs)
- `accounting_show`, `accounting_edit` (écritures)
- `payroll_show`, `payroll_edit` (si le cabinet utilise Bexio Payroll)

### 4.3 Flow factures fournisseurs (module Facture)
Après validation d'une facture dans ZARYA :

```
1. Vérifier l'existence du fournisseur dans Bexio (search /contact)
   → Si absent : créer le contact (POST /contact)
   → Si présent : utiliser son ID
        ↓
2. Créer le kb_bill via POST /2.0/kb_bill
   - contact_id (fournisseur)
   - bill_date, due_date
   - title, reference
   - positions (lignes ou ligne unique avec montant total)
   - tax_id par ligne (mapping taux TVA)
   - account_id (compte de charge selon catégorie)
        ↓
3. Stocker bexio_kb_bill_id dans facture.facture.export_externe
        ↓
4. Marquer facture.facture.statut = 'exportee'
        ↓
5. Logger dans audit (cabinet_id, facture_id, bexio_id, timestamp)
```

### 4.4 Flow employés et paie (module Salaire)
**Phase 2** (le module Salaire est P2 lui-même).

Push des employés validés depuis ZARYA vers Bexio Payroll :
- POST `/3.0/payroll/employees` à la création
- PUT à la modification
- Sync des éléments paie via `/3.0/payroll/payslip_components`

### 4.5 Sync bidirectionnelle
Webhooks Bexio :
- `contact.created`, `contact.updated` : mise à jour `crm.client` côté ZARYA
- `kb_bill.paid` : mise à jour `facture.facture.statut = 'payee'` côté ZARYA

Permet à ZARYA de refléter les changements faits directement dans Bexio.

### 4.6 Gestion d'erreurs Bexio
| Cas | Comportement |
|---|---|
| Token expiré | Refresh automatique (OAuth refresh token) |
| Token révoqué | Notification cabinet, reconnexion requise |
| Rate limit (429) | Queue interne, retry avec backoff |
| Validation Bexio (400) | Log + retour utilisateur explicite, facture en statut `export_echec` |
| Bexio down (5xx) | Retry x3, queue de rattrapage |

### 4.7 Wrapper interne

```typescript
// /lib/integrations/bexio/client.ts
export class BexioClient {
  constructor(private cabinet_id: string) {}
  
  async findOrCreateContact(data: ContactData): Promise<{ id: number }>;
  async createBill(data: BillData): Promise<{ id: number }>;
  async createEmployee(data: EmployeeData): Promise<{ id: number }>;
  async listPayrollPeriods(year: number): Promise<PayrollPeriod[]>;
  async pushPayslipComponents(employee_id: number, data: PayslipData[]): Promise<void>;
  
  // Webhooks
  async subscribeToWebhook(events: WebhookEvent[]): Promise<{ id: string }>;
  async handleWebhookCallback(payload: WebhookPayload): Promise<void>;
}
```

Toujours instancié avec `cabinet_id`. Gestion automatique du token et du refresh.

## 5. Crésus Salaires et Crésus Comptabilité

### 5.1 État de l'intégration
Confiance 70%. Crésus est édité par **Epsitec**.

- **Pas d'API publique** documentée publiquement
- Format de fichier d'import documenté pour Crésus Salaires : format **TXT/CSV propriétaire**
- Crésus Comptabilité : format **CSV de saisie d'écritures** bien établi

À vérifier en pilote : démarche éventuelle avec Epsitec pour un partenariat technique.

### 5.2 Pattern B — Export Crésus Salaires
ZARYA génère un fichier d'import au format Crésus pour chaque période de paie :

```
[Format simplifié, à valider avec Epsitec]
EMPLOYE;PRENOM;NOM;AVS;DATE_NAISS;...
SALAIRE;EMPLOYE_ID;MOIS;ANNEE;ELEMENT;CODE;MONTANT;...
```

Le cabinet télécharge le fichier puis fait "Importer" dans Crésus Salaires.

### 5.3 Pattern B — Export Crésus Comptabilité
Fichier CSV d'écritures :

```
DATE;JOURNAL;DEBIT;CREDIT;LIBELLE;MONTANT;TVA_CODE;...
2026-04-15;Achats;5000;2000;Facture Swisscom;245.80;81;...
```

Mapping des comptes Crésus configuré par le cabinet dans `facture.mapping_export`.

### 5.4 Risques et points d'attention
- **Versions Crésus** : le format peut varier selon la version utilisée par le cabinet. À tester sur 2-3 versions.
- **Encodage** : Crésus utilise historiquement Windows-1252 (ANSI). UTF-8 peut casser les accents.
- **Validation Crésus** : si l'import échoue côté Crésus, l'erreur revient à l'utilisateur côté Crésus, pas ZARYA. Cycle de debug lent.

## 6. Abacus Lohn / Comptabilité

### 6.1 État de l'intégration
Confiance 50%. Abacus est l'**ERP enterprise** dominant en Suisse alémanique.

- **API accessible uniquement aux partenaires certifiés Abacus**
- Programme partenaire (AbaConnect) avec processus de certification
- Coût et délai d'entrée significatifs (estimation : 6-12 mois)

### 6.2 Stratégie MVP
**Pattern B** uniquement : export aux formats d'import Abacus standards (formats XML AbaConnect documentés publiquement même hors partenariat).

### 6.3 Stratégie Phase 3
Démarche de certification AbaConnect si :
- 5+ cabinets clients ZARYA utilisent Abacus
- ROI démontrable

Sinon, rester en pattern B indéfiniment.

## 7. WinBIZ

### 7.1 État de l'intégration
Confiance 60%. WinBIZ est édité par **WinBIZ SA**.

- **API limitée** : existe mais sous-documentée et historiquement peu utilisée
- **Export CSV** documenté et stable

### 7.2 Stratégie MVP
**Pattern B** : export CSV pour les écritures comptables et les employés.

### 7.3 Évaluation API
À explorer en pilote si un cabinet WinBIZ accepte d'être early adopter et de tester l'API.

## 8. OfficeMaker (Staff)

### 8.1 État de l'intégration
Confiance 40%. OfficeMaker est un acteur niche, surtout suisse romande.

- **Pas d'API publique documentée**
- Format d'import à investiguer en pilote

### 8.2 Stratégie
**Pattern C** (Excel humain) en MVP. Évaluation Phase 3 si cabinets clients.

## 9. Banana Compta

### 9.1 État de l'intégration
- **Pas d'API**
- Format **TSV** ou **AC2** propriétaire bien documenté
- Plugins Banana possibles (extension écrite en JavaScript exécutée dans Banana)

### 9.2 Stratégie
- **Pattern B** : export TSV/AC2
- **Phase 2** : plugin Banana qui appelle ZARYA API (idée à creuser)

## 10. Excel maison (fallback universel)

### 10.1 Quand l'utiliser
- Logiciel non supporté
- Cabinet préfère ressaisir manuellement
- Test/debug d'un export

### 10.2 Format proposé
Excel structuré et lisible, pas un dump brut :
- Une feuille par client ou par type (selon contexte)
- Colonnes nommées clairement (en langue du cabinet)
- Couleurs pour distinguer entrées/sorties
- Formules de validation (totaux, contrôles)
- Cellules verrouillées sauf champs éditables

### 10.3 Génération
Via library côté serveur (ExcelJS pour Node.js ou openpyxl pour Python).

## 11. Configuration par cabinet

### 11.1 Choix du logiciel à l'onboarding
Étape E de l'onboarding fiduciaire (voir [`onboarding-fiduciaire.md`](../modules/onboarding-fiduciaire.md)) :
- Dropdown "Logiciel comptable principal"
- Dropdown "Logiciel de paie principal"
- Si Bexio : option OAuth pour activer le pattern A

### 11.2 Mapping comptable
Pour chaque cabinet, mapping configurable :
- Compte fournisseur générique
- Comptes de charges par catégorie (Télécom = 5800, Énergie = 5810...)
- Comptes TVA par taux (8.1% = 1170, 2.6% = 1171, 3.8% = 1172)
- Centres de coûts par client (si analytique)

Stocké dans `facture.mapping_export` et `salaire.mapping_export`.

### 11.3 Préférences d'export
Configurable :
- Au fil de l'eau vs batch hebdo vs batch mensuel
- Format Excel : 1 fichier par client OU 1 fichier global
- Encodage : UTF-8 (défaut) ou Windows-1252 (Crésus)
- Nom de fichier : convention paramétrable

## 12. Modèle de données

### 12.1 Schéma `integration.*` (nouveau, optionnel)
À envisager pour centraliser les exports génériques :

```sql
CREATE TABLE integration.export (
  id uuid PRIMARY KEY,
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id),
  client_id uuid REFERENCES crm.client(id),  -- null si export cabinet-level
  type text NOT NULL,                         -- 'facture', 'salaire'
  logiciel_cible text NOT NULL,               -- 'bexio_compta', 'cresus_salaires', etc.
  pattern text NOT NULL,                      -- 'api', 'file', 'excel'
  statut text NOT NULL,                       -- 'pending', 'success', 'failed'
  ressources_exportees jsonb,                 -- IDs des factures/employés concernés
  fichier_id uuid REFERENCES doc.document,    -- Si pattern B/C
  reponse_externe jsonb,                      -- Si pattern A
  erreur_message text,
  cree_at timestamptz NOT NULL DEFAULT now(),
  termine_at timestamptz
);
```

Sinon : tables par module (`facture.export`, `salaire.export`).

À trancher au moment du code.

## 13. Multi-logiciels par cabinet

### 13.1 Cas réel
Un cabinet peut utiliser **plusieurs logiciels** :
- Bexio pour ses propres comptes
- Crésus pour 60% des clients (historique)
- Abacus pour 2-3 clients enterprise
- WinBIZ pour 5 clients spécifiques

### 13.2 Configuration par client (Phase 2)
Voir `crm.param_comptable.logiciel` au niveau client.

Au moment de l'export d'une facture du client X :
1. Lookup `param_comptable.logiciel` du client
2. Application du pattern adéquat
3. Génération du format approprié

### 13.3 Configuration par défaut cabinet
Si un client n'a pas de `param_comptable.logiciel` défini, fallback sur le logiciel par défaut du cabinet.

## 14. Performance et résilience

### 14.1 Volumes typiques
- 1500-20000 factures/mois/cabinet (selon taille)
- Bursts à fin de mois (clôtures comptables)
- Salaire : 200-3000 employés/cabinet × 1 cycle/mois

### 14.2 Async by default
Tous les exports sont **asynchrones** :
- L'utilisateur valide une facture → retour immédiat
- Job background traite l'export
- Notification de succès/échec dans l'UI

### 14.3 Queue d'export
Implémenter une queue (PostgreSQL LISTEN/NOTIFY ou Redis) pour :
- Ordonnancement des appels API (respect des rate limits)
- Retry automatique en cas d'échec
- Visibilité de l'avancement

### 14.4 Idempotence
Tous les appels d'export doivent être **idempotents** :
- Clé d'idempotence basée sur `(cabinet_id, ressource_id, logiciel)`
- Si retry, ne pas créer de doublon côté logiciel cible

## 15. Sécurité

### 15.1 Credentials API
Stockés chiffrés dans `crm.cabinet_integration` (Supabase Vault).

### 15.2 Audit
Chaque export loggué dans `audit.cabinet_evenement` :
- Type : `export_bexio_facture`, `export_cresus_salaire`, etc.
- Ressource exportée
- Statut
- Latence

### 15.3 Données envoyées
**Important** : Bexio est suisse, Crésus est suisse. Les données restent en Suisse, ce qui est un argument fort vs autres SaaS.

À documenter clairement dans la politique de confidentialité ZARYA.

## 16. UX

### 16.1 Vue principale exports
Dans la sidebar Facture (ou Salaire) :
- Onglet "Exports"
- Liste des exports récents avec statut
- Filtres par logiciel, par client, par date
- Boutons "Re-exporter" et "Télécharger le fichier"

### 16.2 Notifications
- Succès : discrète (toast)
- Échec : visible, avec raison
- Volume important : récap email quotidien

### 16.3 Resolution d'erreurs
Pour chaque export en échec :
- Affichage du message d'erreur du logiciel cible (si pattern A)
- Lien vers la facture/employé concerné
- Bouton "Marquer résolu manuellement" (si l'utilisateur a corrigé directement dans le logiciel cible)

## 17. Risques et points d'attention

### 17.1 Dépendance API tierce
Si Bexio change son API (breaking change), ZARYA peut casser sans préavis. Mitigation :
- Monitoring des erreurs Bexio
- Tests d'intégration en CI
- Versionning explicite (`v2.0`, `v3.0`)
- Veille active sur les release notes

### 17.2 Conformité données envoyées
Push vers Bexio, Crésus, Abacus → les données sortent de ZARYA. Vérifier que :
- Bexio Suisse → conformité OK
- Crésus en local cabinet → conformité OK (les données ne sortent pas du cabinet)
- Abacus cloud → vérifier la région de leur cloud (à priori Suisse)

### 17.3 Volume d'API calls Bexio
Si un cabinet a 100 clients × 50 factures/mois = 5000 appels Bexio/mois. À ce volume, on peut atteindre les quotas Bexio standards. Plan possible Bexio Enterprise ou demande d'augmentation de quota.

### 17.4 Versions de logiciels
Les cabinets ne sont pas tous sur la dernière version (Crésus 13 vs 14, WinBIZ ancien). Tester sur plusieurs versions.

## 18. Hors-scope MVP

- **Synchronisation bidirectionnelle complète** : ZARYA → Bexio + Bexio → ZARYA pour tous les types de données
- **Réécriture en aval** : si une facture est modifiée dans Bexio, la modifier aussi dans ZARYA
- **Conflict resolution** : si modifications concurrentes côté ZARYA et côté logiciel
- **Connecteurs Abacus certifiés** (Phase 3+)
- **Multi-versions** d'un même logiciel (Crésus 12, 13, 14 simultanément)
- **Connecteurs SAP, Microsoft Dynamics** (pas du marché fiduciaire CH PME)
- **Plugins natifs** (Banana plugin, extension Crésus)

## 19. Questions ouvertes

- [ ] **Coût d'usage Bexio API** : tarification Bexio pour usage intensif (>10K appels/mois) ?
- [ ] **Partenariat formel Bexio** : intéressant pour avoir des limits augmentées et un canal de support direct ?
- [ ] **Démarche Crésus / Epsitec** : contacter pour partenariat technique ou rester en pattern B ?
- [ ] **Démarche Abacus / AbaConnect** : ROI réel d'une certification ?
- [ ] **Format de mapping comptable** : un mapping par cabinet ou par cabinet × client ?
- [ ] **Test d'intégration** : comment maintenir des tests automatisés avec des APIs réelles (compte sandbox Bexio) ?
- [ ] **Recovery après erreur** : workflow utilisateur si export Bexio échoue de manière persistante ?
- [ ] **Versions de logiciels** : politique de support (toutes versions actives, dernière + N-1 ?) ?
- [ ] **Webhook Bexio** : tous les événements ou seulement les critiques ?
- [ ] **Frais Stripe** sur les paiements clients du cabinet : à intégrer (compatibilité Bexio Banking) ?
