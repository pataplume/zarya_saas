import { ActiverForm } from "./activer-form";

// Run C1 — activation d'un compte invité (membre ou contact RH client) : définir son mot de
// passe à la première connexion. `next` = destination après activation (/espace ou /app),
// validée côté serveur (anti open-redirect).
export default async function ActiverPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = next === "/espace" ? "/espace" : "/app";

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-xl font-semibold text-gray-900">Bienvenue sur ZARYA</h1>
      <p className="mt-1 text-sm text-gray-500">
        Pour activer votre compte, choisissez votre mot de passe.
      </p>
      <div className="mt-6">
        <ActiverForm next={dest} />
      </div>
    </div>
  );
}
