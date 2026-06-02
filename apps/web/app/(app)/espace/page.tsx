import { getCurrentUser } from "@zarya/auth";
import { client as clientTable, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";

// Accueil du mini-dashboard client (F2 — coquille). Les pages de contenu (Mon entreprise,
// Mes employés, validations…) et l'état d'onboarding détaillé arrivent en F8 (+ F6 pour la
// session d'onboarding). Ici : un accueil minimal scopé au client du contact.
export default async function EspaceAccueilPage() {
  const user = await getCurrentUser();
  const client_id = user?.app_metadata.client_id as string | undefined;
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;

  let nomEntreprise = "votre entreprise";
  if (client_id && cabinet_id) {
    const [cli] = await db
      .select({ raison_sociale: clientTable.raison_sociale })
      .from(clientTable)
      .where(and(eq(clientTable.id, client_id), eq(clientTable.cabinet_id, cabinet_id)))
      .limit(1);
    if (cli?.raison_sociale) nomEntreprise = cli.raison_sociale;
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Bienvenue</h1>
      <p className="mt-2 text-gray-600">
        Votre espace pour <strong>{nomEntreprise}</strong>. Vous y suivrez vos documents, vos
        employés et les validations demandées par votre fiduciaire.
      </p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">
          Votre espace se met en place. Les sections (Mon entreprise, Mes employés, Validations,
          Documents) s'activeront au fur et à mesure.
        </p>
      </div>
    </section>
  );
}
