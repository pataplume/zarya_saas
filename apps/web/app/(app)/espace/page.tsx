import { client as clientTable, db, eq, sql } from "@zarya/db";
import Link from "next/link";
import { getEspaceClientContext } from "@/lib/espace-context";
import { listerPeriodesClient } from "@/lib/periode-client-data";

// Run B2 — Accueil espace client : vrai tableau de bord. Met en avant les ACTIONS en attente
// (documents à fournir, salaires à valider) + accès rapides. Scopé (cabinet_id, client_id) du JWT.
const STATUTS_PERIODE_A_FAIRE = new Set(["non_demandee", "en_attente", "relancee", "en_retard"]);

const LIENS_RAPIDES = [
  { href: "/espace/documents", label: "Mes documents", icon: "📄" },
  { href: "/espace/validations", label: "Validations", icon: "✅" },
  { href: "/espace/entreprise", label: "Mon entreprise", icon: "🏢" },
  { href: "/espace/employes", label: "Mes employés", icon: "👥" },
  { href: "/espace/parametres", label: "Paramètres", icon: "⚙️" },
];

export default async function EspaceAccueilPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();

  const [cli] = await db
    .select({ raison_sociale: clientTable.raison_sociale })
    .from(clientTable)
    .where(eq(clientTable.id, client_id))
    .limit(1);
  const nomEntreprise = cli?.raison_sociale ?? "votre entreprise";

  const periodes = await listerPeriodesClient(cabinet_id, client_id);
  const nbValidations = periodes.filter((p) => STATUTS_PERIODE_A_FAIRE.has(p.statut)).length;

  // Documents obligatoires attendus non encore reçus (à fournir par le client).
  const [docRow] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM crm.document_attendu
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
      AND archived_at IS NULL AND obligatoire = true
      AND statut_periode_courante IS DISTINCT FROM 'recu'
  `)) as unknown as { n: number }[];
  const nbDocsAFournir = Number(docRow?.n ?? 0);

  const rienAFaire = nbValidations === 0 && nbDocsAFournir === 0;

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Bonjour</h1>
      <p className="mt-1 text-sm text-gray-500">
        Votre espace pour <strong>{nomEntreprise}</strong>.
      </p>

      {/* À faire */}
      <h2 className="mt-6 text-base font-semibold text-gray-700">À faire</h2>
      {rienAFaire ? (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          🎉 Vous êtes à jour, rien à faire pour le moment.
        </div>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {nbDocsAFournir > 0 && (
            <ActionCard
              href="/espace/documents"
              icon="📄"
              count={nbDocsAFournir}
              titre={nbDocsAFournir > 1 ? "documents à fournir" : "document à fournir"}
              cta="Déposer mes documents"
            />
          )}
          {nbValidations > 0 && (
            <ActionCard
              href="/espace/validations"
              icon="✅"
              count={nbValidations}
              titre={nbValidations > 1 ? "salaires à valider" : "salaire à valider"}
              cta="Vérifier et valider"
            />
          )}
        </div>
      )}

      {/* Accès rapides */}
      <h2 className="mt-8 text-base font-semibold text-gray-700">Accès rapides</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LIENS_RAPIDES.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <span className="mr-2" aria-hidden>
              {l.icon}
            </span>
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function ActionCard({
  href,
  icon,
  count,
  titre,
  cta,
}: {
  href: string;
  icon: string;
  count: number;
  titre: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-amber-200 bg-amber-50 p-5 transition-colors hover:border-amber-300"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
        <div>
          <p className="text-lg font-bold text-amber-900">{count}</p>
          <p className="text-sm text-amber-800">{titre}</p>
        </div>
      </div>
      <span className="mt-3 inline-block text-xs font-medium text-amber-700 group-hover:underline">
        {cta} →
      </span>
    </Link>
  );
}
