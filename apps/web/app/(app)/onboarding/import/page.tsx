import { requireAuth } from "@zarya/auth";
import { db, sessionOnboardingFiduciaire } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// Action serveur : marquer onboarding comme actif (skip import)
async function activerCabinetAction() {
  "use server";
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/login");

  await db
    .update(sessionOnboardingFiduciaire)
    .set({
      statut: "actif",
      etape_f_differee_at: new Date(),
      date_completion: new Date(),
      date_derniere_activite: new Date(),
      updated_at: new Date(),
    })
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id));

  redirect("/app");
}

export default async function ImportPage() {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/login");

  const [session] = await db
    .select({ statut: sessionOnboardingFiduciaire.statut })
    .from(sessionOnboardingFiduciaire)
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id))
    .limit(1);

  // Vérifier que l'étape B est bien terminée
  const etapesBlocantes = [
    "inscrit",
    "email_verifie",
    "etape_a_en_cours",
    "etape_a_terminee",
    "etape_b_en_cours",
  ];
  if (!session || etapesBlocantes.includes(session.statut)) {
    redirect("/onboarding/identite");
  }

  return (
    <div className="space-y-8">
      {/* En-tête étape */}
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Étape 3 / 3
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Import de votre portefeuille</h1>
        <p className="mt-1 text-sm text-gray-500">
          Importez vos clients existants depuis vos logiciels actuels. Cette étape nécessite une
          session d&apos;accompagnement avec l&apos;équipe ZARYA.
        </p>
      </div>

      {/* Card principale */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-gray-900">
          Réservez une session d&apos;import avec notre équipe
        </h2>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Un consultant ZARYA vous accompagnera pendant 1h pour importer votre portefeuille existant
          (50–200 clients) et configurer votre espace de travail.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {/* Bouton Calendly (placeholder) */}
          <a
            href="https://calendly.com/zarya"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Réserver une session
          </a>

          {/* Skip / différer */}
          <form action={activerCabinetAction}>
            <button
              type="submit"
              className="text-sm text-gray-500 underline hover:text-gray-700 focus:outline-none"
            >
              Accéder à ZARYA maintenant
            </button>
          </form>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Vous pourrez toujours importer votre portefeuille plus tard depuis les paramètres de votre
          cabinet.
        </p>
      </div>

      {/* Run E1 — Connecter la messagerie Microsoft 365 (optionnel, depuis l'onboarding) */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Connectez votre messagerie Microsoft 365
            </h2>
            <p className="mt-1 text-sm text-gray-500 max-w-md">
              Pour que ZARYA ingère les emails de vos clients et envoie les relances depuis votre
              boîte. Optionnel — vous pourrez aussi le faire plus tard depuis les paramètres.
            </p>
          </div>
          <a
            href="/app/parametres/integrations"
            className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Connecter
          </a>
        </div>
      </div>

      {/* Note Phase 3 — import automatisé */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs text-amber-800">
          <span className="font-medium">🚧 Phase 3 (à venir) :</span> L&apos;import automatisé
          depuis vos logiciels (Bexio, Crésus, WinBIZ) sera disponible dans une prochaine version.
          En attendant, notre équipe vous accompagne lors d&apos;une session dédiée.
        </p>
      </div>

      {/* Note sur ce qui a été configuré */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="text-sm font-medium text-green-800">
          ✓ Votre cabinet est configuré et prêt à l&apos;emploi
        </h3>
        <p className="mt-1 text-xs text-green-700">
          L&apos;import du portefeuille est optionnel au démarrage. Vous pouvez ajouter vos clients
          un par un ou via import ultérieur.
        </p>
      </div>
    </div>
  );
}
