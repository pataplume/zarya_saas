import { getCurrentUser } from "@zarya/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  type DossierContact,
  type DossierDocument,
  type DossierFactures,
  type DossierPeriodeSalaire,
  getDossierClient,
  getDossierCoordonnees,
  getDossierDocuments,
  getDossierFactures,
  getDossierSalaires,
} from "../../../../../lib/dossier-client-data";

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

// Statut de classement d'un document validé (doc.statut_classement).
const DOC_STATUT_CLASSEMENT: Record<string, { label: string; style: string }> = {
  auto: { label: "Classé auto.", style: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  valide_humain: { label: "Validé", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  corrige_humain: { label: "Corrigé", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  manuel: { label: "Manuel", style: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

const DOC_STATUT_DEFAUT = {
  label: "Classé",
  style: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const DOC_CATEGORIE_LABEL: Record<string, string> = {
  bancaire: "Bancaire",
  fiscal: "Fiscal",
  salaire: "Salaire",
  commercial: "Commercial",
  administratif: "Administratif",
  autre: "Autre",
};

// Statut d'une facture validée (facture.statut_facture).
const FACTURE_STATUT: Record<string, { label: string; style: string }> = {
  en_attente_validation: {
    label: "À valider",
    style: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  validee: { label: "Validée", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  exportee: { label: "Exportée", style: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  payee: { label: "Payée", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  annulee: { label: "Annulée", style: "bg-slate-100 text-slate-500 ring-slate-400/20" },
};

const FACTURE_STATUT_DEFAUT = {
  label: "—",
  style: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

// Statut d'une échéance ouverte.
const ECHEANCE_STATUT_LABEL: Record<string, string> = {
  a_venir: "À venir",
  imminente: "Imminente",
  en_retard: "En retard",
  reportee: "Reportée",
  traitee: "Traitée",
  annulee: "Annulée",
};

const ECHEANCE_TYPE_LABEL: Record<string, string> = {
  fiscale: "Fiscale",
  tva: "TVA",
  bouclement: "Bouclement",
  salaire: "Salaire",
  relance_documents: "Relance documents",
  personnalisee: "Personnalisée",
};

const LOGICIEL_COMPTABLE_LABEL: Record<string, string> = {
  bexio: "Bexio",
  abacus: "Abacus",
  cresus: "Crésus",
  winbiz: "WinBIZ",
  banana: "Banana",
  excel: "Excel",
  officemaker: "OfficeMaker",
  autre: "Autre",
};

const LOGICIEL_PAIE_LABEL: Record<string, string> = {
  bexio_payroll: "Bexio Payroll",
  cresus_salaires: "Crésus Salaires",
  winbiz_salaires: "WinBIZ Salaires",
  abacus_lohn: "Abacus Lohn",
  officemaker_staff: "OfficeMaker Staff",
  swissdec: "Swissdec",
  autre: "Autre",
  aucun: "Aucun",
};

const MODE_TRANSMISSION_LABEL: Record<string, string> = {
  email: "Email",
  nas_partage: "Partage NAS",
  connecteur_logiciel: "Connecteur logiciel",
  physique: "Remise physique",
};

function moisLabel(mois: number): string {
  return MOIS_LABEL[mois - 1] ?? String(mois);
}

function formatMontant(montant: string | null, devise: string): string {
  if (montant == null) return "—";
  const n = Number(montant);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise}`;
}

// Sections ancrées du dossier (ordre d'affichage + barre de navigation).
const ANCRES: { id: string; label: string }[] = [
  { id: "vue-ensemble", label: "Vue d'ensemble" },
  { id: "documents", label: "Documents" },
  { id: "echeances", label: "Échéances" },
  { id: "factures", label: "Factures" },
  { id: "salaires", label: "Salaires" },
  { id: "coordonnees", label: "Coordonnées" },
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
  // C'est la porte de sécurité : les sections détaillées ne sont chargées QUE si le
  // client appartient bien au cabinet courant. Chaque fetcher refiltre néanmoins
  // (cabinet_id, client_id) — défense en profondeur sur le chemin service-role.
  const dossier = await getDossierClient(cabinet_id, id);
  if (!dossier) notFound();

  const [documents, factures, salaires, coordonnees] = await Promise.all([
    getDossierDocuments(cabinet_id, id),
    getDossierFactures(cabinet_id, id),
    getDossierSalaires(cabinet_id, id),
    getDossierCoordonnees(cabinet_id, id),
  ]);

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

      {/* Barre de navigation par ancres — chaque cible existe (pas d'ancre morte). */}
      <nav
        aria-label="Sections du dossier"
        className="sticky top-0 z-10 mb-6 flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white/90 p-1.5 shadow-sm backdrop-blur"
      >
        {ANCRES.map((a) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {a.label}
          </a>
        ))}
      </nav>

      {/* Vue d'ensemble « à traiter » */}
      <section id="vue-ensemble" className="scroll-mt-20">
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

      {/* C1.3 — Documents (groupés par période puis type) */}
      <DocumentsSection documents={documents} />

      {/* C1.4 — Échéances */}
      <EcheancesSection echeances={dossier.echeances} />

      {/* C1.4 — Factures */}
      <FacturesSection factures={factures} />

      {/* C1.5 — Salaires */}
      <SalairesSection periodes={salaires} clientId={identite.id} />

      {/* C1.5 — Coordonnées & paramètres */}
      <CoordonneesSection coordonnees={coordonnees} />
    </div>
  );
}

// ─── Cartouche de section (titre ancré + lien optionnel) ─────────────────────────

function SectionShell({
  id,
  titre,
  lien,
  children,
}: {
  id: string;
  titre: string;
  lien?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{titre}</h2>
        {lien && (
          <Link href={lien.href} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            {lien.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function EtatVide({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center">
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500";

// ─── C1.3 — Section Documents ────────────────────────────────────────────────────

function DocumentsSection({ documents }: { documents: DossierDocument[] }) {
  // Groupement par période (libellé) puis par type, dans l'ordre d'arrivée.
  const groupes = new Map<string, DossierDocument[]>();
  for (const d of documents) {
    const cle = d.periode ?? "Sans période";
    const liste = groupes.get(cle) ?? [];
    liste.push(d);
    groupes.set(cle, liste);
  }

  return (
    <SectionShell id="documents" titre="Documents">
      {documents.length === 0 ? (
        <EtatVide>Aucun document classé pour ce client pour l'instant.</EtatVide>
      ) : (
        <div className="space-y-6">
          {[...groupes.entries()].map(([periode, docs]) => (
            <div key={periode}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {periode}
              </h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={TH}>Document</th>
                      <th className={`hidden sm:table-cell ${TH}`}>Catégorie</th>
                      <th className={`hidden md:table-cell ${TH}`}>Reçu le</th>
                      <th className={TH}>Statut</th>
                      <th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docs.map((d) => {
                      const statut =
                        DOC_STATUT_CLASSEMENT[d.statut_classement] ?? DOC_STATUT_DEFAUT;
                      return (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="max-w-xs px-4 py-3">
                            <p
                              className="truncate text-sm font-medium text-slate-800"
                              title={d.libelle}
                            >
                              {d.libelle}
                            </p>
                            <p className="truncate text-xs text-slate-400">{d.type}</p>
                          </td>
                          <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                            {DOC_CATEGORIE_LABEL[d.categorie] ?? d.categorie}
                          </td>
                          <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                            {formatDate(d.date_reception)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statut.style}`}
                            >
                              {statut.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={`/api/documents/${d.fichier_physique_id}/apercu`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Ouvrir
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── C1.4 — Section Échéances ────────────────────────────────────────────────────

function EcheancesSection({
  echeances,
}: {
  echeances: {
    id: string;
    type: string;
    libelle: string;
    date_echeance: string;
    statut: string;
    en_retard: boolean;
  }[];
}) {
  return (
    <SectionShell
      id="echeances"
      titre="Échéances"
      lien={{ href: "/app/calendrier/echeances", label: "Voir le calendrier" }}
    >
      {echeances.length === 0 ? (
        <EtatVide>Aucune échéance ouverte pour ce client.</EtatVide>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Échéance</th>
                <th className={`hidden sm:table-cell ${TH}`}>Type</th>
                <th className={`hidden md:table-cell ${TH}`}>Date</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {echeances.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="max-w-xs px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-800" title={e.libelle}>
                      {e.libelle}
                    </p>
                    <p className="truncate text-xs text-slate-400 sm:hidden">
                      {ECHEANCE_TYPE_LABEL[e.type] ?? e.type} · {formatDate(e.date_echeance)}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                    {ECHEANCE_TYPE_LABEL[e.type] ?? e.type}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                    {formatDate(e.date_echeance)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        e.en_retard
                          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                          : "bg-blue-50 text-blue-700 ring-blue-600/20"
                      }`}
                    >
                      {ECHEANCE_STATUT_LABEL[e.statut] ?? e.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}

// ─── C1.4 — Section Factures ─────────────────────────────────────────────────────

function FacturesSection({ factures }: { factures: DossierFactures }) {
  const { validees, a_valider } = factures;
  const vide = validees.length === 0 && a_valider.length === 0;

  return (
    <SectionShell
      id="factures"
      titre="Factures"
      lien={{ href: "/app/factures/validation", label: "File de validation" }}
    >
      {vide ? (
        <EtatVide>Aucune facture enregistrée pour ce client.</EtatVide>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Fournisseur</th>
                <th className={`hidden sm:table-cell ${TH}`}>N°</th>
                <th className={`hidden md:table-cell ${TH}`}>Date</th>
                <th className={`${TH} text-right`}>Montant</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {a_valider.map((p) => (
                <tr key={p.id} className="bg-amber-50/40 hover:bg-amber-50">
                  <td className="max-w-xs px-4 py-3 text-sm font-medium text-slate-800">
                    {p.fournisseur_nom ?? "Fournisseur à confirmer"}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                    {p.numero_facture ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                    {formatDate(p.date_emission)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {formatMontant(p.total_ttc, p.devise)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      À valider
                    </span>
                  </td>
                </tr>
              ))}
              {validees.map((f) => {
                const statut = FACTURE_STATUT[f.statut] ?? FACTURE_STATUT_DEFAUT;
                return (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="max-w-xs px-4 py-3 text-sm font-medium text-slate-800">
                      {f.fournisseur_nom}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                      {f.numero_facture}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                      {formatDate(f.date_emission)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {formatMontant(f.total_ttc, f.devise)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statut.style}`}
                      >
                        {statut.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}

// ─── C1.5 — Section Salaires ─────────────────────────────────────────────────────

function SalairesSection({
  periodes,
  clientId,
}: {
  periodes: DossierPeriodeSalaire[];
  clientId: string;
}) {
  return (
    <SectionShell
      id="salaires"
      titre="Salaires"
      lien={{ href: `/app/salaire/referentiel/${clientId}`, label: "Référentiel employés" }}
    >
      {periodes.length === 0 ? (
        <EtatVide>Aucune période salaire pour ce client.</EtatVide>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Période</th>
                <th className={`hidden sm:table-cell ${TH}`}>Employés</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periodes.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {moisLabel(p.mois)} {p.annee}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                    {p.nb_employes}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                      {PERIODE_STATUT_LABEL[p.statut] ?? p.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}

// ─── C1.5 — Section Coordonnées & paramètres ─────────────────────────────────────

function CoordonneesSection({
  coordonnees,
}: {
  coordonnees: {
    contacts: DossierContact[];
    services_actifs: { id: string; type: string; frequence: string | null }[];
    param_comptable: {
      logiciel_comptable: string | null;
      logiciel_paie_cible: string | null;
      mode_transmission: string | null;
    } | null;
  };
}) {
  const { contacts, services_actifs, param_comptable } = coordonnees;
  const params: { label: string; valeur: string }[] = [];
  if (param_comptable?.logiciel_comptable) {
    params.push({
      label: "Logiciel comptable",
      valeur:
        LOGICIEL_COMPTABLE_LABEL[param_comptable.logiciel_comptable] ??
        param_comptable.logiciel_comptable,
    });
  }
  if (param_comptable?.logiciel_paie_cible) {
    params.push({
      label: "Logiciel de paie",
      valeur:
        LOGICIEL_PAIE_LABEL[param_comptable.logiciel_paie_cible] ??
        param_comptable.logiciel_paie_cible,
    });
  }
  if (param_comptable?.mode_transmission) {
    params.push({
      label: "Transmission des pièces",
      valeur:
        MODE_TRANSMISSION_LABEL[param_comptable.mode_transmission] ??
        param_comptable.mode_transmission,
    });
  }

  return (
    <SectionShell id="coordonnees" titre="Coordonnées & paramètres">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Contacts */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Contacts
          </h3>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun contact enregistré.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {[c.prenom, c.nom].filter(Boolean).join(" ")}
                    </span>
                    {c.est_principal && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                        Principal
                      </span>
                    )}
                    {c.a_acces_portail && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        Accès portail
                      </span>
                    )}
                  </div>
                  {c.fonction && <p className="text-xs text-slate-500">{c.fonction}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[c.email, c.telephone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Services + paramètres comptables */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Services actifs
            </h3>
            {services_actifs.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun service actif.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
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
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Paramètres comptables
            </h3>
            {params.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun paramètre renseigné.</p>
            ) : (
              <dl className="space-y-2">
                {params.map((p) => (
                  <div key={p.label} className="flex justify-between gap-3 text-sm">
                    <dt className="text-slate-500">{p.label}</dt>
                    <dd className="font-medium text-slate-800">{p.valeur}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </SectionShell>
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
