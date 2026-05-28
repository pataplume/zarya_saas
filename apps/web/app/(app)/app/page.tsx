import { getCurrentUser } from "@zarya/auth";
import { cabinet, cabinetMembre, db } from "@zarya/db";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = {
  id: string;
  label: string;
  description: string;
  icon: string;
  phase: string;
};

// ─── Modules à venir ─────────────────────────────────────────────────────────

const MODULES_A_VENIR: Module[] = [
  {
    id: "crm",
    label: "CRM",
    description: "Gestion de vos clients et contacts PME",
    icon: "👥",
    phase: "Phase 2c",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Inbox documentaire et extraction IA",
    icon: "📄",
    phase: "Phase 3",
  },
  {
    id: "calendrier",
    label: "Calendrier",
    description: "Échéances fiscales et relances automatisées",
    icon: "📅",
    phase: "Phase 4",
  },
  {
    id: "factures",
    label: "Factures",
    description: "Extraction et validation des factures fournisseurs",
    icon: "💰",
    phase: "Phase 4",
  },
  {
    id: "recherche",
    label: "Recherche",
    description: "Recherche sémantique sur vos documents",
    icon: "🔍",
    phase: "Phase 2",
  },
  {
    id: "salaires",
    label: "Salaires",
    description: "Gestion des salaires et cycle Swissdec ELM",
    icon: "💼",
    phase: "Phase 3",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AppHomePage() {
  const user = await getCurrentUser();

  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id || !user) {
    redirect("/onboarding");
  }

  // Données cabinet + nombre de membres en parallèle
  const [cabinetResult, membresResult] = await Promise.all([
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
  ]);

  const [cabinetData] = cabinetResult;
  const [membresData] = membresResult;
  const nbMembres = membresData?.total ?? 0;

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
            <div>
              <p className="text-2xl font-bold text-slate-300">—</p>
              <p className="text-xs text-slate-400">Clients actifs</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-300">—</p>
              <p className="text-xs text-slate-400">Documents ce mois</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modules à venir ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-700">
          Modules en cours de développement
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES_A_VENIR.map((mod) => (
            <div
              key={mod.id}
              className="relative rounded-xl border border-slate-200 bg-white p-5 opacity-75"
            >
              {/* Badge phase */}
              <span className="absolute right-4 top-4 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                {mod.phase}
              </span>

              <div className="mb-3 text-2xl" aria-hidden>
                {mod.icon}
              </div>
              <h3 className="text-sm font-semibold text-slate-700">{mod.label}</h3>
              <p className="mt-1 text-xs text-slate-500">{mod.description}</p>

              <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                En construction
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Message de bienvenue ─────────────────────────────────────────────── */}
      <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-5">
        <p className="text-sm font-medium text-blue-800">
          Votre cabinet est configuré et opérationnel.
        </p>
        <p className="mt-1 text-xs text-blue-600">
          Les modules métier seront déployés progressivement. Vous serez notifié dès qu'un nouveau
          module est disponible.
        </p>
      </div>
    </div>
  );
}
