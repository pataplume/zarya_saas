import { getCurrentUser } from "@zarya/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDossierClient } from "../../../../../lib/dossier-client-data";

// Libellés FR (locaux à la page — le module partagé de libellés arrive en C4.1).
const STATUT_LABEL: Record<string, string> = {
  prospect: "Prospect",
  actif: "Actif",
  inactif: "Inactif",
  archive: "Archivé",
};

const STATUT_STYLE: Record<string, string> = {
  prospect: "bg-blue-50 text-blue-700 ring-blue-600/20",
  actif: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  inactif: "bg-slate-100 text-slate-600 ring-slate-500/20",
  archive: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const TYPE_LABEL: Record<string, string> = {
  pme: "PME",
  independant: "Indépendant",
  prive: "Privé",
  association: "Association",
};

const SERVICE_LABEL: Record<string, string> = {
  comptabilite: "Comptabilité",
  fiscalite: "Fiscalité",
  salaires: "Salaires",
  tva: "TVA",
  bouclement: "Bouclement",
  conseil: "Conseil",
};

const RISQUE_META: Record<string, { label: string; style: string; symbole: string }> = {
  faible: {
    label: "Risque faible",
    style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    symbole: "●",
  },
  moyen: {
    label: "Risque moyen",
    style: "bg-amber-50 text-amber-700 ring-amber-600/20",
    symbole: "◐",
  },
  eleve: {
    label: "Risque élevé",
    style: "bg-orange-50 text-orange-700 ring-orange-600/20",
    symbole: "▲",
  },
  critique: {
    label: "Risque critique",
    style: "bg-red-50 text-red-700 ring-red-600/20",
    symbole: "■",
  },
};

const PERIODE_STATUT_LABEL: Record<string, string> = {
  non_demandee: "Non demandée",
  en_attente: "En attente",
  relancee: "Relancée",
  validee: "Validée",
  en_retard: "En retard",
  exportee: "Exportée",
  cloturee: "Clôturée",
  non_applicable: "Non applicable",
};

const MOIS_LABEL = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function DossierClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  // Scope STRICT (cabinet_id, client_id) : null ⇒ 404 indistinct (anti-fuite).
  const dossier = await getDossierClient(cabinet_id, id);
  if (!dossier) notFound();

  const { identite, agregats, services_actifs, nb_factures_a_valider, periode_salaire_courante } =
    dossier;

  const echeancesEnRetard = dossier.echeances.filter((e) => e.en_retard).length;
  const statutStyle =
    STATUT_STYLE[identite.statut] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
  const risque = agregats.risque_niveau ? RISQUE_META[agregats.risque_niveau] : null;
  const meta = [
    identite.ide,
    identite.type ? (TYPE_LABEL[identite.type] ?? identite.type) : null,
    identite.forme_juridique,
    identite.responsable_nom ? `Gestionnaire : ${identite.responsable_nom}` : null,
  ].filter(Boolean);

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* Fil d'Ariane */}
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/app/clients" className="hover:text-blue-700">
          Clients
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{identite.raison_sociale}</span>
      </nav>

      {/* En-tête */}
      <header className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{identite.raison_sociale}</h1>
            {meta.length > 0 && <p className="mt-1 text-sm text-slate-500">{meta.join(" · ")}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statutStyle}`}
            >
              {STATUT_LABEL[identite.statut] ?? identite.statut}
            </span>
            {risque && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${risque.style}`}
              >
                <span aria-hidden="true">{risque.symbole}</span>
                {risque.label}
                {agregats.risque_score != null && (
                  <span className="font-normal opacity-70">· {agregats.risque_score}</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Chips services actifs */}
        {services_actifs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {services_actifs.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {SERVICE_LABEL[s.type] ?? s.type}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Vue d'ensemble « à traiter » */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          À traiter
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetriqueCard
            href="/app/documents"
            titre="Documents manquants"
            valeur={agregats.nb_documents_manquants}
            sousTitre={
              agregats.nb_documents_manquants > 0 ? "À réclamer / classer" : "Rien à réclamer"
            }
            alerte={agregats.nb_documents_manquants > 0}
          />
          <MetriqueCard
            href="/app/calendrier/echeances"
            titre="Échéances"
            valeur={dossier.echeances.length}
            sousTitre={
              echeancesEnRetard > 0
                ? `Dont ${echeancesEnRetard} en retard`
                : agregats.prochaine_echeance
                  ? `Prochaine : ${formatDate(agregats.prochaine_echeance)}`
                  : "Aucune à venir"
            }
            alerte={echeancesEnRetard > 0}
          />
          <MetriqueCard
            href="/app/factures/validation"
            titre="Factures à valider"
            valeur={nb_factures_a_valider}
            sousTitre={nb_factures_a_valider > 0 ? "En attente de validation" : "Rien à valider"}
            alerte={nb_factures_a_valider > 0}
          />
          <MetriqueCard
            href="/app/salaire"
            titre="Période salaire"
            valeur={
              periode_salaire_courante
                ? `${MOIS_LABEL[periode_salaire_courante.mois - 1] ?? periode_salaire_courante.mois} ${periode_salaire_courante.annee}`
                : "—"
            }
            sousTitre={
              periode_salaire_courante
                ? (PERIODE_STATUT_LABEL[periode_salaire_courante.statut] ??
                  periode_salaire_courante.statut)
                : "Aucune période"
            }
            alerte={false}
          />
        </div>

        {/* Score de risque (rappel) */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Score de risque
          </p>
          {agregats.risque_niveau ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {agregats.risque_score ?? "—"}
              </span>
              <span className="text-sm text-slate-500">
                {RISQUE_META[agregats.risque_niveau]?.label ?? agregats.risque_niveau}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Non évalué</p>
          )}
        </div>
      </section>

      {/* Sections détaillées (Documents / Factures / Salaires / Coordonnées) :
          livrées en C1.3–C1.5. Aucune ancre morte ici. */}
    </div>
  );
}

// ─── Carte métrique cliquable ───────────────────────────────────────────────────

function MetriqueCard({
  href,
  titre,
  valeur,
  sousTitre,
  alerte,
}: {
  href: string;
  titre: string;
  valeur: number | string;
  sousTitre: string;
  alerte: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{titre}</p>
      <p className={`mt-1 text-2xl font-bold ${alerte ? "text-amber-700" : "text-slate-900"}`}>
        {valeur}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{sousTitre}</p>
    </Link>
  );
}
