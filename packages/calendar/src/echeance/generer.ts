// Moteur d'échéances par CLIENT (Lot 2 — ADR 0025, achèvement ADR 0011 Run 6).
//
// `genererEcheancesPourClient(cabinet_id, client_id)` matérialise les crm.echeance
// récurrentes d'UN client à partir de ses services actifs + régime TVA + canton, via
// le catalogue calendar.template_echeance (globaux cabinet_id IS NULL + overrides du
// cabinet). Déclenché à l'activation/mise à jour d'un crm.service (ou d'un régime dans
// param_comptable / salaire_config) — la génération initiale que le cron SQL (Lot 6)
// complétera ensuite sur l'horizon roulant.
//
// COHÉRENCE avec le SQL : le cœur de calcul de dates (catalogue.ts) reproduit la fonction
// calendar.fn_generer_echeances. Les filtres d'applicabilité (service_requis, canton_
// specifique, override herite_de_id) sont rejoués ici en SQL paramétré, scopés au client ;
// le filtre regime_tva est rejoué côté TS (regime-tva.ts) pour appliquer un régime PAR
// DÉFAUT dérivé de la périodicité TVA quand le régime n'est pas renseigné (P0-5).
// L'IDEMPOTENCE est garantie par la même clé que le SQL : (client_id, template_id,
// date_echeance) non archivé. Re-générer après modif d'un service ne duplique ni ne détruit
// l'historique (les échéances déjà traitées/reportées restent intactes).
//
// Sécurité : `db` service role BYPASSE la RLS (ADR 0005 addendum). La frontière réelle est
// le filtre (cabinet_id, client_id) discipliné dans CHAQUE requête ci-dessous. La fonction
// vérifie d'abord que le client appartient au cabinet (anti-fuite cross-tenant).

import { and, db, documentAttendu, echeance, eq, inArray, isNull, sql } from "@zarya/db";
import { calculerOccurrences, type Occurrence, type TemplateRule } from "./catalogue";
import { templateMatcheRegimeTva } from "./regime-tva";

export interface GenererEcheancesOptions {
  /** Horizon de génération en mois (défaut 12, comme le cron SQL). */
  horizonMois?: number;
  /** Date de référence `YYYY-MM-DD` (défaut : aujourd'hui UTC) — injectable pour les tests. */
  today?: string;
}

export interface GenererEcheancesResult {
  /** Échéances effectivement insérées (hors doublons idempotents). */
  echeances_creees: number;
  /** Occurrences calculées au total (avant dédoublonnage idempotent). */
  occurrences_calculees: number;
  /** Templates applicables au client (après filtres service/canton/régime/override). */
  templates_applicables: number;
}

// Type littéral (pas une interface) pour satisfaire la contrainte Record<string, unknown>
// de db.execute<T>. Reprend les champs de TemplateRule + colonnes de persistance.
type TemplateRow = {
  template_id: string;
  nom: string;
  type_echeance: string;
  frequence: TemplateRule["frequence"];
  mois_dans_annee: number[] | null;
  jour_du_mois: number | null;
  date_specifique: string | null;
  delai_alerte_jours: number;
  documents_requis_types: string[] | null;
  service_id: string | null;
  /** Filtre régime TVA du template (NULL = tous régimes) — appliqué côté TS (regime-tva.ts). */
  regime_tva: string[] | null;
};

// Type littéral (même contrainte Record<string, unknown> de db.execute<T> que TemplateRow),
// structurellement compatible avec ServicePourRegimeTva (regime-tva.ts).
type ServiceRow = {
  type: string;
  frequence: string | null;
  regime_tva: string | null;
};

/** Date du jour au format ISO UTC `YYYY-MM-DD`. */
function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Génère (idempotemment) les échéances récurrentes d'un client. Retourne un résumé.
 * Si le client n'appartient pas au cabinet, ne fait rien et retourne des compteurs à 0.
 */
