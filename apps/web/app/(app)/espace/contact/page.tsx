import { cabinet, db } from "@zarya/db";
import { eq } from "drizzle-orm";
import { getEspaceClientContext } from "@/lib/espace-context";

// F8 — Contact cabinet (dashboard-client.md §10). Coordonnées de la fiduciaire (lecture seule).
export default async function EspaceContactPage() {
  const { cabinet_id } = await getEspaceClientContext();
  const [cab] = await db
    .select({ raison_sociale: cabinet.raison_sociale })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Contact</h1>
      <p className="mt-1 text-sm text-gray-500">
        Votre fiduciaire est votre interlocuteur pour toute question.
      </p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">Fiduciaire</p>
        <p className="text-lg font-medium text-gray-900">{cab?.raison_sociale ?? "—"}</p>
        <p className="mt-4 text-sm text-gray-600">
          Pour modifier une information ou poser une question, contactez directement votre
          gestionnaire. La messagerie intégrée arrivera dans une prochaine version.
        </p>
      </div>
    </section>
  );
}
