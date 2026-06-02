import { getCurrentUser } from "@zarya/auth";
import { cabinet, db, sessionOnboardingFiduciaire } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Layout du dashboard principal — exige que l'onboarding soit terminé.
 * Le parent (app)/layout.tsx a déjà vérifié l'authentification.
 *
 * Récupère les données cabinet pour alimenter la sidebar.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Un contact RH client n'a rien à faire dans le dashboard fiduciaire → mini-dashboard (F2).
  if ((user?.app_metadata.role as string | undefined) === "client_contact") {
    redirect("/espace");
  }

  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  // Vérification onboarding + données cabinet en parallèle
  const [sessionResult, cabinetResult] = await Promise.all([
    db
      .select({ statut: sessionOnboardingFiduciaire.statut })
      .from(sessionOnboardingFiduciaire)
      .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id))
      .limit(1),
    db
      .select({ raison_sociale: cabinet.raison_sociale })
      .from(cabinet)
      .where(eq(cabinet.id, cabinet_id))
      .limit(1),
  ]);

  const [session] = sessionResult;
  if (!session || session.statut !== "actif") {
    redirect("/onboarding");
  }

  const [cabinetData] = cabinetResult;
  const cabinetName = cabinetData?.raison_sociale ?? "Mon cabinet";
  const userEmail = user?.email ?? "";
  const userRole = (user?.app_metadata.role as string | undefined) ?? "collaborateur";

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar cabinetName={cabinetName} userEmail={userEmail} userRole={userRole} />

      {/* Main content — offset de la sidebar sur desktop */}
      <main className="lg:pl-64">
        {/* Espace pour la topbar mobile */}
        <div className="h-14 lg:hidden" />
        {children}
      </main>
    </div>
  );
}