export async function genererEcheancesPourClient(
  cabinet_id: string,
  client_id: string,
  opts: GenererEcheancesOptions = {},
): Promise<GenererEcheancesResult> {
  const horizonMois = opts.horizonMois ?? 12;
  const today = opts.today ?? todayUtcIso();

  const vide: GenererEcheancesResult = {
    echeances_creees: 0,
    occurrences_calculees: 0,
    templates_applicables: 0,
  };

  // Garde d'appartenance (anti-fuite) : le client doit être de ce cabinet, non archivé.
  const [cible] = await db.execute<{ id: string }>(sql`
    SELECT id FROM crm.client
    WHERE id = ${client_id}::uuid AND cabinet_id = ${cabinet_id}::uuid AND archived_at IS NULL
    LIMIT 1
  `);
  if (!cible) return vide;

  // Services actifs du client (type, périodicité, régime TVA) — support du filtre regime_tva
  // rejoué côté TS (regime-tva.ts) pour appliquer le régime PAR DÉFAUT (P0-5). COALESCE sur
  // la clé legacy 'regime' : l'action bulk d'onboarding a historiquement écrit le régime sous
  // `parametres->>'regime'` (clé jamais lue par le moteur — bug corrigé), on guérit ces lignes
  // à la lecture sans migration de données.
  const servicesActifs = await db.execute<ServiceRow>(sql`
    SELECT
      s.type::text      AS type,
      s.frequence::text AS frequence,
      COALESCE(s.parametres ->> 'regime_tva', s.parametres ->> 'regime') AS regime_tva
    FROM crm.service s
    WHERE s.client_id = ${client_id}::uuid
      AND s.cabinet_id = ${cabinet_id}::uuid
      AND s.actif AND s.archived_at IS NULL
  `);

  // Templates applicables AU CLIENT : on rejoue les mêmes filtres que fn_generer_echeances,
  // scopés (cabinet_id, client_id) — SAUF le filtre regime_tva, appliqué côté TS ci-dessous
  // (templateMatcheRegimeTva) pour dériver un régime par défaut de la périodicité TVA (P0-5).
  // Un override de CE cabinet (herite_de_id → global) supplante son parent global. Le service
  // rattaché = plus ancien service actif matchant.
  const templates = await db.execute<TemplateRow>(sql`
    SELECT
      t.id::text          AS template_id,
      t.nom               AS nom,
      t.type_echeance::text AS type_echeance,
      t.frequence::text   AS frequence,
      t.mois_dans_annee   AS mois_dans_annee,
      t.jour_du_mois      AS jour_du_mois,
      to_char(t.date_specifique, 'YYYY-MM-DD') AS date_specifique,
      t.delai_alerte_jours AS delai_alerte_jours,
      t.documents_requis_types AS documents_requis_types,
      t.regime_tva        AS regime_tva,
      (SELECT s.id::text
         FROM crm.service s
        WHERE s.client_id = ${client_id}::uuid AND s.actif AND s.archived_at IS NULL
          AND (t.service_requis IS NULL OR s.type::text = ANY(t.service_requis))
        ORDER BY s.id
        LIMIT 1) AS service_id
    FROM crm.client c
    JOIN calendar.template_echeance t
      ON (t.cabinet_id = c.cabinet_id OR t.cabinet_id IS NULL)
    WHERE c.id = ${client_id}::uuid
      AND c.cabinet_id = ${cabinet_id}::uuid
      AND c.archived_at IS NULL
      AND t.actif
      -- Un global supplanté par un override de CE cabinet est exclu.
      AND (t.cabinet_id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM calendar.template_echeance o
             WHERE o.cabinet_id = c.cabinet_id AND o.herite_de_id = t.id AND o.actif))
      -- service_requis : le client a un service actif du bon type.
      AND (t.service_requis IS NULL OR EXISTS (
            SELECT 1 FROM crm.service s
             WHERE s.client_id = c.id AND s.actif AND s.archived_at IS NULL
               AND s.type::text = ANY(t.service_requis)))
      -- canton_specifique : fédéral (NULL) ou canton fiscal (siège prioritaire) listé.
      AND (t.canton_specifique IS NULL OR (
            SELECT a.canton
              FROM crm.adresse a
             WHERE a.client_id = c.id AND a.archived_at IS NULL AND a.canton IS NOT NULL
             ORDER BY (a.type = 'siege') DESC, a.est_principale DESC, a.id
             LIMIT 1
          ) = ANY(t.canton_specifique))
  `);

  // Filtre regime_tva côté TS : régime explicite du client, sinon régime PAR DÉFAUT
  // (méthode effective — décompte ordinaire suisse) dérivé de la périodicité du service
  // TVA. Règle documentée et testée dans regime-tva.ts (P0-5 : un régime NULL ne doit
  // plus court-circuiter en silence la génération des échéances TVA).
  const applicables = templates.filter((t) =>
    templateMatcheRegimeTva(t.regime_tva, servicesActifs),
  );

  const result: GenererEcheancesResult = {
    echeances_creees: 0,
    occurrences_calculees: 0,
    templates_applicables: applicables.length,
  };

  for (const t of applicables) {
    const occurrences = calculerOccurrences(toRule(t), today, horizonMois);
    result.occurrences_calculees += occurrences.length;
    for (const occ of occurrences) {
      const inserted = await insererEcheanceIdempotente(cabinet_id, client_id, t, occ);
      if (inserted) result.echeances_creees++;
    }
  }

  return result;
}

