import { createSupabaseServerClient, getCurrentUser } from "@zarya/auth";
import { redirect } from "next/navigation";

export default async function AppHomePage() {
  const user = await getCurrentUser();

  // Logout action
  async function logoutAction() {
    "use server";
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900">ZARYA</h1>
        <p className="mt-2 text-sm text-gray-500">Bienvenue dans votre espace fiduciaire</p>

        {user && (
          <p className="mt-4 text-sm text-gray-700">
            Connecté en tant que <span className="font-medium">{user.email}</span>
          </p>
        )}

        <p className="mt-4 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Dashboard en cours de construction — Phase 1 MVP
        </p>

        <form action={logoutAction} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
