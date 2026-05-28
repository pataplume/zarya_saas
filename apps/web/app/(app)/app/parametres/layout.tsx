import { ParametresTabs } from "./nav-tabs";

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configurez votre cabinet et gérez votre équipe.
        </p>
      </div>

      {/* Onglets */}
      <div className="mb-8">
        <ParametresTabs />
      </div>

      {/* Contenu de l'onglet actif */}
      {children}
    </div>
  );
}
