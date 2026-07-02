import { getCurrentUser } from "@zarya/auth";
import { cabinet, cabinetMembre, client, db, evenement, sql, uploadBrut } from "@zarya/db";
import { and, count, desc, eq, gte } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  CalendarPlus,
  CheckCircle2,
  FileCheck2,
  FileSignature,
  FileText,
  type LucideIcon,
  MailCheck,
  Plug,
  ShieldCheck,
  StickyNote,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { type DigestCabinet, getDigestCabinet } from "@/lib/dashboard-data";
import { badgeRisque } from "@/lib/libelles";
import { cn } from "@/lib/utils";
import { DashboardAskBar } from "./dashboard-ask-bar";
import { HelpHint, HelpModeProvider, HelpModeToggle } from "./help-mode";

// ─── Types ────────────────────────────────────────────────────────────────────

type LigneDigest = {
  id: string;
  icon: LucideIcon;
  valeur: number;
  label: string;
  detail: string | null;
  href: string;
};

// ─── File de travail ─────────────────────────────────────────────────────────

function formatCompte(n: number): string {
  if (n >= 1000) return "999+";
  return String(n);
}

function construireLignesDigest(d: DigestCabinet): LigneDigest[] {
  const echeancesTotal = d.echeances_en_retard + d.echeances_a_venir;
  return [
    {
      id: "factures",
      icon: FileText,
      valeur: d.factures_a_valider,
      label: "factures à valider",
      detail: d.factures_a_valider > 0 ? "Extraction IA prête à confirmer" : null,
      href: "/app/factures/validation",
    },
    {
      id: "documents",
      icon: FileText,
      valeur: d.documents_a_valider,
      label: "documents à valider",
      detail: d.documents_a_valider > 0 ? "Classement IA à confirmer" : null,
      href: "/app/documents",
    },
    {
      id: "echeances",
      icon: CalendarPlus,
      valeur: echeancesTotal,
      label: "échéances à traiter",
      detail:
        d.echeances_en_retard > 0
          ? `Dont ${formatCompte(d.echeances_en_retard)} en retard`
          : d.echeances_a_venir > 0
            ? "À venir (30 jours)"
            : null,
      href: "/app/calendrier/echeances",
    },
    {
      id: "relances",
      icon: MailCheck,
      valeur: d.relances_a_valider,
      label: "relances à valider",
      detail: d.relances_a_valider > 0 ? "Brouillons à envoyer" : null,
      href: "/app/calendrier/relances",
    },
    {
      id: "salaires",
      icon: Briefcase,
      valeur: d.periodes_salaire_a_traiter,
      label: "périodes salaire à traiter",
      detail: d.periodes_salaire_a_traiter > 0 ? "À valider ou en retard" : null,
      href: "/app/salaire",
    },
  ];
}

// ─── « À faire maintenant » — un focus qui domine, le reste résumé ────────────

