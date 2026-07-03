/**
 * RUN 7 usabilité — logique pure de la vue grille-mois du calendrier (`/app/calendrier/
 * echeances?vue=grille`). Séparé du composant serveur pour rester testable sans DB ni
 * React : calcul des jours de la grille (avec débordement semaine précédente/suivante),
 * regroupement des échéances par jour, et libellé FR du mois.
 *
 * Pas de dépendance `date-fns` (absente du repo) — tout est calculé en JS natif avec des
 * dates UTC pour éviter les décalages de fuseau horaire sur les bornes de jour.
 */

/** Une échéance minimale nécessaire au regroupement par jour (sur-ensemble de EcheanceRow). */
export type EcheanceGroupable = {
  date_echeance: string | null;
};

/** Une cellule de la grille : un jour, éventuellement hors mois courant. */
export type JourGrille = {
  /** Date au format AAAA-MM-JJ (clé de regroupement). */
  iso: string;
  /** Jour du mois (1-31), pour l'affichage. */
  jour: number;
  /** false pour les jours de débordement (mois précédent/suivant), grisés à l'affichage. */
  dansLeMois: boolean;
  /** true si c'est le jour courant (comparaison sur la date locale, pas l'heure). */
  aujourdhui: boolean;
};

const JOURS_SEMAINE_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

/** En-têtes de colonnes lun→dim (convention CH/FR — semaine commence le lundi). */
export function enTetesJoursSemaine(): readonly string[] {
  return JOURS_SEMAINE_FR;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formatte une date UTC en AAAA-MM-JJ. */
function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Index 0=lundi..6=dimanche pour une date UTC donnée (getUTCDay() renvoie 0=dimanche). */
function indexLundi(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Parse un paramètre `?mois=AAAA-MM` en { annee, mois } (mois 1-indexé, 1-12).
 * Retombe sur le mois courant si absent ou invalide (jamais d'exception).
 */
export function parseMoisParam(
  param: string | undefined,
  maintenant: Date = new Date(),
): {
  annee: number;
  mois: number;
} {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (m?.[1] && m[2]) {
    const annee = Number.parseInt(m[1], 10);
    const mois = Number.parseInt(m[2], 10);
    if (mois >= 1 && mois <= 12) return { annee, mois };
  }
  return { annee: maintenant.getUTCFullYear(), mois: maintenant.getUTCMonth() + 1 };
}

/** Sérialise { annee, mois } en paramètre `?mois=AAAA-MM`. */
export function formatMoisParam(annee: number, mois: number): string {
  return `${annee}-${pad2(mois)}`;
}

/** { annee, mois } du mois précédent/suivant (gère le débordement d'année). */
export function moisAdjacent(
  annee: number,
  mois: number,
  delta: 1 | -1,
): { annee: number; mois: number } {
  const d = new Date(Date.UTC(annee, mois - 1 + delta, 1));
  return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1 };
}

/** Libellé FR du mois, ex. "Juillet 2026". */
export function libelleMois(annee: number, mois: number): string {
  return `${MOIS_FR[mois - 1] ?? ""} ${annee}`;
}

/** Premier jour du mois (AAAA-MM-JJ), borne inférieure de la requête DB. */
export function premierJourMois(annee: number, mois: number): string {
  return toIso(new Date(Date.UTC(annee, mois - 1, 1)));
}

/** Dernier jour du mois (AAAA-MM-JJ), borne supérieure de la requête DB. */
export function dernierJourMois(annee: number, mois: number): string {
  // Jour 0 du mois suivant = dernier jour du mois courant.
  return toIso(new Date(Date.UTC(annee, mois, 0)));
}

/**
 * Construit la grille complète (avec débordement lun-dim) d'un mois donné : commence au
 * lundi de la semaine contenant le 1er du mois, se termine au dimanche de la semaine
 * contenant le dernier jour du mois. Toujours un multiple de 7 jours (4-6 lignes).
 */
export function joursGrilleMois(
  annee: number,
  mois: number,
  aujourdhuiIso: string = toIso(new Date()),
): JourGrille[] {
  const premier = new Date(Date.UTC(annee, mois - 1, 1));
  const dernier = new Date(Date.UTC(annee, mois, 0));

  const debut = new Date(premier);
  debut.setUTCDate(debut.getUTCDate() - indexLundi(premier));

  const fin = new Date(dernier);
  fin.setUTCDate(fin.getUTCDate() + (6 - indexLundi(dernier)));

  const jours: JourGrille[] = [];
  const curseur = new Date(debut);
  while (curseur.getTime() <= fin.getTime()) {
    const iso = toIso(curseur);
    jours.push({
      iso,
      jour: curseur.getUTCDate(),
      dansLeMois: curseur.getUTCMonth() === mois - 1 && curseur.getUTCFullYear() === annee,
      aujourdhui: iso === aujourdhuiIso,
    });
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }
  return jours;
}

/**
 * Regroupe des échéances par jour (`date_echeance`). Les échéances sans date (ne
 * devrait pas arriver pour des lignes déjà filtrées sur le mois, mais défensif) sont
 * ignorées plutôt que de planter.
 */
export function regrouperParJour<T extends EcheanceGroupable>(
  echeances: readonly T[],
): Record<string, T[]> {
  const parJour: Record<string, T[]> = {};
  for (const e of echeances) {
    if (!e.date_echeance) continue;
    const jour = parJour[e.date_echeance];
    if (jour) jour.push(e);
    else parJour[e.date_echeance] = [e];
  }
  return parJour;
}
