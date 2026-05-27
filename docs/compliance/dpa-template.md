---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
type: compliance
public: false
depends_on: [cgu, registre-traitements, sous-traitants, security-and-audit]
referenced_by: [_index, cgu]
---

# Contrat de Sous-Traitance (DPA) — Template ZARYA

> Modèle de Data Processing Agreement entre ZARYA SA (sous-traitant) et le Cabinet Client (responsable de traitement).
>
> ⚠️ **Document à valider impérativement par un juriste suisse** avant utilisation contractuelle. Rédaction interne, structure conforme RGPD art. 28 et nLPD art. 9.
>
> À annexer aux CGU lors de la signature de chaque cabinet client.

> **Version** : 1.0 — Mai 2026

---

## Préambule

Le présent Contrat de Sous-Traitance (ci-après "**DPA**" pour Data Processing Agreement) est conclu entre :

**ZARYA SA**, société à incorporer, ayant son siège à [adresse], Genève, Suisse, immatriculée sous IDE [à compléter], représentée par [nom, fonction],

Ci-après dénommée "**ZARYA**" ou le "**Sous-Traitant**"

ET

**[Raison sociale du Cabinet]**, [forme juridique], ayant son siège à [adresse], immatriculée sous IDE [...], représentée par [...],

Ci-après dénommée le "**Cabinet**" ou le "**Responsable de Traitement**"

Ensemble dénommés les "**Parties**".

**Considérant** :
- Que le Cabinet utilise le service ZARYA dans le cadre de l'exécution de ses prestations fiduciaires
- Que ZARYA traite des données personnelles pour le compte du Cabinet
- Que les Parties souhaitent encadrer ces traitements conformément aux exigences nLPD et RGPD

Il a été convenu ce qui suit.

---

## Article 1 — Objet du DPA

Le présent DPA définit les obligations respectives des Parties concernant le traitement par ZARYA des données personnelles dont le Cabinet est responsable de traitement, dans le cadre des CGU souscrites.

Il complète les CGU et prévaut en cas de contradiction sur les questions de protection des données personnelles.

## Article 2 — Définitions

Les définitions du RGPD (art. 4) et de la nLPD (art. 5) s'appliquent :
- **Données personnelles** : toute information se rapportant à une personne physique identifiée ou identifiable
- **Traitement** : toute opération sur des données personnelles
- **Responsable du traitement** : entité qui détermine les finalités et les moyens du traitement
- **Sous-traitant** : entité qui traite des données pour le compte du responsable
- **Personne concernée** : personne physique identifiée par les données
- **Violation** : violation de la sécurité entraînant destruction, perte, altération, divulgation, ou accès non autorisé

## Article 3 — Qualifications des Parties

### 3.1 Cabinet — Responsable de Traitement
Le Cabinet est qualifié de **Responsable de Traitement** pour les données qu'il importe, génère ou fait traiter via ZARYA, notamment :
- Données des contacts de ses propres clients PME
- Données salariales des employés des PME clientes
- Documents et factures de ses clients

