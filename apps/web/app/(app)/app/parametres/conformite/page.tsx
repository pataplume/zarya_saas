import { getCurrentUser } from "@zarya/auth";
import { client, db, demandeSuppression, evenement } from "@zarya/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ConformiteListe, type DemandeNote, type DemandeRow } from "./conformite-client";

// Demandes RGPD : visibilité + traitement côté cabinet des demandes de suppression émises
// par les clients (droit à l'effacement, droits-personnes.md). Scopé cabinet_id du JWT,
// cible='client'. C4.1 — libellés/statuts centralisés dans `@/lib/libelles`. Actions
// (changement de statut, note) réservées au rôle responsable — cf. `./actions.ts`.

export default async function ConformitePage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "collaborateur";
  const isResponsable = role === "responsable";

  if (!isResponsable) {
    return (
      <section className="max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-900">Demandes RGPD</h1>
        <p className="mt-1 text-sm text-slate-500">
          Demandes de suppression de données émises par vos clients.
        </p>
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Seul un responsable du cabinet peut consulter les demandes de suppression des clients.
        </p>
      </section>
    );
  }

  const demandes = await db
    .select({
      id: demandeSuppression.id,
      client_raison_sociale: client.raison_sociale,
      demandeur_email: demandeSuppression.demandeur_email,
      motif: demandeSuppression.motif,
      statut: demandeSuppression.statut,
      created_at: demandeSuppression.created_at,
    })
    .from(demandeSuppression)
    .leftJoin(client, eq(demandeSuppression.client_id, client.id))
    .where(
      and(eq(demandeSuppression.cabinet_id, cabinet_id), eq(demandeSuppression.cible, "client")),
    )
    .orderBy(desc(demandeSuppression.created_at));

  // Historique (notes + changements de statut) — tracé dans crm.evenement (pas de colonne
  // notes sur crm.demande_suppression ; ressource_type "crm.demande_suppression").
  const demandeIds = demandes.map((d) => d.id);
  const evenements =
    demandeIds.length > 0
      ? await db
          .select({
            ressource_id: evenement.ressource_id,
            description: evenement.description,
            metadata: evenement.metadata,
            created_at: evenement.created_at,
          })
          .from(evenement)
          .where(
            and(
              eq(evenement.cabinet_id, cabinet_id),
              eq(evenement.ressource_type, "crm.demande_suppression"),
              inArray(evenement.ressource_id, demandeIds),
            ),
          )
          .orderBy(asc(evenement.created_at))
      : [];

  const notesParDemande = new Map<string, DemandeNote[]>();
  for (const ev of evenements) {
    if (!ev.ressource_id) continue;
    const liste = notesParDemande.get(ev.ressource_id) ?? [];
    liste.push({
      description: ev.description,
      metadata: (ev.metadata as Record<string, unknown> | null) ?? null,
      created_at: ev.created_at.toISOString(),
    });
    notesParDemande.set(ev.ressource_id, liste);
  }

  const rows: DemandeRow[] = demandes.map((demande) => ({
    id: demande.id,
    client_raison_sociale: demande.client_raison_sociale,
    demandeur_email: demande.demandeur_email,
    motif: demande.motif,
    statut: demande.statut,
    created_at: demande.created_at.toISOString(),
    historique: notesParDemande.get(demande.id) ?? [],
  }));

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold text-slate-900">Demandes RGPD</h1>
      <p className="mt-1 text-sm text-slate-500">
        Demandes de suppression de données émises par vos clients (droit à l'effacement). Le
        traitement définitif relève de votre responsabilité de fiduciaire.
      </p>

      <ConformiteListe demandes={rows} />
    </section>
  );
}
