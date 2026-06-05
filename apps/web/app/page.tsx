import { getCurrentUser } from "@zarya/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

// Run D1 — page d'entrée : Se connecter + Demander un accès (pas de signup public ; l'accès
// se fait sur demande / invitation). Détails de contenu à venir : LANDING-NOTES.md.
export default async function HomePage() {
  // Un utilisateur déjà connecté est renvoyé vers son espace de travail.
  const user = await getCurrentUser();
  if (user?.app_metadata.cabinet_id) {
    redirect(user.app_metadata.role === "client_contact" ? "/espace" : "/app");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">ZARYA</h1>
        <p className="mt-3 text-sm text-slate-500">
          Le co-pilote opérationnel des fiduciaires suisses.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Se connecter
          </Link>
          <Link
            href="/demande-acces"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            Demander un accès
          </Link>
        </div>
      </div>
    </main>
  );
}
