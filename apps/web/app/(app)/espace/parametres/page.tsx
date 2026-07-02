import { getCurrentUser } from "@zarya/auth";
import { Button } from "@/components/ui/button";
import { getEspaceClientContext } from "@/lib/espace-context";
import { DemandeSuppressionForm } from "./demande-suppression-form";
import { ProfilForm } from "./profil-form";

// F8 — Paramètres (dashboard-client.md §11). Profil utilisateur.
// C5.2 — profil éditable (nom, mot de passe, e-mail) + export RGPD (portabilité).
// Run I1 — demande de suppression d'accès (routée vers le cabinet responsable du traitement).
export default async function EspaceParametresPage() {
  const { email } = await getEspaceClientContext();
  const user = await getCurrentUser();
  const nomActuel = (user?.user_metadata?.display_name as string | undefined)?.trim() ?? "";

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Paramètres</h1>

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Mon profil
      </h2>
      <div className="mt-2">
        <ProfilForm emailActuel={email} nomActuel={nomActuel} />
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Mes données personnelles
      </h2>

      <div className="mt-2 rounded-lg border border-border bg-card p-5 shadow-card">
        <p className="text-sm font-medium text-foreground">Exporter mes données</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Téléchargez une copie des données vous concernant (entreprise, employés, documents
          transmis, périodes de salaire) au format JSON. Les numéros AVS et IBAN ne sont jamais
          exportés en clair.
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <a href="/espace/parametres/export">Exporter mes données</a>
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-5 shadow-card">
        <p className="text-sm font-medium text-foreground">Supprimer mon accès</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Vous pouvez demander la suppression de votre accès. La demande est transmise à votre
          fiduciaire, responsable du traitement de vos données. Certaines données sont conservées
          puis anonymisées selon les obligations légales (audit, comptabilité).
        </p>
        <DemandeSuppressionForm />
      </div>
    </section>
  );
}
