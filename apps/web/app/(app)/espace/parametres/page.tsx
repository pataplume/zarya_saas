import { getEspaceClientContext } from "@/lib/espace-context";

// F8 — Paramètres (dashboard-client.md §11). Profil utilisateur (lecture seule au MVP).
// L'export RGPD / la suppression de compte (§11.3) sont DIFFÉRÉS (process conformité dédié).
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
          L'export de vos données et la suppression de votre compte (conformité nLPD/RGPD) seront
          disponibles prochainement. En attendant, adressez votre demande à votre fiduciaire.
        </p>
      </div>
    </section>
  );
}
