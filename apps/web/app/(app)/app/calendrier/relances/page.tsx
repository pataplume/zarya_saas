import { getCurrentUser } from "@zarya/auth";
import { db, vRelancesAValider } from "@zarya/db";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { type RelanceItem, RelancesFile } from "./relances-client";

// File des relances à valider — module Calendar (calendar.md §6.4, Bloc C3a).
// Mode A : l'IA/cron propose des brouillons, l'humain valide puis envoie (UX §1).
// Lit la vue dénormalisée calendar.v_relances_a_valider (migration 0027) scopée
// cabinet_id (frontière de sécurité réelle sur le chemin service-role — ADR 0005).

export default async function RelancesPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutEnvoyer = role !== "lecteur";

  const rows = await db
    .select({
      relance_id: vRelancesAValider.relance_id,
      client_id: vRelancesAValider.client_id,
      client_nom: vRelancesAValider.client_nom,
      echeance_libelle: vRelancesAValider.echeance_libelle,
      date_echeance: vRelancesAValider.date_echeance,
      destinataire_email: vRelancesAValider.destinataire_email,
      destinataire_nom: vRelancesAValider.destinataire_nom,
      sujet: vRelancesAValider.sujet,
      corps: vRelancesAValider.corps,
      numero_dans_serie: vRelancesAValider.numero_dans_serie,
    })
    .from(vRelancesAValider)
    .where(eq(vRelancesAValider.cabinet_id, cabinet_id))
    .orderBy(asc(vRelancesAValider.date_echeance))
    .limit(200);

  const relances: RelanceItem[] = rows.map((r) => ({
    relance_id: r.relance_id,
    client_id: r.client_id,
    client_nom: r.client_nom,
    echeance_libelle: r.echeance_libelle,
    date_echeance: r.date_echeance ? new Date(r.date_echeance).toISOString().slice(0, 10) : null,
    destinataire_email: r.destinataire_email,
    destinataire_nom: r.destinataire_nom,
    sujet: r.sujet,
    corps: r.corps,
    numero_dans_serie: r.numero_dans_serie,
  }));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Relances à valider</h1>
      <p className="mb-6 text-sm text-slate-500">
        {relances.length} relance{relances.length > 1 ? "s" : ""} en attente
      </p>
      <RelancesFile relances={relances} peutEnvoyer={peutEnvoyer} />
    </main>
  );
}