async function FocusSection({ cabinetId }: { cabinetId: string }) {
  const digest = await getDigestCabinet(cabinetId);
  const lignes = construireLignesDigest(digest);
  const total = lignes.reduce((acc, l) => acc + l.valeur, 0);

  if (total === 0) {
    return (
      <div className="flex items-center gap-4 rounded-xl bg-emerald-400/10 p-5 ring-1 ring-emerald-400/20">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15">
          <CheckCircle2 className="size-6 text-emerald-300" aria-hidden />
        </span>
        <div>
          <p className="text-base font-semibold tracking-tight text-white">
            Tout est à jour, rien ne t'attend
          </p>
          <p className="text-[13px] text-slate-400">
            Aucun document, facture, échéance, relance ou salaire en attente.
          </p>
        </div>
      </div>
    );
  }

  const attention = lignes.filter((l) => l.valeur > 0).sort((a, b) => b.valeur - a.valeur);
  const focus = attention[0];
  if (!focus) return null;
  const FocusIcon = focus.icon;
  // Résumé des autres catégories (hors focus) — chips compacts.
  const autres = lignes.filter((l) => l.id !== focus.id);

  return (
    <div className="overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
      {/* Focus — l'action qui domine */}
      <div className="flex flex-col gap-4 border-l-2 border-amber-400 bg-amber-400/[0.06] p-5 sm:flex-row sm:items-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
          <FocusIcon className="size-7" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold tracking-tight text-white">
            <span className="tabular-nums">{formatCompte(focus.valeur)}</span>{" "}
            <span className="font-medium">{focus.label}</span>
          </p>
          <p className="mt-0.5 text-[13px] text-slate-400">{focus.detail ?? "À traiter"}</p>
        </div>
        <Link
          href={focus.href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-indigo-400"
        >
          Traiter maintenant
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* Le reste, résumé */}
      <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
        {autres.map((l) => {
          const Icon = l.icon;
          const actif = l.valeur > 0;
          return (
            <Link
              key={l.id}
              href={l.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] transition-colors",
                actif
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:border-amber-400/50"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20",
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
              <span className="capitalize">{l.label}</span>
              {actif ? (
                <span className="font-semibold tabular-nums">{formatCompte(l.valeur)}</span>
              ) : (
                <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FocusSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
      <div className="flex items-center gap-4 p-5">
        <div className="size-14 shrink-0 animate-pulse rounded-2xl bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-64 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
        </div>
        <div className="h-10 w-40 animate-pulse rounded-lg bg-white/10" />
      </div>
      <div className="flex gap-2 border-t border-white/10 px-4 py-3">
        {["a", "b", "c", "d"].map((id) => (
          <div key={id} className="h-7 w-32 animate-pulse rounded-md bg-white/10" />
        ))}
      </div>
    </div>
  );
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  valeur,
  href,
  icon: Icon,
}: {
  label: string;
  valeur: number;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md motion-reduce:transform-none"
    >
      <span>
        <span className="block text-3xl font-semibold tabular-nums tracking-tight text-foreground transition-colors group-hover:text-primary">
          {formatCompte(valeur)}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{label}</span>
      </span>
      <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
    </Link>
  );
}

// ─── Clients à suivre — top 5 par risque (vue crm.v_client_dashboard) ─────────

type ClientASuivre = {
  id: string;
  raison_sociale: string;
  risque_score: number | null;
  risque_niveau: string | null;
  prochaine_echeance: string | null;
  nb_documents_manquants: number;
};

const RISQUE_DOT: Record<string, string> = {
  faible: "bg-emerald-500",
  moyen: "bg-amber-500",
  eleve: "bg-orange-500",
  critique: "bg-red-500",
};

function formatDateCourte(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function ClientsASuivreSection({ cabinetId }: { cabinetId: string }) {
  // Sécurité (ADR 0005 addendum) : le filtre cabinet_id dans le WHERE est la
  // frontière réelle sur le chemin service-role, jamais une valeur d'URL/body.
  const rows = (await db.execute(sql`
    SELECT id, raison_sociale, risque_score, risque_niveau,
           prochaine_echeance, nb_documents_manquants
    FROM crm.v_client_dashboard
    WHERE cabinet_id = ${cabinetId}
      AND statut = 'actif'
    ORDER BY risque_score DESC NULLS LAST, raison_sociale ASC
    LIMIT 5
  `)) as unknown as Array<Record<string, unknown>>;

  const clients: ClientASuivre[] = rows
    .filter((r) => r.id != null)
    .map((r) => ({
      id: r.id as string,
      raison_sociale: (r.raison_sociale as string | null) ?? "",
      risque_score: r.risque_score != null ? Number(r.risque_score) : null,
      risque_niveau: (r.risque_niveau as string | null) ?? null,
      prochaine_echeance: r.prochaine_echeance != null ? String(r.prochaine_echeance) : null,
      nb_documents_manquants:
        r.nb_documents_manquants != null ? Number(r.nb_documents_manquants) : 0,
    }));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {clients.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-[13px] text-muted-foreground">Aucun client actif</p>
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="border-b border-border bg-slate-50/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Client</th>
              <th className="px-4 py-2 font-semibold">Risque</th>
              <th className="hidden px-4 py-2 font-semibold sm:table-cell">Échéance</th>
              <th className="px-4 py-2 font-semibold">Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {clients.map((c) => {
              const badge = c.risque_niveau ? badgeRisque(c.risque_niveau) : null;
              const dot = c.risque_niveau ? RISQUE_DOT[c.risque_niveau] : undefined;
              return (
                <tr key={c.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/app/clients/${c.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {c.raison_sociale}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {badge ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn("size-2 rounded-full", dot ?? "bg-slate-300")}
                          aria-hidden
                        />
                        <span className="text-slate-700">{badge.label}</span>
                        {c.risque_score != null && (
                          <span className="text-muted-foreground tabular-nums">
                            · {c.risque_score}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 tabular-nums text-slate-600 sm:table-cell">
                    {formatDateCourte(c.prochaine_echeance)}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.nb_documents_manquants > 0 ? (
                      <Badge famille="attention">{c.nb_documents_manquants}</Badge>
                    ) : (
                      <span className="text-slate-400">à jour</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="mt-auto border-t border-border px-4 py-2.5">
        <Link
          href="/app/clients"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          Tous les clients
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function ClientsASuivreSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border bg-slate-50/60 px-4 py-2">
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <ul className="divide-y divide-border/60">
        {["a", "b", "c", "d", "e"].map((id) => (
          <li key={id} className="flex items-center gap-4 px-4 py-2.5">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-10 rounded-md" />
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-2.5">
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}

// ─── Fil d'activité (crm.evenement, scopé cabinet) ───────────────────────────

const EVENEMENT_META: Record<string, { icon: LucideIcon; label: string }> = {
  document_recu: { icon: FileText, label: "Document reçu" },
  document_classe: { icon: FileCheck2, label: "Document classé" },
  relance_envoyee: { icon: MailCheck, label: "Relance envoyée" },
  echeance_creee: { icon: CalendarPlus, label: "Échéance créée" },
  service_active: { icon: ShieldCheck, label: "Service activé" },
  note_ajoutee: { icon: StickyNote, label: "Note ajoutée" },
  mandat_signe: { icon: FileSignature, label: "Mandat signé" },
  anomalie_facture: { icon: AlertTriangle, label: "Anomalie de facture" },
  score_recalcule: { icon: TrendingUp, label: "Risque recalculé" },
  cabinet_membre_ajoute: { icon: UserPlus, label: "Membre ajouté" },
  integration_configuree: { icon: Plug, label: "Intégration configurée" },
};

function formatRelatifCourt(value: Date): string {
  const mins = Math.floor((Date.now() - value.getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const heures = Math.floor(mins / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours === 1) return "hier";
  if (jours < 7) return `il y a ${jours} j`;
  return value.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

async function ActiviteSection({ cabinetId }: { cabinetId: string }) {
  const rows = await db
    .select({
      id: evenement.id,
      type: evenement.type,
      acteur_type: evenement.acteur_type,
      description: evenement.description,
      created_at: evenement.created_at,
      client_nom: client.raison_sociale,
    })
    .from(evenement)
    .leftJoin(client, eq(evenement.client_id, client.id))
    .where(eq(evenement.cabinet_id, cabinetId))
    .orderBy(desc(evenement.created_at))
    .limit(7);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Rien à signaler"
        hint="L'activité de votre cabinet (documents reçus, relances, classements IA) s'affichera ici."
        className="h-full"
      />
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <ul className="divide-y divide-border/60">
        {rows.map((e) => {
          const meta = EVENEMENT_META[e.type] ?? { icon: Activity, label: e.type };
          const Icon = meta.icon;
          const parIa = e.acteur_type === "ia";
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                  parIa ? "bg-blue-50 text-primary" : "bg-slate-100 text-slate-500",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-foreground">
                  {e.description ?? meta.label}
                  {e.client_nom && <span className="text-muted-foreground"> · {e.client_nom}</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {parIa && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 py-px font-medium text-primary">
                      <Bot className="size-3" aria-hidden />
                      IA
                    </span>
                  )}
                  {formatRelatifCourt(new Date(e.created_at))}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActiviteSkeleton() {
  return (
    <div className="h-full overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <ul className="divide-y divide-border/60">
        {["a", "b", "c", "d", "e"].map((id) => (
          <li key={id} className="flex items-start gap-3 px-4 py-2.5">
            <Skeleton className="size-7 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AppHomePage() {
  const user = await getCurrentUser();

  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id || !user) {
    redirect("/onboarding");
  }

  const now = new Date();
  const debutMois = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Cabinet + KPIs (requêtes légères) résolus tout de suite ; le focus, les
  // clients à suivre et le fil d'activité (plus lourds) sont streamés via
  // <Suspense>. Tout est scopé cabinet_id (ADR 0005 addendum).
  const [cabinetResult, membresResult, clientsResult, docsResult] = await Promise.all([
    db
      .select({
        raison_sociale: cabinet.raison_sociale,
        plan_tarifaire: cabinet.plan_tarifaire,
      })
      .from(cabinet)
      .where(eq(cabinet.id, cabinet_id))
      .limit(1),
    db
      .select({ total: count() })
      .from(cabinetMembre)
      .where(eq(cabinetMembre.cabinet_id, cabinet_id)),
    db
      .select({ total: count() })
      .from(client)
      .where(and(eq(client.cabinet_id, cabinet_id), eq(client.statut, "actif"))),
    db
      .select({ total: count() })
      .from(uploadBrut)
      .where(and(eq(uploadBrut.cabinet_id, cabinet_id), gte(uploadBrut.date_upload, debutMois))),
  ]);

  const [cabinetData] = cabinetResult;
  const nbMembres = membresResult[0]?.total ?? 0;
  const nbClientsActifs = clientsResult[0]?.total ?? 0;
  const nbDocsMois = docsResult[0]?.total ?? 0;

  const planLabel: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  const prenomAffiche = user.email?.split("@")[0] ?? "vous";
  const dateDuJour = now.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <HelpModeProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ─── Bande « co-pilote » sombre : salutation + commande + focus ──────── */}
        <section className="mb-6 overflow-hidden rounded-2xl bg-[#0d1220] p-5 ring-1 ring-white/[0.06] sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-wider text-slate-400 first-letter:uppercase">
                {dateDuJour}
                {cabinetData && <> · {cabinetData.raison_sociale}</>}
                {cabinetData?.plan_tarifaire && (
                  <>
                    {" "}
                    <span className="text-slate-500">
                      · {planLabel[cabinetData.plan_tarifaire] ?? cabinetData.plan_tarifaire}
                    </span>
                  </>
                )}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                Bonjour, {prenomAffiche}.
              </h1>
            </div>
            <HelpModeToggle />
          </div>

          {/* Barre « demande à ZARYA » (surface de commande → RAG) */}
          <HelpHint
            title="Demander à ZARYA"
            body="Posez une question en langage naturel sur vos documents (« quelles factures TVA arrivent cette semaine ? »). Le co-pilote répond en citant ses sources, uniquement depuis les données de votre cabinet."
            className="mt-5 block"
          >
            <DashboardAskBar />
          </HelpHint>

          {/* À faire maintenant — le focus qui domine (streamé) */}
          <HelpHint
            title="À faire maintenant"
            body="L'action la plus urgente, isolée pour vous. L'IA a déjà préparé le travail : cliquez « Traiter maintenant » pour valider directement. Les autres catégories sont résumées en dessous."
            className="mt-4 block"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              À faire maintenant
            </p>
            <Suspense fallback={<FocusSkeleton />}>
              <FocusSection cabinetId={cabinet_id} />
            </Suspense>
          </HelpHint>
        </section>

        {/* ─── KPIs ────────────────────────────────────────────────────────────── */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <HelpHint
            title="Clients actifs"
            body="Le nombre de PME que votre cabinet gère activement. Cliquez pour ouvrir la liste, la trier par risque et rechercher un dossier."
          >
            <MetricCard
              label={nbClientsActifs > 1 ? "Clients actifs" : "Client actif"}
              valeur={nbClientsActifs}
              href="/app/clients"
              icon={Users}
            />
          </HelpHint>
          <HelpHint
            title="Équipe"
            body="Les membres de votre cabinet ayant accès à ZARYA. Cliquez pour inviter un collègue ou ajuster ses droits (responsable, collaborateur, lecteur…)."
          >
            <MetricCard
              label={nbMembres > 1 ? "Membres d'équipe" : "Membre d'équipe"}
              valeur={nbMembres}
              href="/app/parametres/equipe"
              icon={Briefcase}
            />
          </HelpHint>
          <HelpHint
            title="Documents ce mois"
            body="Les pièces déposées ce mois-ci (upload, email capté, portail client). Cliquez pour ouvrir le hub et valider les classements proposés par l'IA."
          >
            <MetricCard
              label="Documents ce mois"
              valeur={nbDocsMois}
              href="/app/documents"
              icon={FileText}
            />
          </HelpHint>
        </div>

        {/* ─── Clients à suivre + Fil d'activité (streamés) ───────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Clients à suivre
            </h2>
            <HelpHint
              title="Clients à suivre"
              body="Vos 5 clients au risque le plus élevé. La pastille colorée indique le niveau de risque et son score, avec la prochaine échéance et le nombre de documents manquants. Cliquez un client pour ouvrir son dossier."
              className="block"
            >
              <Suspense fallback={<ClientsASuivreSkeleton />}>
                <ClientsASuivreSection cabinetId={cabinet_id} />
              </Suspense>
            </HelpHint>
          </section>
          <section className="lg:col-span-1">
            <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fil d'activité
            </h2>
            <HelpHint
              title="Fil d'activité"
              body="Ce que le co-pilote, le système et votre équipe viennent de faire (classement IA, relance envoyée, anomalie détectée…). Le badge « IA » signale une action automatique."
              className="block h-full"
            >
              <Suspense fallback={<ActiviteSkeleton />}>
                <ActiviteSection cabinetId={cabinet_id} />
              </Suspense>
            </HelpHint>
          </section>
        </div>
      </div>
    </HelpModeProvider>
  );
}