### 3.2 ZARYA — Sous-Traitant
ZARYA est qualifiée de **Sous-Traitant** pour ces données. ZARYA traite les données :
- Sur instruction documentée du Cabinet (via l'utilisation du Service)
- Pour les finalités convenues (gestion fiduciaire)
- Avec les moyens techniques et organisationnels appropriés

### 3.3 Cas particulier des membres du cabinet
Pour les données des membres du Cabinet (collaborateurs utilisant ZARYA), ZARYA peut être qualifiée de responsable conjoint ou de responsable indépendant selon les finalités. Détails dans la Politique de Confidentialité.

## Article 4 — Description des traitements

### 4.1 Catégories de personnes concernées
- Membres du Cabinet (utilisateurs ZARYA)
- Contacts professionnels des clients PME (RH, dirigeants, comptables)
- Salariés des clients PME (si service Salaires activé)
- Toute personne mentionnée dans des documents traités

### 4.2 Catégories de données
Détail complet dans le registre des traitements (annexé). Synthèse :
- Identité (nom, prénom, date de naissance)
- Coordonnées (email, téléphone, adresse)
- Identifiants nationaux (AVS, IDE)
- Données bancaires (IBAN)
- Données salariales (salaire, primes, déductions)
- Données de santé (certificats médicaux — sensible)
- Contenus documentaires divers

### 4.3 Finalités
ZARYA traite les données uniquement pour :
- Fournir le Service tel que décrit dans les CGU
- Assurer la sécurité et l'intégrité du Service
- Respecter ses obligations légales
- Améliorer le Service (sans utilisation des Données pour entraîner des modèles tiers)

### 4.4 Durée
La durée du traitement correspond à la durée du contrat de services + 90 jours de conservation post-résiliation, sauf obligations légales (10 ans données comptables/salariales).

## Article 5 — Obligations de ZARYA en tant que Sous-Traitant

### 5.1 Instructions
ZARYA ne traite les données que sur instruction documentée du Cabinet (les CGU et l'usage du Service constituent ces instructions). Toute instruction supplémentaire doit être formalisée par écrit.

### 5.2 Confidentialité
ZARYA garantit que toute personne ayant accès aux données est tenue à une obligation de confidentialité contractuelle.

### 5.3 Sécurité (art. 32 RGPD / art. 8 nLPD)
ZARYA met en œuvre les mesures techniques et organisationnelles appropriées :
- Chiffrement en transit (TLS 1.3) et au repos (AES-256)
- Chiffrement applicatif renforcé pour données sensibles (Vault)
- Isolation multi-tenant via RLS Postgres
- Authentification forte (2FA recommandée puis obligatoire)
- Audit complet append-only (6 ans minimum)
- Backups quotidiens chiffrés
- Tests d'isolation en CI
- Pen test annuel (Phase 2)

Détails dans [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md) (annexé par référence).

### 5.4 Sous-traitants ultérieurs
ZARYA recourt à des sous-traitants ultérieurs listés dans [`sous-traitants.md`](./sous-traitants.md). Le Cabinet autorise par les présentes le recours à ces sous-traitants.

ZARYA notifiera tout ajout ou changement substantiel **30 jours avant** son entrée en vigueur. Le Cabinet peut s'y opposer en résiliant le contrat dans ce délai.

### 5.5 Assistance au Cabinet
ZARYA assiste le Cabinet pour :
- Répondre aux demandes des personnes concernées (procédure dédiée dans [`droits-personnes.md`](./droits-personnes.md))
- Réaliser des études d'impact (PIA)
- Notifier les violations
- Démontrer la conformité

### 5.6 Notification de violation
En cas de violation de données, ZARYA notifie le Cabinet **dans les 24 heures** suivant la prise de connaissance. Détails dans [`notification-violation.md`](./notification-violation.md).

### 5.7 Audits
Le Cabinet a le droit de réaliser un audit ZARYA, ou de faire réaliser un audit par un tiers indépendant, après préavis raisonnable (30 jours) et au maximum **une fois par an**.

ZARYA fournit les rapports de certification (SOC 2 quand disponible, etc.) pour limiter le besoin d'audits sur site.

### 5.8 Retour ou suppression des données
À la fin du contrat, et selon le choix du Cabinet :
- **Export** des données au format JSON et CSV pendant 90 jours après résiliation
- **Suppression** des données après 90 jours (ou immédiate sur demande), sauf obligations légales

ZARYA fournit une attestation de suppression sur demande.

## Article 6 — Obligations du Cabinet en tant que Responsable

### 6.1 Légitimité du traitement
Le Cabinet garantit avoir :
- Une base légale pour chaque traitement (contrat avec ses clients PME, etc.)
- Recueilli les consentements requis
- Informé les personnes concernées via sa propre politique de confidentialité

### 6.2 Instructions claires
Le Cabinet documente toute instruction spécifique à ZARYA en dehors de l'usage standard du Service.

### 6.3 Informations aux personnes
Le Cabinet informe ses propres clients et les salariés des PME clientes du recours à ZARYA et de ses caractéristiques (résidence UE, sous-traitants, etc.).

### 6.4 Demandes des personnes
Le Cabinet gère en première ligne les demandes d'exercice des droits de ses clients et salariés. Il peut solliciter l'assistance technique de ZARYA.

## Article 7 — Transferts internationaux

ZARYA s'engage à ne traiter les données qu'en **Union Européenne**, principalement à Frankfurt (eu-central-1) et accessoirement à Paris (eu-west-3, pour Mistral OCR).

Aucun transfert hors UE n'est effectué sans information préalable du Cabinet et mise en œuvre de garanties appropriées (clauses contractuelles types, etc.).

Le seul cas où des données pourraient potentiellement transiter hors UE est **Microsoft Graph** si le tenant du Cabinet est hébergé hors UE. ZARYA vérifie cette localisation à l'onboarding et alerte le Cabinet si nécessaire.

## Article 8 — Documentation

ZARYA tient à disposition :
- Le registre des traitements (annexé)
- L'inventaire des sous-traitants (mis à jour en continu)
- La documentation technique sécurité
- Les rapports d'audit (SOC 2 quand disponible)
- Les attestations de suppression sur demande

## Article 9 — Responsabilité

### 9.1 Responsabilité de ZARYA
ZARYA est responsable des dommages causés par un traitement non conforme à ses obligations de sous-traitant ou aux instructions du Cabinet.

### 9.2 Responsabilité du Cabinet
Le Cabinet est responsable de la légitimité de ses traitements et de l'information appropriée des personnes concernées.

### 9.3 Limitation
La limitation de responsabilité prévue dans les CGU s'applique également au présent DPA.

## Article 10 — Durée et résiliation

### 10.1 Durée
Le DPA prend effet à la signature et reste en vigueur tant que le contrat de services principal (CGU) est actif.

### 10.2 Résiliation
La résiliation des CGU emporte résiliation du DPA. Certaines obligations (suppression des données, attestation) survivent à la résiliation.

## Article 11 — Modifications du DPA

ZARYA peut proposer des modifications au DPA pour s'adapter aux évolutions réglementaires ou techniques. Modifications notifiées au Cabinet avec **30 jours de préavis**.

## Article 12 — Annexes

Les annexes suivantes font partie intégrante du DPA :
- **Annexe 1** : Registre des traitements ([`registre-traitements.md`](./registre-traitements.md))
- **Annexe 2** : Liste des sous-traitants ([`sous-traitants.md`](./sous-traitants.md))
- **Annexe 3** : Mesures de sécurité ([`security-and-audit.md`](../architecture/security-and-audit.md))
- **Annexe 4** : Politique de confidentialité ([`politique-confidentialite.md`](./politique-confidentialite.md))

## Article 13 — Droit applicable et juridiction

Le DPA est régi par le **droit suisse**. Tout litige relève de la juridiction des **tribunaux de Genève**.

## Article 14 — Signatures

Fait à [...], le [...], en deux exemplaires originaux.

**Pour ZARYA SA**
[Nom, fonction]
Signature : _____________________

**Pour [Cabinet]**
[Nom, fonction]
Signature : _____________________

---

## Annexe technique pour le juriste

### Points spécifiques à valider

1. **Forme juridique ZARYA** : SA, Sàrl ou autre ?
2. **Articulation responsable conjoint / sous-traitant** : pour les membres du cabinet, qualification précise à déterminer
3. **Microsoft Graph** : cas particulier du tenant non-UE — clauses adéquates ?
4. **Notification 24h** vs 72h légal : 24h est un engagement plus strict, à confirmer faisable opérationnellement
5. **Audit par un tiers** : conditions exactes (NDA, frais)
6. **Suppression vs anonymisation** : politique précise selon types de données
7. **Articulation avec OAS** (ordonnance archivage suisse) pour les obligations 10 ans
8. **Secret professionnel fiduciaire** : implications spécifiques sur le DPA

### Validation requise avant utilisation

- [ ] Revue juridique complète par cabinet spécialisé en droit du numérique
- [ ] Validation des durées de conservation
- [ ] Validation des clauses de responsabilité
- [ ] Test sur une signature pilote avec un cabinet test

### Évolution prévue

Phase 2 :
- Intégration des certifications (SOC 2) dans les annexes
- Adaptation aux retours des cabinets pilotes
- Templates spécifiques pour cabinets enterprise

---

⚠️ **Document non encore validé juridiquement**. **À ne pas utiliser** comme contrat opposable avant revue par un juriste suisse spécialisé.
