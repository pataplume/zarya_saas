// Cœur PUR du moteur d'échéances (Lot 2 — ADR 0025, achèvement ADR 0011 Run 6).
//
// `calculerOccurrences` est une fonction PURE et déterministe : à partir d'un template
// (règle de génération issue de calendar.template_echeance) et d'un horizon [today,
// today+horizonMois], elle énumère les dates d'échéance de la/les période(s) couverte(s).
// Aucune I/O : 100 % testable hors base. La persistance (lecture des templates, filtres
// service/canton/régime, INSERT crm.echeance + crm.document_attendu) vit dans `generer.ts`
// et s'appuie sur ce cœur.
//
// La sémantique des dates reproduit fidèlement la fonction SQL calendar.fn_generer_echeances
// (migrations 0023/0029) pour que la génération TS (à l'activation d'un service) et la
// génération SQL (cron horizon, Lot 6) restent COHÉRENTES et idempotentes ensemble :
//  - récurrentes (mensuelle/trimestrielle/semestrielle/annuelle) : 1 occurrence par mois
//    de l'horizon où le mois figure dans `mois_dans_annee` (mensuelle = tous les mois) ;
//  - `jour_du_mois` borné au dernier jour du mois (NULL → dernier jour du mois) ;
//  - ponctuelle/evenement : une seule occurrence à `date_specifique` si dans l'horizon ;
//  - `date_alerte` = `date_echeance − delai_alerte_jours` ;
//  - `libelle` = `nom (MM.YYYY)` ;
//  - horizon = [today, dernier jour du mois de today + horizonMois].
//
// Granularité au jour, calendrier UTC (cohérent avec le cron SQL — simplification MVP).

/** Fréquences supportées par le moteur (alignées sur calendar.frequence_echeance). */
export type FrequenceEcheance =
  | "mensuelle"
  | "trimestrielle"
  | "semestrielle"
  | "annuelle"
  | "ponctuelle"
  | "evenement";

/** Règle de génération (projection d'une ligne calendar.template_echeance). */
export interface TemplateRule {
  template_id: string;
  nom: string;
  type_echeance: string;
  frequence: FrequenceEcheance;
  /** Mois (1-12) où l'échéance tombe ; NULL pour `mensuelle` (tous les mois). */
  mois_dans_annee: number[] | null;
  /** Jour du mois (1-31) ; NULL → dernier jour du mois. Borné au dernier jour réel. */
  jour_du_mois: number | null;
  /** Date fixe (ponctuelle/evenement). */
  date_specifique: string | null;
  /** Délai d'alerte en jours (date_alerte = date_echeance − N). */
  delai_alerte_jours: number;
}

/** Une occurrence calculée, prête à matérialiser en crm.echeance. */
export interface Occurrence {
  template_id: string;
  type_echeance: string;
  libelle: string;
  /** Date d'échéance au format ISO `YYYY-MM-DD`. */
  date_echeance: string;
  /** Date d'alerte au format ISO `YYYY-MM-DD`. */
  date_alerte: string;
}

// ── Helpers de date UTC purs (pas de dépendance, pas de fuseau local) ─────────

/** Parse `YYYY-MM-DD` en composantes (an, mois 1-12, jour). */
function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Date ISO invalide : ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Formate (an, mois 1-12, jour) en `YYYY-MM-DD` (zéro-padding). */
function toIso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Dernier jour du mois (1-12) d'une année donnée — gère les années bissextiles. */
export function dernierJourDuMois(year: number, month: number): number {
  // Le jour 0 du mois suivant = dernier jour du mois courant (Date UTC).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Soustrait `days` jours à une date ISO (UTC), retourne ISO. */
function soustraireJours(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Compare deux dates ISO `YYYY-MM-DD` lexicographiquement (= chronologiquement). */
function isoLte(a: string, b: string): boolean {
  return a <= b;
}
function isoGte(a: string, b: string): boolean {
  return a >= b;
}

/**
 * Borne supérieure de l'horizon : dernier jour du mois de `today + horizonMois`.
 * (Reproduit `date_trunc('month', today) + horizonMois mois` côté SQL, en incluant
 * tout le mois cible pour ne pas tronquer une échéance de fin de mois.)
 */
export function horizonEnd(today: string, horizonMois: number): string {
  const { year, month } = parseIsoDate(today);
  // month est 1-12 ; on avance de horizonMois mois (base 0 interne).
  const base = new Date(Date.UTC(year, month - 1 + horizonMois, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  return toIso(y, m, dernierJourDuMois(y, m));
}

/**
 * Énumère les occurrences d'un template sur l'horizon [today, today+horizonMois].
 * PURE : aucune I/O. `today` au format `YYYY-MM-DD`.
 */
export function calculerOccurrences(
  rule: TemplateRule,
  today: string,
  horizonMois: number,
): Occurrence[] {
  const fin = horizonEnd(today, horizonMois);
  const occurrences: Occurrence[] = [];

  if (rule.frequence === "ponctuelle" || rule.frequence === "evenement") {
    if (
      rule.date_specifique &&
      isoGte(rule.date_specifique, today) &&
      isoLte(rule.date_specifique, fin)
    ) {
      occurrences.push(materialiser(rule, rule.date_specifique));
    }
    return occurrences;
  }

  // Récurrentes : on balaie chaque mois de l'horizon (du 1er du mois de `today` au
  // 1er du mois de `fin`) et on retient ceux où le mois figure dans mois_dans_annee.
  const start = parseIsoDate(today);
  const end = parseIsoDate(fin);
  let cursor = new Date(Date.UTC(start.year, start.month - 1, 1));
  const last = new Date(Date.UTC(end.year, end.month - 1, 1));

  while (cursor.getTime() <= last.getTime()) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1; // 1-12
    const moisMatch = rule.frequence === "mensuelle" || rule.mois_dans_annee?.includes(m) === true;

    if (moisMatch) {
      const dernier = dernierJourDuMois(y, m);
      // jour_du_mois borné au dernier jour ; NULL → dernier jour du mois.
      const jour = rule.jour_du_mois == null ? dernier : Math.min(rule.jour_du_mois, dernier);
      const dateEcheance = toIso(y, m, jour);
      // Idempotence avec le SQL : on ne retient que les dates dans [today, fin].
      if (isoGte(dateEcheance, today) && isoLte(dateEcheance, fin)) {
        occurrences.push(materialiser(rule, dateEcheance));
      }
    }
    cursor = new Date(Date.UTC(y, m, 1)); // mois suivant
  }

  return occurrences;
}

/** Construit l'occurrence (libellé + date_alerte) pour une date d'échéance donnée. */
function materialiser(rule: TemplateRule, dateEcheance: string): Occurrence {
  const { year, month } = parseIsoDate(dateEcheance);
  const mm = String(month).padStart(2, "0");
  return {
    template_id: rule.template_id,
    type_echeance: rule.type_echeance,
    libelle: `${rule.nom} (${mm}.${year})`,
    date_echeance: dateEcheance,
    date_alerte: soustraireJours(dateEcheance, rule.delai_alerte_jours),
  };
}
