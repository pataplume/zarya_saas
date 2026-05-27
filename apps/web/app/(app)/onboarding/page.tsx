import { getCurrentUser } from "@zarya/auth";
import { db, sessionOnboardingFiduciaire } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// Redirige vers l'étape courante du wizard
export default async function OnboardingIndexPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;

  if (!cabinet_id) {
    redirect("/login");
  }

  const [session] = await db
    .select({ statut: sessionOnboardingFiduciaire.statut })
    .from(sessionOnboardingFiduciaire)
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id))
    .limit(1);

  if (!session) {
    redirect("/login");
  }

  const { statut } = session;

  // Routing selon l'état de la session
  if (statut === "actif") redirect("/app");
  if (statut === "etape_b_terminee" || statut === "etape_f_en_cours")
    redirect("/onboarding/import");
  if (statut === "etape_a_terminee" || statut === "etape_b_en_cours")
    redirect("/onboarding/equipe");

  // Par défaut : étape A (identité)
  redirect("/onboarding/identite");
}
