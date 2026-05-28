import { requireAuth } from "@zarya/auth";
import { redirect } from "next/navigation";

// Les routes protégées ne doivent jamais être pré-rendues statiquement
export const dynamic = "force-dynamic";

// Layout racine des routes protégées — vérifie uniquement l'authentification.
// Les redirections onboarding/app sont gérées par les sous-layouts.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAuth();
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
