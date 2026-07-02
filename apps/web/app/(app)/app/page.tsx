import { getCurrentUser } from "@zarya/auth";
import { cabinet, cabinetMembre, client, db, sql, uploadBrut } from "@zarya/db";
import { and, count, eq, gte } from "drizzle-orm";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  FileText,
  type LucideIcon,
  Mail,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type DigestCabinet, getDigestCabinet } from "@/lib/dashboard-data";
import { badgeRisque } from "@/lib/libelles";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
};

// Ligne de la file de travail : libellé FR + icône (jamais couleur seule) + lien.
type LigneDigest = {
  id: string;
  icon: LucideIcon;
  valeur: number;
  label: string;
  detail: string | null;
  href: string;
};

// ─── Modules (raccourcis compacts — mêmes icônes lucide que la sidebar) ───────

const MODULES: Module[] = [
  { id: "clients", label: "Clients", icon: Users, href: "/app/clients" },
  { id: "documents", label: "Documents", icon: FileText, href: "/app/documents" },
  { id: "calendrier", label: "Calendrier", icon: Calendar, href: "/app/calendrier/echeances" },
  { id: "factures", label: "Factures", icon: Receipt, href: "/app/factures/validation" },
  { id: "salaires", label: "Salaires", icon: Briefcase, href: "/app/salaire" },
  { id: "recherche", label: "Recherche", icon: Search, href: "/app/recherche" },
];

// ─── File de travail (digest « à traiter », C3.1) ────────────────────────────

// Compteur abrégé : au-delà de 999 on plafonne l'affichage à « 999+ ».
function formatCompte(n: number): string {
  if (n >= 1000) return "999+";
  return String(n);
}

function construireLignesDigest(d: DigestCabinet): LigneDigest[] {
  const echeancesTotal = d.echeances_en_retard + d.echeances_a_venir;
  return [
    {
      id: "documents",
      icon: FileText,
      valeur: d.documents_a_valider,
      label: "Documents à valider",
      detail: d.documents_a_valider > 0 ? "Classement IA à confirmer" : null,
      href: "/app/documents",
    },
    {
      id: "factures",
      icon: Receipt,
      valeur: d.factures_a_valider,
      label: "Factures à valider",
      detail: d.factures_a_valider > 0 ? "Extraction IA à confirmer" : null,
      href: "/app/factures/validation",
    },
    {
      id: "echeances",
      icon: Calendar,
      valeur: echeancesTotal,
      label: "Échéances à traiter",
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
      icon: Mail,
      valeur: d.relances_a_valider,
      label: "Relances à valider",
      detail: d.relances_a_valider > 0 ? "Brouillons à envoyer" : null,
      href: "/app/calendrier/relances",
    },
    {
      id: "salaires",
      icon: Briefcase,
      valeur: d.periodes_salaire_a_traiter,
      label: "Périodes salaire à traiter",
      detail: d.periodes_salaire_a_traiter > 0 ? "À valider ou en retard" : null,
      href: "/app/salaire",
    },
  ];
}

// ─── File de travail — section streamée (le reste de la page s'affiche sans
// attendre la requête la plus lente) ────────────────────────────────────────

