import { getCurrentUser } from "@zarya/auth";
import { client, db, echeance } from "@zarya/db";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { type EcheanceRow, EcheancesListe } from "./echeances-client";

// Vue liste des échéances — module Calendar (calendar.md §6.2, Bloc C3b). Interroge
// crm.echeance directement (la vue v_echeances_a_venir est trop étroite : a_venir/
// imminente ≤30j). Scopée cabinet_id (frontière de sécurité — ADR 0005 addendum).

const STATUTS = ["a_venir", "imminente", "en_retard", "traitee", "reportee", "annulee"] as const;
const TYPES = [
  "fiscale",
  "tva",
  "bouclement",
  "salaire",
  "relance_documents",
  "personnalisee",
] as const;

type Statut = (typeof STATUTS)[number];
type TypeEch = (typeof TYPES)[number];

export default async function EcheancesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; type?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutAgir = role !== "lecteur";

  const sp = await searchParams;
  const statut = STATUTS.includes(sp.statut as Statut) ? (sp.statut as Statut) : undefined;
  const type = TYPES.includes(sp.type as TypeEch) ? (sp.type as TypeEch) : undefined;
  const q = sp.q?.trim() || undefined;

  const conditions = [eq(echeance.cabinet_id, cabinet_id), isNull(echeance.archived_at)];
  if (statut) conditions.push(eq(echeance.statut, statut));
  if (type) conditions.push(eq(echeance.type, type));
  if (q) conditions.push(ilike(client.raison_sociale, `%${q}%`));

  const rows = await db
    .select({
      id: echeance.id,
      client_id: echeance.client_id,
      client_nom: client.raison_sociale,
      type: echeance.type,
      libelle: echeance.libelle,
      date_echeance: echeance.date_echeance,
      statut: echeance.statut,
      reporte_a: echeance.reporte_a,
      motif_report: echeance.motif_report,
    })
    .from(echeance)
    .innerJoin(client, eq(client.id, echeance.client_id))
    .where(and(...conditions))
    .orderBy(asc(echeance.date_echeance))
    .limit(300);

  const echeances: EcheanceRow[] = rows.map((r) => ({
    id: r.id,
    client_id: r.client_id,
    client_nom: r.client_nom,
    type: r.type,
    libelle: r.libelle,
    date_echeance: r.date_echeance ? new Date(r.date_echeance).toISOString().slice(0, 10) : null,
    statut: r.statut,
    reporte_a: r.reporte_a ? new Date(r.reporte_a).toISOString().slice(0, 10) : null,
    motif_report: r.motif_report,
  }));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Échéances</h1>
      <p className="mb-6 text-sm text-gray-500">{echeances.length} échéance(s)</p>
      <EcheancesListe
        echeances={echeances}
        statuts={[...STATUTS]}
        types={[...TYPES]}
        filtres={{ statut: statut ?? "", type: type ?? "", q: q ?? "" }}
        peutAgir={peutAgir}
      />
    </main>
  );
}
