import { getCurrentUser } from "@zarya/auth";
import { cabinet, cabinetMembre, client, db, uploadBrut } from "@zarya/db";
import { and, count, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type DigestCabinet, getDigestCabinet } from "@/lib/dashboard-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = {
  id: string;
  label: string;
  description: string;
  icon: string;
  href: string;
};

// Carte-compteur « à traiter » : libellé FR + icône (jamais couleur seule) + lien.
type TuileDigest = {
  id: string;
  icon: string;
  valeur: number;
  label: string;
  detail: string | null;
  href: string;
};

// ─── Modules (raccourcis vers les écrans réels) ──────────────────────────────

const MODULES: Module[] = [
  {
    id: "clients",
    label: "Clients",
    description: "Vos clients PME et leurs contacts",
    icon: "👥",
    href: "/app/clients",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Dépôt, classement IA et file de validation",
    icon: "📄",
    href: "/app/documents",
  },
  {
    id: "calendrier",
    label: "Calendrier",
    description: "Échéances fiscales et relances",
    icon: "📅",
    href: "/app/calendrier/echeances",
  },
  {
    id: "factures",
    label: "Factures",
    description: "Extraction et validation des factures",
    icon: "💰",
    href: "/app/factures/validation",
  },
  {
    id: "salaires",
    label: "Salaires",
    description: "Cycle mensuel et référentiel employés",
    icon: "💼",
    href: "/app/salaire",
  },
  {
    id: "recherche",
    label: "Recherche",
    description: "Recherche conversationnelle sur vos documents",
    icon: "🔍",
    href: "/app/recherche",
  },
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
      icon: "📄",
      valeur: d.documents_a_valider,
      label: "Documents à valider",
      detail: d.documents_a_valider > 0 ? "Classement IA à confirmer" : null,
      href: "/app/documents",
    },
    {
      id: "factures",
      icon: "💰",
      valeur: d.factures_a_valider,
      label: "Factures à valider",
      detail: d.factures_a_valider > 0 ? "Extraction à confirmer" : null,
      href: "/app/factures/validation",
    },
    {
      id: "echeances",
      icon: "📅",
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
      icon: "✉️",
      valeur: d.relances_a_valider,
      label: "Relances à valider",
      detail: d.relances_a_valider > 0 ? "Brouillons à envoyer" : null,
      href: "/app/calendrier/relances",
    },
    {
      id: "salaires",
      icon: "💼",
      valeur: d.periodes_salaire_a_traiter,
      label: "Périodes salaire à traiter",
      detail: d.periodes_salaire_a_traiter > 0 ? "À valider ou en retard" : null,
      href: "/app/salaire",
    },
  ];
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

  // Données cabinet + KPIs (membres, clients actifs, documents du mois) + digest
  // « à traiter » en parallèle. Tout est scopé cabinet_id (frontière de sécurité réelle
  // sur le chemin service-role — ADR 0005 addendum).
  const [cabinetResult, membresResult, clientsResult, docsResult, digest] = await Promise.all([
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
    getDigestCabinet(cabinet_id),
  ]);

  const tuilesDigest = construireTuilesDigest(digest);
  const totalATraiter = tuilesDigest.reduce((acc, t) => acc + t.valeur, 0);

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

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* ─── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Bonjour, <span className="text-slate-600">{prenomAffiche}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bienvenue dans votre espace ZARYA. Voici l'état de votre cabinet.
        </p>
      </div>

      {/* ─── Carte cabinet ───────────────────────────────────────────────────── */}
      {cabinetData && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-semibold text-slate-900">
                {cabinetData.raison_sociale}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
                {cabinetData.ide && (
                  <span className="flex items-center gap-1">
                    <span className="text-slate-400">IDE</span>
                    <span className="font-mono text-slate-700">{cabinetData.ide}</span>
                  </span>
                )}
                {(cabinetData.adresse_ville ?? cabinetData.adresse_canton) && (
                  <span>
                    {[cabinetData.adresse_ville, cabinetData.adresse_canton]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
                {cabinetData.forme_juridique && <span>{cabinetData.forme_juridique}</span>}
              </div>
            </div>
            {cabinetData.plan_tarifaire && (
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {planLabel[cabinetData.plan_tarifaire] ?? cabinetData.plan_tarifaire}
              </span>
            )}
          </div>

          {/* Stats rapides */}
          <div className="mt-5 flex gap-6 border-t border-slate-100 pt-4">
            <Link href="/app/parametres/equipe" className="group">
              <p className="text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {nbMembres}
              </p>
              <p className="text-xs text-slate-500 group-hover:text-blue-500 transition-colors">
                {nbMembres <= 1 ? "Membre" : "Membres"} d'équipe →
              </p>
            </Link>
            <Link href="/app/clients" className="group">
              <p className="text-2xl font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                {nbClientsActifs}
              </p>
              <p className="text-xs text-slate-500 transition-colors group-hover:text-blue-500">
                Client{nbClientsActifs > 1 ? "s" : ""} actif{nbClientsActifs > 1 ? "s" : ""} →
              </p>
            </Link>
            <Link href="/app/documents" className="group">
              <p className="text-2xl font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                {nbDocsMois}
              </p>
              <p className="text-xs text-slate-500 transition-colors group-hover:text-blue-500">
                Document{nbDocsMois > 1 ? "s" : ""} ce mois →
              </p>
            </Link>
          </div>
        </div>
      )}

      {/* ─── À traiter (digest cabinet, C3.1) ───────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-base font-semibold text-slate-700">À traiter</h2>
        {totalATraiter === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <span className="text-2xl" aria-hidden>
              ✅
            </span>
            <div>
              <p className="text-sm font-medium text-emerald-800">
                Rien à traiter, tout est à jour
              </p>
              <p className="text-xs text-emerald-700">
                Aucun document, facture, échéance, relance ou salaire en attente.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tuilesDigest.map((t) => {
              const aTraiter = t.valeur > 0;
              return (
                <Link
                  key={t.id}
                  href={t.href}
                  className={`group flex items-start gap-4 rounded-xl border p-5 transition-colors ${
                    aTraiter
                      ? "border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="text-2xl" aria-hidden>
                    {t.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-2xl font-bold ${aTraiter ? "text-amber-700" : "text-slate-400"}`}
                    >
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
        )}
      </section>

      {/* ─── Modules ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-700">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <Link
              key={mod.id}
              href={mod.href}
              className="group relative rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
            >
              <div className="mb-3 text-2xl" aria-hidden>
                {mod.icon}
              </div>
              <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-700">
                {mod.label}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{mod.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                Ouvrir →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
