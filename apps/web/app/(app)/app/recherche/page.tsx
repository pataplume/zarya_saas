import { getCurrentUser } from "@zarya/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { RechercheClient } from "@/components/recherche/recherche-client";

// H4b — Page de recherche conversationnelle (RAG) fiduciaire. La récupération est strictement
// scopée au cabinet (server action answerQuestion). Réf : search.md §6 ; KICKOFF H4.
// `?q=` : question pré-remplie et exécutée (barre « demande à ZARYA » du dashboard).
export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user?.app_metadata.cabinet_id) redirect("/app");

  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Recherche"
        description="Posez une question en langage naturel ; la réponse s'appuie uniquement sur les documents de votre cabinet, avec les sources citées."
      />
      <RechercheClient questionInitiale={q} />
    </div>
  );
}