/** Projette une ligne template DB vers la règle pure (catalogue.ts). */
function toRule(t: TemplateRow): TemplateRule {
  return {
    template_id: t.template_id,
    nom: t.nom,
    type_echeance: t.type_echeance,
    frequence: t.frequence,
    mois_dans_annee: t.mois_dans_annee,
    jour_du_mois: t.jour_du_mois,
    date_specifique: t.date_specifique,
    delai_alerte_jours: t.delai_alerte_jours,
  };
}

/**
 * Insère une échéance si elle n'existe pas déjà (idempotence sur (client_id, template_id,
 * date_echeance) non archivé). Résout `documents_requis` = ids des crm.document_attendu du
 * client dont type_document ∈ template.documents_requis_types (cohérent migration 0029).
 * Retourne true si une ligne a été insérée, false si déjà présente (no-op idempotent).
 */
async function insererEcheanceIdempotente(
  cabinet_id: string,
  client_id: string,
  t: TemplateRow,
  occ: Occurrence,
): Promise<boolean> {
  // Idempotence : (client_id, template_id, date_echeance) non archivé. Le check + l'INSERT
  // ne sont pas atomiques, mais le job est rejouable et la fenêtre est inoffensive (au pire
  // un doublon transitoire, rattrapé par la même clé au passage suivant — comportement MVP).
  const [exists] = await db
    .select({ id: echeance.id })
    .from(echeance)
    .where(
      and(
        eq(echeance.client_id, client_id),
        eq(echeance.template_id, occ.template_id),
        eq(echeance.date_echeance, occ.date_echeance),
        isNull(echeance.archived_at),
      ),
    )
    .limit(1);
  if (exists) return false;

  // documents_requis = ids des crm.document_attendu du client dont type_document ∈
  // template.documents_requis_types (cohérent migration 0029). NULL si aucun type déclaré.
  const types = t.documents_requis_types;
  let documents_requis: string[] | null = null;
  if (types && types.length > 0) {
    const docs = await db
      .select({ id: documentAttendu.id })
      .from(documentAttendu)
      .where(
        and(
          eq(documentAttendu.client_id, client_id),
          eq(documentAttendu.cabinet_id, cabinet_id),
          isNull(documentAttendu.archived_at),
          inArray(documentAttendu.type_document, types),
        ),
      );
    documents_requis = docs.length > 0 ? docs.map((d) => d.id) : null;
  }

  await db.insert(echeance).values({
    cabinet_id,
    client_id,
    service_id: t.service_id,
    template_id: occ.template_id,
    // `type` est une enum crm.type_echeance ; le template la garantit valide.
    type: occ.type_echeance as (typeof echeance.$inferInsert)["type"],
    libelle: occ.libelle,
    date_echeance: occ.date_echeance,
    date_alerte: occ.date_alerte,
    statut: "a_venir",
    documents_requis,
  });
  return true;
}
