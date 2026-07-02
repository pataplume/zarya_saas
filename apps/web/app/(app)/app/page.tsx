import { getCurrentUser } from "@zarya/auth";
import { cabinet, cabinetMembre, client, db, sql, uploadBrut } from "@zarya/db";
import { and, count, eq, gte } from "drizzle-orm";
import {
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type DigestCabinet, getDigestCabinet } from "@/lib/dashboard-data";
import { badgeRisque } from "@/lib/libelles";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
};

// Carte-compteur « à traiter » : libellé FR + icône (jamais couleur seule) + lien.
type TuileDigest = {
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

// ─── Digest « à traiter » (C3.1) ─────────────────────────────────────────────

// Compteur abrégé : au-delà de 999 on plafonne l'affichage à « 999+ » pour rester lisible.
function formatCompte(n: number): string {
  if (n >= 1000) return "999+";
  return String(n);
}

function construireTuilesDigest(d: DigestCabinet): TuileDigest[] {
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
      detail: d.factures_a_valider > 0 ? "Extraction à confirmer" : null,
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

// ─── Digest « à traiter » — section streamée (le reste de la page s'affiche
// sans attendre la requête la plus lente) ────────────────────────────────────

async function DigestSection({ cabinetId }: { cabinetId: string }) {
  const digest = await getDigestCabinet(cabinetId);
  const tuilesDigest = construireTuilesDigest(digest);
  const totalATraiter = tuilesDigest.reduce((acc, t) => acc + t.valeur, 0);

  if (totalATraiter === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <CheckCircle2 className="size-6 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="text-sm font-medium text-emerald-800">Rien à traiter, tout est à jour</p>
          <p className="text-xs text-emerald-700">
            Aucun document, facture, échéance, relance ou salaire en attente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tuilesDigest.map((t) => {
        const aTraiter = t.valeur > 0;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`group flex items-start gap-4 rounded-xl border p-4 transition-colors ${
              aTraiter
                ? "border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <Icon
              className={`mt-1 size-5 shrink-0 ${aTraiter ? "text-amber-600" : "text-slate-400"}`}
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className={`text-2xl font-bold ${aTraiter ? "text-amber-700" : "text-slate-400"}`}>
                {formatCompte(t.valeur)}
              </p>
              <p className="text-sm font-medium text-slate-700">{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {aTraiter ? (t.detail ?? "À traiter") : "À jour"}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function DigestSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {["documents", "factures", "echeances", "relances", "salaires"].map((id) => (
        <div
          key={id}
          className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4"
        >
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Clients à suivre — top 5 par risque (même source que la liste clients :
// vue crm.v_client_dashboard, scopée cabinet_id) — section streamée ──────────

type ClientASuivre = {
  id: string;
  raison_sociale: string;
  risque_score: number | null;
  risque_niveau: string | null;
  prochaine_echeance: string | null;
  nb_documents_manquants: number;
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
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {clients.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">Aucun client actif</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {clients.map((c) => {
            const badge = c.risque_niveau ? badgeRisque(c.risque_niveau) : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <Link
                  href={`/app/clients/${c.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:text-blue-600"
                >
                  {c.raison_sociale}
                </Link>
                {badge ? (
                  <Badge famille={badge.famille}>
                    <span aria-hidden>{badge.symbole}</span>
                    {badge.label}
                    {c.risque_score != null && ` · ${c.risque_score}`}
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-400">Risque —</span>
                )}
                <span className="w-28 text-xs text-slate-500">
                  Échéance {formatDateCourte(c.prochaine_echeance)}
                </span>
                <span className="w-32 text-xs">
                  {c.nb_documents_manquants > 0 ? (
                    <span className="font-medium text-amber-700">
                      {c.nb_documents_manquants} doc{c.nb_documents_manquants > 1 ? "s" : ""}{" "}
                      manquant{c.nb_documents_manquants > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-slate-400">Docs à jour</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-slate-100 px-5 py-2.5">
        <Link href="/app/clients" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          Tous les clients →
        </Link>
      </div>
    </div>
  );
}

function ClientsASuivreSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-100">
        {["a", "b", "c", "d", "e"].map((id) => (
          <li key={id} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 px-5 py-2.5">
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
  // le digest « à traiter » et les clients à suivre (requêtes les plus lourdes)
  // sont streamés via <Suspense>. Tout est scopé cabinet_id (frontière de
  // sécurité réelle sur le chemin service-role — ADR 0005 addendum).
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
  const [membresData] = membresResult;
  const nbMembres = membresData?.total ?? 0;
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
      {/* ─── En-tête (une ligne : titre + date du jour) ──────────────────────── */}
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold text-slate-900">
          Bonjour, <span className="text-slate-600">{prenomAffiche}</span>
        </h1>
        <p className="text-sm text-slate-500">{dateDuJour}</p>
      </div>

      {/* ─── Carte cabinet (compacte : identité + stats sur une ligne) ───────── */}
      {cabinetData && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <span className="truncate text-sm font-semibold text-slate-900">
            {cabinetData.raison_sociale}
          </span>
          {cabinetData.plan_tarifaire && (
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {planLabel[cabinetData.plan_tarifaire] ?? cabinetData.plan_tarifaire}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            {cabinetData.ide && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400">IDE</span>
                <span className="font-mono text-slate-700">{cabinetData.ide}</span>
              </span>
            )}
            {(cabinetData.adresse_ville ?? cabinetData.adresse_canton) && (
              <span>
                {[cabinetData.adresse_ville, cabinetData.adresse_canton].filter(Boolean).join(", ")}
              </span>
            )}
            {cabinetData.forme_juridique && <span>{cabinetData.forme_juridique}</span>}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-x-4 text-xs text-slate-500">
            <Link href="/app/parametres/equipe" className="transition-colors hover:text-blue-600">
              <span className="font-bold text-slate-900">{nbMembres}</span>{" "}
              {nbMembres <= 1 ? "membre" : "membres"} →
            </Link>
            <Link href="/app/clients" className="transition-colors hover:text-blue-600">
              <span className="font-bold text-slate-900">{nbClientsActifs}</span> client
              {nbClientsActifs > 1 ? "s" : ""} actif{nbClientsActifs > 1 ? "s" : ""} →
            </Link>
            <Link href="/app/documents" className="transition-colors hover:text-blue-600">
              <span className="font-bold text-slate-900">{nbDocsMois}</span> document
              {nbDocsMois > 1 ? "s" : ""} ce mois →
            </Link>
          </span>
        </div>
      )}

      {/* ─── À traiter (digest cabinet, C3.1 — streamé) ─────────────────────── */}
      <section className="mb-4">
        <h2 className="mb-3 text-base font-semibold text-slate-700">À traiter</h2>
        <Suspense fallback={<DigestSkeleton />}>
          <DigestSection cabinetId={cabinet_id} />
        </Suspense>
      </section>

      {/* ─── Accès rapides (chips modules, mêmes icônes que la sidebar) ──────── */}
      <nav aria-label="Modules" className="mb-6 flex flex-wrap gap-2">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.id}
              href={mod.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700"
            >
              <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
              {mod.label}
            </Link>
          );
        })}
      </nav>

      {/* ─── Clients à suivre (top 5 par risque — streamé) ──────────────────── */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-700">Clients à suivre</h2>
        <Suspense fallback={<ClientsASuivreSkeleton />}>
          <ClientsASuivreSection cabinetId={cabinet_id} />
        </Suspense>
      </section>
    </div>
  );
}
