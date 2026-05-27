import { getCurrentUser } from "@zarya/auth";
import { db, sessionOnboardingFiduciaire } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// Layout du dashboard principal — exige que l'onboarding soit terminé.
// Le parent (app)/layout.tsx a déjà vérifié l'authentification.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  // Vérifie le statut onboarding depuis la DB
  const [session] = await db
    .select({ statut: sessionOnboardingFiduciaire.statut })
    .from(sessionOnboardingFiduciaire)
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id))
    .limit(1);

  if (!session || session.statut !== "actif") {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
