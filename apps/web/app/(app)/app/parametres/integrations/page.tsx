import { getCurrentUser } from "@zarya/auth";
import { getMicrosoftIntegrationStatus } from "@zarya/integrations";
import { redirect } from "next/navigation";
import { IntegrationsClient } from "./integrations-client";

// Écran /parametres/integrations — porte d'entrée pour connecter Microsoft Graph par
// cabinet (Bloc D livré). Statut lu sans déchiffrer les tokens. Réf : PLAN-MVP-BETA
// (Horizon 2) ; docs/architecture/microsoft-integration.md ; ADR 0018 (app Azure) / D3.
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ microsoft?: string; region?: string; detail?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");
  const role = (user?.app_metadata.role as string | undefined) ?? "collaborateur";

  const status = await getMicrosoftIntegrationStatus(cabinet_id);
  const sp = await searchParams;

  return (
    <IntegrationsClient
      isResponsable={role === "responsable"}
      connected={status.connected}
      statut={status.statut}
      derniereErreur={status.derniere_erreur}
      params={status.parametres}
      callback={{
        microsoft: sp.microsoft ?? null,
        region: sp.region ?? null,
        detail: sp.detail ?? null,
      }}
    />
  );
}
