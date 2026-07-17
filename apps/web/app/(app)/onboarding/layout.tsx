import { getCurrentUser } from "@zarya/auth";
import { db, sessionOnboardingFiduciaire } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// Étapes du wizard avec leur chemin et label
const ETAPES = [
  { label: "Identité", href: "/onboarding/identite", numero: 1 },
  { label: "Équipe", href: "/onboarding/equipe", numero: 2 },
  { label: "Activation", href: "/onboarding/import", numero: 3 },
] as const;

interface Props {
  children: React.ReactNode;
}

export default async function OnboardingLayout({ children }: Props) {
  const user = await getCurrentUser();

  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    // Authentifié sans cabinet (provisioning échoué au signup) → self-heal P0-8.
    // (Rediriger vers /login bouclait à l'infini : le middleware renvoie un
    // utilisateur connecté de /login vers /app, qui renvoie ici.)
    redirect("/auth/reparer");
  }

  // Si l'onboarding est déjà terminé, rediriger vers l'app
  const [session] = await db
    .select({ statut: sessionOnboardingFiduciaire.statut })
    .from(sessionOnboardingFiduciaire)
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id))
    .limit(1);

  if (session?.statut === "actif") {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* En-tête wizard */}
      <header className="border-b border-slate-200 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold tracking-tight text-slate-900">ZARYA</span>
          <span className="text-sm text-slate-500">Configuration de votre cabinet</span>
        </div>
      </header>

      {/* Barre de progression */}
      <div className="border-b border-slate-200 bg-card">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <nav aria-label="Étapes d'onboarding">
            <ol className="flex items-center gap-0">
              {ETAPES.map((etape, idx) => (
                <li key={etape.href} className="flex flex-1 items-center">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 text-xs font-semibold text-slate-500">
                      {etape.numero}
                    </span>
                    <span className="text-sm font-medium text-slate-500">{etape.label}</span>
                  </div>
                  {idx < ETAPES.length - 1 && (
                    <div className="mx-3 flex-1 border-t border-slate-200" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>

      {/* Contenu */}
      <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
    </div>
  );
}
