import { getCurrentUser } from "@zarya/auth";
import { Briefcase, CalendarClock, FileText, type LucideIcon, Receipt } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { helpAttrs } from "@/lib/help-attrs";
import {
  badgeStatutClassement,
  badgeStatutFacture,
  libelleCategorieDocument,
  libelleLogicielComptable,
  libelleLogicielPaie,
  libelleModeTransmission,
  libelleService,
  libelleStatutClient,
  libelleStatutEcheance,
  libelleStatutPeriode,
  libelleTypeClient,
  libelleTypeEcheance,
  styleFamille,
} from "@/lib/libelles";
import { getBancaireDossier } from "../../../../../lib/bancaire-dossier-data";
import { getCompletudeClient } from "../../../../../lib/completude-client-data";
import {
  type DossierClientService,
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
import { getClientEditData, getServicesRegime } from "../../../../../lib/dossier-client-edit-data";
import {
  getDocumentsAttendus,
  getPauseActive,
  getRelancesAVenir,
  getRelancesTimeline,
} from "../../../../../lib/relances-dossier-data";
import { BancaireSection } from "./bancaire-section";
import { CompletudeSection } from "./completude-section";
import { DossierEditClient } from "./dossier-edit-client";
import { RelancesSection } from "./relances-section";
import { ServicesRegimeSection } from "./services-regime-section";

// RBAC Lot 1 (ADR 0025) : lecteur = lecture seule. Les rôles opérationnels éditent.
const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

// C4.1 — libellés FR centralisés dans `@/lib/libelles`. Le badge de risque garde un
// libellé préfixé « Risque … » + symbole (jamais couleur seule), spécifique à cet écran.
const STATUT_CLIENT_STYLE: Record<string, string> = {
  prospect: "bg-blue-50 text-blue-700 ring-blue-600/20",
  actif: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  inactif: "bg-slate-100 text-slate-600 ring-slate-500/20",
  archive: "bg-slate-100 text-slate-500 ring-slate-400/20",
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
  { id: "completude", label: "Complétude" },
  { id: "identite", label: "Dossier" },
  { id: "contacts", label: "Contacts" },
  { id: "adresses", label: "Adresses" },
  { id: "services", label: "Services" },
  { id: "documents", label: "Documents" },
  { id: "echeances", label: "Échéances" },
  { id: "relances", label: "Relances" },
  { id: "bancaire", label: "Bancaire" },
  { id: "factures", label: "Factures" },
  { id: "salaires", label: "Salaires" },
  { id: "coordonnees", label: "Paramètres" },
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

  const role = user?.app_metadata.role as string | undefined;
  const peutEcrire = !!role && ROLES_ECRITURE.has(role);

  // Scope STRICT (cabinet_id, client_id) : null ⇒ 404 indistinct (anti-fuite).
  // C'est la porte de sécurité : les sections détaillées ne sont chargées QUE si le
  // client appartient bien au cabinet courant. Chaque fetcher refiltre néanmoins
  // (cabinet_id, client_id) — défense en profondeur sur le chemin service-role.
  const dossier = await getDossierClient(cabinet_id, id);
  if (!dossier) notFound();

  // Streaming (UX Lot 4) : SEULE la requête-porte ci-dessus bloque le 1er rendu.
  // L'en-tête + barre d'ancres + « Vue d'ensemble » + Échéances (déjà portées par
  // `dossier`) partent immédiatement ; chaque autre section est un composant async
  // wrappé dans <Suspense> qui exécute SA requête scopée (cabinet_id, client_id)
  // — les requêtes existantes sont déplacées telles quelles, pas réécrites.
  // Les sections éditables (dossier, services, bancaire, relances) sont découplées
  // aussi : leurs fetchers sont indépendants et refiltrent (cabinet_id, client_id)
  // (défense en profondeur), et les server actions restent inchangées — le découplage
  // ne change ni les props ni la sécurité. Le 404 anti-fuite reste AVANT tout rendu.

  const { identite, agregats, services_actifs, nb_factures_a_valider, periode_salaire_courante } =
    dossier;

  const echeancesEnRetard = dossier.echeances.filter((e) => e.en_retard).length;
  const statutStyle =
    STATUT_CLIENT_STYLE[identite.statut] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
  const risque = agregats.risque_niveau ? RISQUE_META[agregats.risque_niveau] : null;
  const meta = [
    identite.ide,
    identite.type ? libelleTypeClient(identite.type) : null,
    identite.forme_juridique,
    identite.responsable_nom ? `Gestionnaire : ${identite.responsable_nom}` : null,
  ].filter(Boolean);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Scroll fluide sur les ancres : le conteneur de scroll est le document (le layout
          (app)/app ne crée pas de conteneur overflow) → `scroll-behavior: smooth` sur <html>,
          limité au montage de cette page. Les `scroll-mt-20` des sections restent inchangés.
          `prefers-reduced-motion` est respecté (a11y). */}
      <style>{`html{scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`}</style>

      {/* Fil d'Ariane + retour vers la liste des clients */}
      <nav className="mb-4 text-[13px] text-muted-foreground">
        <Link
          href="/app/clients"
          className="font-medium text-primary hover:underline"
          {...helpAttrs(
            "Retour à la liste des clients",
            "Revient à la liste de tous vos clients, sans enregistrer de modification en cours.",
          )}
        >
          ← Clients
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{identite.raison_sociale}</span>
      </nav>

      {/* En-tête */}
      <header className="mb-6 rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {identite.raison_sociale}
            </h1>
            {meta.length > 0 && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">{meta.join(" · ")}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statutStyle}`}
            >
              {libelleStatutClient(identite.statut)}
            </span>
            {risque && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${risque.style}`}
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
                className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
              >
                {libelleService(s.type)}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Barre de navigation par ancres — chaque cible existe (pas d'ancre morte). */}
      <nav
        aria-label="Sections du dossier"
        className="sticky top-0 z-10 mb-6 flex flex-wrap gap-0.5 border-b border-border bg-background/80 py-1.5 backdrop-blur"
      >
        {ANCRES.map((a) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            {...helpAttrs(
              `Aller à « ${a.label} »`,
              "Saute directement à cette section du dossier, sans recharger la page.",
            )}
          >
            {a.label}
          </a>
        ))}
      </nav>

      {/* Vue d'ensemble « à traiter » */}
      <section id="vue-ensemble" className="scroll-mt-20">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          À traiter
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetriqueCard
            href="#documents"
            titre="Documents manquants"
            valeur={agregats.nb_documents_manquants}
            sousTitre={
              agregats.nb_documents_manquants > 0 ? "À réclamer / classer" : "Rien à réclamer"
            }
            alerte={agregats.nb_documents_manquants > 0}
          />
          <MetriqueCard
            href={`/app/calendrier/echeances?client=${id}`}
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
            href={`/app/factures/validation?client=${id}`}
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
                ? libelleStatutPeriode(periode_salaire_courante.statut)
                : "Aucune période"
            }
            alerte={false}
          />
        </div>

        {/* Score de risque (rappel) */}
        <div className="mt-4 rounded-lg border border-border bg-card p-4 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Score de risque
          </p>
          {agregats.risque_niveau ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {agregats.risque_score ?? "—"}
              </span>
              <span className="text-sm text-muted-foreground">
                {RISQUE_META[agregats.risque_niveau]?.label ?? agregats.risque_niveau}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Non évalué</p>
          )}
        </div>
      </section>

      {/* Lot 3 (ADR 0025) — Assistant de complétude (score + checklist non bloquante) */}
      <Suspense fallback={<SectionSkeleton id="completude" titre="Complétude du dossier" />}>
        <CompletudeAsync cabinet_id={cabinet_id} clientId={id} />
      </Suspense>

      {/* Lot 1 (ADR 0025) — Dossier éditable : identité + contacts + adresses */}
      <Suspense fallback={<SectionSkeleton id="identite" titre="Identité" />}>
        <DossierEditAsync cabinet_id={cabinet_id} clientId={id} peutEcrire={peutEcrire} />
      </Suspense>

      {/* UX Lot 4 — Services & régime (moteur d'échéances, back Lot 2 ADR 0025) */}
      <Suspense fallback={<SectionSkeleton id="services" titre="Services & régime" />}>
        <ServicesRegimeAsync cabinet_id={cabinet_id} clientId={id} peutEcrire={peutEcrire} />
      </Suspense>

      {/* C1.3 — Documents (groupés par période puis type) */}
      <Suspense fallback={<SectionSkeleton id="documents" titre="Documents" />}>
        <DocumentsAsync cabinet_id={cabinet_id} clientId={id} />
      </Suspense>

      {/* C1.4 — Échéances — données déjà portées par la requête-porte : rendu immédiat. */}
      <EcheancesSection echeances={dossier.echeances} clientId={id} />

      {/* Lot 4 (ADR 0025) — Documents attendus & relances (brouillon Mode A + journal + à venir) */}
      <Suspense fallback={<SectionSkeleton id="relances" titre="Documents attendus & relances" />}>
        <RelancesAsync
          cabinet_id={cabinet_id}
          clientId={identite.id}
          services={services_actifs}
          peutEcrire={peutEcrire}
        />
      </Suspense>

      {/* Lot 5 (ADR 0025 §6) — Bancaire & facturation (IBAN/credentials chiffrés au Vault) */}
      <Suspense fallback={<SectionSkeleton id="bancaire" titre="Bancaire & facturation" />}>
        <BancaireAsync cabinet_id={cabinet_id} clientId={identite.id} peutEcrire={peutEcrire} />
      </Suspense>

      {/* C1.4 — Factures */}
      <Suspense fallback={<SectionSkeleton id="factures" titre="Factures" />}>
        <FacturesAsync cabinet_id={cabinet_id} clientId={id} />
      </Suspense>

      {/* C1.5 — Salaires */}
      <Suspense fallback={<SectionSkeleton id="salaires" titre="Salaires" />}>
        <SalairesAsync cabinet_id={cabinet_id} clientId={identite.id} />
      </Suspense>

      {/* C1.5 — Coordonnées & paramètres */}
      <Suspense fallback={<SectionSkeleton id="coordonnees" titre="Paramètres comptables" />}>
        <CoordonneesAsync cabinet_id={cabinet_id} clientId={id} />
      </Suspense>
    </div>
  );
}

// ─── Streaming — squelette de section (même id/scroll-mt que la section réelle,
// pour que les ancres de la barre sticky restent fonctionnelles pendant le chargement) ──

function SectionSkeleton({ id, titre }: { id: string; titre: string }) {
  return (
    <section id={id} className="mt-10 scroll-mt-20" aria-busy="true">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {titre}
      </h2>
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <Skeleton className="h-4 w-2/3 max-w-full bg-slate-100" />
        <Skeleton className="mt-3 h-4 w-1/2 max-w-full bg-slate-100" />
        <Skeleton className="mt-3 h-24 w-full bg-slate-100" />
      </div>
    </section>
  );
}

// ─── Streaming — composants async serveur : chaque section exécute SA requête
// scopée (cabinet_id, client_id) sous <Suspense>. Les fetchers refiltrent tous
// (cabinet_id, client_id) — défense en profondeur derrière la porte 404 du dossier. ──

async function CompletudeAsync({ cabinet_id, clientId }: { cabinet_id: string; clientId: string }) {
  const completude = await getCompletudeClient(cabinet_id, clientId);
  if (!completude) return null;
  return <CompletudeSection completude={completude} />;
}

async function DossierEditAsync({
  cabinet_id,
  clientId,
  peutEcrire,
}: {
  cabinet_id: string;
  clientId: string;
  peutEcrire: boolean;
}) {
  const editData = await getClientEditData(cabinet_id, clientId);
  if (!editData) return null;
  return (
    <div className="mt-10">
      <DossierEditClient data={editData} peutEcrire={peutEcrire} />
    </div>
  );
}

async function ServicesRegimeAsync({
  cabinet_id,
  clientId,
  peutEcrire,
}: {
  cabinet_id: string;
  clientId: string;
  peutEcrire: boolean;
}) {
  const data = await getServicesRegime(cabinet_id, clientId);
  return <ServicesRegimeSection clientId={clientId} data={data} peutEcrire={peutEcrire} />;
}

async function DocumentsAsync({ cabinet_id, clientId }: { cabinet_id: string; clientId: string }) {
  const documents = await getDossierDocuments(cabinet_id, clientId);
  return <DocumentsSection documents={documents} />;
}

async function RelancesAsync({
  cabinet_id,
  clientId,
  services,
  peutEcrire,
}: {
  cabinet_id: string;
  clientId: string;
  services: DossierClientService[];
  peutEcrire: boolean;
}) {
  const [docsAttendus, relancesTimeline, relancesAVenir, pauseActive] = await Promise.all([
    getDocumentsAttendus(cabinet_id, clientId),
    getRelancesTimeline(cabinet_id, clientId),
    getRelancesAVenir(cabinet_id, clientId),
    getPauseActive(cabinet_id, clientId),
  ]);
  return (
    <RelancesSection
      data={{
        clientId,
        documents: docsAttendus,
        timeline: relancesTimeline,
        aVenir: relancesAVenir,
        pause: pauseActive,
        services: services.map((s) => ({ id: s.id, type: s.type })),
      }}
      peutEcrire={peutEcrire}
    />
  );
}

async function BancaireAsync({
  cabinet_id,
  clientId,
  peutEcrire,
}: {
  cabinet_id: string;
  clientId: string;
  peutEcrire: boolean;
}) {
  const bancaire = await getBancaireDossier(cabinet_id, clientId);
  if (!bancaire) return null;
  return (
    <div className="scroll-mt-20">
      <BancaireSection clientId={clientId} data={bancaire} peutEcrire={peutEcrire} />
    </div>
  );
}

async function FacturesAsync({ cabinet_id, clientId }: { cabinet_id: string; clientId: string }) {
  const factures = await getDossierFactures(cabinet_id, clientId);
  return <FacturesSection factures={factures} clientId={clientId} />;
}

async function SalairesAsync({ cabinet_id, clientId }: { cabinet_id: string; clientId: string }) {
  const salaires = await getDossierSalaires(cabinet_id, clientId);
  return <SalairesSection periodes={salaires} clientId={clientId} />;
}

async function CoordonneesAsync({
  cabinet_id,
  clientId,
}: {
  cabinet_id: string;
  clientId: string;
}) {
  const coordonnees = await getDossierCoordonnees(cabinet_id, clientId);
  return <CoordonneesSection coordonnees={coordonnees} />;
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {titre}
        </h2>
        {lien && (
          <Link
            href={lien.href}
            className="text-[13px] font-medium text-primary hover:underline"
            {...helpAttrs(
              lien.label,
              "Ouvre la vue complète de ce module pour ce cabinet, au-delà de l'aperçu du dossier.",
            )}
          >
            {lien.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// État vide de section : icône + titre + piste d'action (composant partagé EmptyState).
function EtatVide({ icon, titre, hint }: { icon: LucideIcon; titre: string; hint?: string }) {
  return <EmptyState icon={icon} title={titre} {...(hint ? { hint } : {})} className="py-10" />;
}

const TH =
  "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

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
        <EtatVide
          icon={FileText}
          titre="Aucun document classé"
          hint="Les documents déposés puis classés pour ce client apparaîtront ici."
        />
      ) : (
        <div className="space-y-6">
          {[...groupes.entries()].map(([periode, docs]) => (
            <div key={periode}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {periode}
              </h3>
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-slate-50/60">
                    <tr>
                      <th className={TH}>Document</th>
                      <th className={`hidden sm:table-cell ${TH}`}>Catégorie</th>
                      <th className={`hidden md:table-cell ${TH}`}>Reçu le</th>
                      <th className={TH}>Statut</th>
                      <th className={`${TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {docs.map((d) => {
                      const statut = badgeStatutClassement(d.statut_classement);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="max-w-xs px-4 py-3">
                            {/* C2.2 — libellé cliquable → fiche document */}
                            <Link
                              href={`/app/documents/${d.id}`}
                              className="block truncate text-sm font-medium text-slate-800 hover:text-blue-700"
                              title={d.libelle}
                              {...helpAttrs(
                                "Ouvrir la fiche du document",
                                "Affiche le détail du document classé : données extraites, statut et pièce d'origine.",
                              )}
                            >
                              {d.libelle}
                            </Link>
                            {/* C2.1 — résumé extrait (fournisseur + montant pour une facture) */}
                            <p className="truncate text-xs text-slate-400">{d.resume ?? d.type}</p>
                          </td>
                          <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                            {libelleCategorieDocument(d.categorie)}
                          </td>
                          <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                            {formatDate(d.date_reception)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${styleFamille(statut.famille)}`}
                            >
                              {statut.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center justify-end gap-2">
                              <Link
                                href={`/app/documents/${d.id}`}
                                className="inline-flex items-center rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-secondary"
                                {...helpAttrs(
                                  "Fiche du document",
                                  "Ouvre la fiche détaillée : données extraites, classement et rattachement au client.",
                                )}
                              >
                                Fiche
                              </Link>
                              <a
                                href={`/api/documents/${d.fichier_physique_id}/apercu`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-secondary"
                                {...helpAttrs(
                                  "Ouvrir la pièce",
                                  "Affiche le fichier d'origine (PDF ou image) dans un nouvel onglet.",
                                )}
                              >
                                Ouvrir
                              </a>
                            </span>
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
  clientId,
}: {
  echeances: {
    id: string;
    type: string;
    libelle: string;
    date_echeance: string;
    statut: string;
    en_retard: boolean;
  }[];
  clientId: string;
}) {
  return (
    <SectionShell
      id="echeances"
      titre="Échéances"
      lien={{ href: `/app/calendrier/echeances?client=${clientId}`, label: "Voir le calendrier" }}
    >
      {echeances.length === 0 ? (
        <EtatVide
          icon={CalendarClock}
          titre="Aucune échéance ouverte"
          hint="Activez des services dans « Services & régime » pour générer les échéances."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-slate-50/60">
              <tr>
                <th className={TH}>Échéance</th>
                <th className={`hidden sm:table-cell ${TH}`}>Type</th>
                <th className={`hidden md:table-cell ${TH}`}>Date</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {echeances.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="max-w-xs px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-800" title={e.libelle}>
                      {e.libelle}
                    </p>
                    <p className="truncate text-xs text-slate-400 sm:hidden">
                      {libelleTypeEcheance(e.type)} · {formatDate(e.date_echeance)}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                    {libelleTypeEcheance(e.type)}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                    {formatDate(e.date_echeance)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        e.en_retard
                          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                          : "bg-blue-50 text-blue-700 ring-blue-600/20"
                      }`}
                    >
                      {libelleStatutEcheance(e.statut)}
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

function FacturesSection({ factures, clientId }: { factures: DossierFactures; clientId: string }) {
  const { validees, a_valider } = factures;
  const vide = validees.length === 0 && a_valider.length === 0;

  return (
    <SectionShell
      id="factures"
      titre="Factures"
      lien={{ href: `/app/factures/validation?client=${clientId}`, label: "File de validation" }}
    >
      {vide ? (
        <EtatVide
          icon={Receipt}
          titre="Aucune facture enregistrée"
          hint="Les factures extraites des documents de ce client apparaîtront ici."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-slate-50/60">
              <tr>
                <th className={TH}>Fournisseur</th>
                <th className={`hidden sm:table-cell ${TH}`}>N°</th>
                <th className={`hidden md:table-cell ${TH}`}>Date</th>
                <th className={`${TH} text-right`}>Montant</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
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
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      À valider
                    </span>
                  </td>
                </tr>
              ))}
              {validees.map((f) => {
                const statut = badgeStatutFacture(f.statut);
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
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${styleFamille(statut.famille)}`}
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
        <EtatVide
          icon={Briefcase}
          titre="Aucune période salaire"
          hint="Activez le service Salaires pour suivre les périodes mensuelles."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-slate-50/60">
              <tr>
                <th className={TH}>Période</th>
                <th className={`hidden sm:table-cell ${TH}`}>Employés</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {periodes.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {moisLabel(p.mois)} {p.annee}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                    {p.nb_employes}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                      {libelleStatutPeriode(p.statut)}
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
  // Unification UI (ADR 0025) : contacts → section éditable (Lot 1) ; services → chips
  // d'en-tête. Cette section ne porte plus que les paramètres comptables (non dupliqués).
  const { param_comptable } = coordonnees;
  const params: { label: string; valeur: string }[] = [];
  if (param_comptable?.logiciel_comptable) {
    params.push({
      label: "Logiciel comptable",
      valeur: libelleLogicielComptable(param_comptable.logiciel_comptable),
    });
  }
  if (param_comptable?.logiciel_paie_cible) {
    params.push({
      label: "Logiciel de paie",
      valeur: libelleLogicielPaie(param_comptable.logiciel_paie_cible),
    });
  }
  if (param_comptable?.mode_transmission) {
    params.push({
      label: "Transmission des pièces",
      valeur: libelleModeTransmission(param_comptable.mode_transmission),
    });
  }

  return (
    <SectionShell id="coordonnees" titre="Paramètres comptables">
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        {params.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun paramètre comptable renseigné.</p>
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
      className="block rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-slate-300"
      {...helpAttrs(
        titre,
        "Ouvre la liste correspondante pour traiter ces éléments. Le chiffre indique ce qui reste à faire.",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titre}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${alerte ? "text-amber-700" : "text-foreground"}`}
      >
        {valeur}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sousTitre}</p>
    </Link>
  );
}
