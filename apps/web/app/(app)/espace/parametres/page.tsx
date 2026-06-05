import { getEspaceClientContext } from "@/lib/espace-context";
import { DemandeSuppressionForm } from "./demande-suppression-form";

// F8 — Paramètres (dashboard-client.md §11). Profil utilisateur (lecture seule au MVP).
// Run I1 — demande de suppression d'accès (routée vers le cabinet responsable du traitement).
export default async function EspaceParametresPage() {
  const { email } = await getEspaceClientContext();

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Paramètres</h1>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">Adresse de connexion</p>
        <p className="text-base font-medium text-gray-900">{email ?? "—"}</p>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-900">Mes données personnelles</p>
        <p className="mt-1 text-sm text-gray-600">
          Vous pouvez demander la suppression de votre accès. La demande est transmise à votre
          fiduciaire, responsable du traitement de vos données. Certaines données sont conservées
          puis anonymisées selon les obligations légales (audit, comptabilité).
        </p>
        <DemandeSuppressionForm />
      </div>
    </section>
  );
}