async function DigestSection({ cabinetId }: { cabinetId: string }) {
  const digest = await getDigestCabinet(cabinetId);
  const lignes = construireLignesDigest(digest);
  const totalATraiter = lignes.reduce((acc, t) => acc + t.valeur, 0);

  if (totalATraiter === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-card">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-emerald-900">Tout est à jour</p>
          <p className="text-[13px] text-emerald-700">
            Aucun document, facture, échéance, relance ou salaire en attente.
          </p>
        </div>
      </div>
    );
  }

  // Ce qui demande attention (valeur > 0) remonte en tête et prend le poids visuel ;
  // le reste passe en pied, compact et discret.
  const attention = lignes.filter((l) => l.valeur > 0).sort((a, b) => b.valeur - a.valeur);
  const aJour = lignes.filter((l) => l.valeur === 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Bandeau récap */}
      <div className="flex items-center gap-2 border-b border-border bg-slate-50/60 px-4 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-800 tabular-nums">
          {formatCompte(totalATraiter)}
        </span>
        <span className="text-[13px] text-muted-foreground">
          élément{totalATraiter > 1 ? "s" : ""} en attente de validation
        </span>
      </div>

      {/* Lignes prioritaires */}
      <ul>
        {attention.map((l) => {
          const Icon = l.icon;
          return (
            <li key={l.id}>
              <Link
                href={l.href}
                className="group flex items-center gap-4 border-l-2 border-amber-400 bg-amber-50/40 px-4 py-3 transition-colors hover:bg-amber-50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="w-12 shrink-0 text-2xl font-semibold tabular-nums tracking-tight text-amber-700">
                  {formatCompte(l.valeur)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{l.label}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {l.detail ?? "À traiter"}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-amber-400 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Ce qui est à jour (compact) */}
      {aJour.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border">
          {aJour.map((l) => {
            const Icon = l.icon;
            return (
              <li key={l.id}>
                <Link
                  href={l.href}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-slate-50"
                >
                  <Icon className="size-4 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1 text-[13px] text-slate-500">{l.label}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="size-3.5" aria-hidden />à jour
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DigestSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border bg-slate-50/60 px-4 py-2">
        <Skeleton className="h-5 w-48" />
      </div>
      {["a", "b"].map((id) => (
        <div key={id} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="h-7 w-10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── KPI (cartes métriques) ──────────────────────────────────────────────────

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
      className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 shadow-card transition-colors hover:border-slate-300"
    >
      <span>
        <span className="block text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatCompte(valeur)}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{label}</span>
      </span>
      <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-blue-50 group-hover:text-primary">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
    </Link>
  );
}

// ─── Clients à suivre — top 5 par risque (vue crm.v_client_dashboard, scopée
// cabinet_id) — section streamée ─────────────────────────────────────────────

type ClientASuivre = {
  id: string;
  raison_sociale: string;
  risque_score: number | null;
  risque_niveau: string | null;
  prochaine_echeance: string | null;
  nb_documents_manquants: number;
};

// Couleur de la pastille de risque (le badge porte déjà symbole + texte).
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
  // Sécurité (ADR 0005 addendum) : chemin service-role → la frontière réelle est
  // le filtre cabinet_id dans le WHERE, jamais une valeur issue d'URL/body.
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
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {clients.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-muted-foreground">Aucun client actif</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="border-b border-border bg-slate-50/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Client</th>
              <th className="px-4 py-2 font-semibold">Risque</th>
              <th className="hidden px-4 py-2 font-semibold sm:table-cell">Prochaine échéance</th>
              <th className="px-4 py-2 font-semibold">Docs manquants</th>
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
                      <Badge famille="attention">
                        {c.nb_documents_manquants} manquant{c.nb_documents_manquants > 1 ? "s" : ""}
                      </Badge>
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
      <div className="border-t border-border px-4 py-2.5">
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
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <ul className="divide-y divide-border/60">
        {["a", "b", "c", "d", "e"].map((id) => (
          <li key={id} className="flex items-center gap-4 px-4 py-2.5">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="hidden h-3 w-24 sm:block" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-2.5">
        <Skeleton className="h-3 w-28" />
      </div>
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

  // Début du mois courant (UTC) pour le compteur « Documents ce mois ».
  const now = new Date();
  const debutMois = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Données cabinet + KPIs (membres, clients actifs, documents du mois) en parallèle ;
  // la file de travail et les clients à suivre (requêtes les plus lourdes) sont
  // streamés via <Suspense>. Tout est scopé cabinet_id (frontière de sécurité
  // réelle sur le chemin service-role — ADR 0005 addendum).
  const [cabinetResult, membresResult, clientsResult, docsResult] = await Promise.all([
    db
      .select({
        raison_sociale: cabinet.raison_sociale,
        ide: cabinet.ide,
        adresse_ville: cabinet.adresse_ville,
        adresse_canton: cabinet.adresse_canton,
        plan_tarifaire: cabinet.plan_tarifaire,
        forme_juridique: cabinet.forme_juridique,
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

  // Prénom à partir de l'email (avant le @)
  const prenomAffiche = user.email?.split("@")[0] ?? "vous";

  const dateDuJour = now.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* ─── En-tête (identité cabinet + salutation + date) ──────────────────── */}
      <PageHeader
        title={
          <>
            Bonjour, <span className="text-muted-foreground">{prenomAffiche}</span>
          </>
        }
        description={
          cabinetData ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-medium text-slate-700">{cabinetData.raison_sociale}</span>
              {cabinetData.plan_tarifaire && (
                <Badge>{planLabel[cabinetData.plan_tarifaire] ?? cabinetData.plan_tarifaire}</Badge>
              )}
              {cabinetData.ide && (
                <span className="font-mono text-slate-500">{cabinetData.ide}</span>
              )}
              {(cabinetData.adresse_ville ?? cabinetData.adresse_canton) && (
                <span className="text-muted-foreground">
                  {[cabinetData.adresse_ville, cabinetData.adresse_canton]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
            </span>
          ) : undefined
        }
        actions={
          <p className="text-[13px] text-muted-foreground first-letter:uppercase">{dateDuJour}</p>
        }
      />

      {/* ─── KPIs ────────────────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label={nbClientsActifs > 1 ? "Clients actifs" : "Client actif"}
          valeur={nbClientsActifs}
          href="/app/clients"
          icon={Users}
        />
        <MetricCard
          label={nbMembres > 1 ? "Membres d'équipe" : "Membre d'équipe"}
          valeur={nbMembres}
          href="/app/parametres/equipe"
          icon={Briefcase}
        />
        <MetricCard
          label="Documents ce mois"
          valeur={nbDocsMois}
          href="/app/documents"
          icon={FileText}
        />
      </div>

      {/* ─── File de travail (digest cabinet — streamé) ─────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          File de travail
        </h2>
        <Suspense fallback={<DigestSkeleton />}>
          <DigestSection cabinetId={cabinet_id} />
        </Suspense>
      </section>

      {/* ─── Clients à suivre (top 5 par risque — streamé) ──────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          Clients à suivre
        </h2>
        <Suspense fallback={<ClientsASuivreSkeleton />}>
          <ClientsASuivreSection cabinetId={cabinet_id} />
        </Suspense>
      </section>

      {/* ─── Accès rapides (chips modules) ──────────────────────────────────── */}
      <nav aria-label="Accès rapides" className="flex flex-wrap gap-2">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.id}
              href={mod.href}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-foreground"
            >
              <Icon className="size-4 text-slate-400" strokeWidth={1.75} aria-hidden />
              {mod.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
