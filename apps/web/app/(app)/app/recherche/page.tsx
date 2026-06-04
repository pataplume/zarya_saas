import { getCurrentUser } from "@zarya/auth";
import { redirect } from "next/navigation";
import { RechercheClient } from "@/components/recherche/recherche-client";

// H4b — Page de recherche conversationnelle (RAG) fiduciaire. La récupération est strictement
// scopée au cabinet (server action answerQuestion). Réf : search.md §6 ; KICKOFF H4.
export default async function RecherchePage() {
  const user = await getCurrentUser();
  if (!user?.app_metadata.cabinet_id) redirect("/app");

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Recherche</h1>
      <p className="mt-1 text-sm text-gray-500">
        Posez une question en langage naturel ; la réponse s'appuie uniquement sur les documents de
        votre cabinet, avec les sources citées.
      </p>
      <div className="mt-6">
        <RechercheClient />
      </div>
    </section>
  );
}
