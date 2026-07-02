import { client as clientTable, db, eq, sql } from "@zarya/db";
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  type LucideIcon,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getEspaceClientContext } from "@/lib/espace-context";
import { listerPeriodesClient } from "@/lib/periode-client-data";

// Run B2 — Accueil espace client : vrai tableau de bord. Met en avant les ACTIONS en attente
// (documents à fournir, salaires à valider) + accès rapides. Scopé (cabinet_id, client_id) du JWT.
const STATUTS_PERIODE_A_FAIRE = new Set(["non_demandee", "en_attente", "relancee", "en_retard"]);

const LIENS_RAPIDES: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/espace/documents", label: "Mes documents", icon: FileText },
  { href: "/espace/validations", label: "Validations", icon: ClipboardCheck },
  { href: "/espace/entreprise", label: "Mon entreprise", icon: Building2 },
  { href: "/espace/employes", label: "Mes employés", icon: Users },
  { href: "/espace/parametres", label: "Paramètres", icon: Settings },
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
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Bonjour</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Votre espace pour <strong className="font-medium text-foreground">{nomEntreprise}</strong>.
      </p>

      {/* À faire */}
      <h2 className="mt-6 text-sm font-semibold tracking-tight text-foreground">À faire</h2>
      {rienAFaire ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2
            className="h-5 w-5 shrink-0 text-emerald-600"
            strokeWidth={1.75}
            aria-hidden
          />
          Vous êtes à jour, rien à faire pour le moment.
        </div>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {nbDocsAFournir > 0 && (
            <ActionCard
              href="/espace/documents"
              icon={FileText}
              count={nbDocsAFournir}
              titre={nbDocsAFournir > 1 ? "documents à fournir" : "document à fournir"}
              cta="Déposer mes documents"
            />
          )}
          {nbValidations > 0 && (
            <ActionCard
              href="/espace/validations"
              icon={ClipboardCheck}
              count={nbValidations}
              titre={nbValidations > 1 ? "salaires à valider" : "salaire à valider"}
              cta="Vérifier et valider"
            />
          )}
        </div>
      )}

      {/* Accès rapides */}
      <h2 className="mt-8 text-sm font-semibold tracking-tight text-foreground">Accès rapides</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LIENS_RAPIDES.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-4 text-sm font-medium text-foreground shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <l.icon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden
            />
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function ActionCard({
  href,
  icon: Icon,
  count,
  titre,
  cta,
}: {
  href: string;
  icon: LucideIcon;
  count: number;
  titre: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"
          aria-hidden
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-lg font-semibold tabular-nums text-amber-900">{count}</p>
          <p className="text-sm text-amber-800">{titre}</p>
        </div>
      </div>
      <span className="mt-3 inline-block text-xs font-medium text-amber-700 group-hover:underline">
        {cta} →
      </span>
    </Link>
  );
}
