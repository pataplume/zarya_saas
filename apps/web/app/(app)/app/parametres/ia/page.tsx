import { getCurrentUser } from "@zarya/auth";
import { cabinet, db, eq, vCoutParCabinet } from "@zarya/db";
import { resolveExtractionMode } from "@zarya/extraction";
import { redirect } from "next/navigation";
import { IaClient } from "./ia-client";

// IA-c — Onglet IA des paramètres cabinet : activer/désactiver l'IA du cabinet (self-service
// responsable) + suivi des coûts. L'effet réel dépend du kill-switch global EXTRACTION_MODE
// (ADR 0023). Coûts lus via la vue extraction.v_cout_par_cabinet.
export default async function IaPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");
  const role = (user?.app_metadata.role as string | undefined) ?? "collaborateur";

  const [cab] = await db
    .select({ active: cabinet.extraction_ia_active })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);

  const [cout] = await db
    .select({
      nb_invocations: vCoutParCabinet.nb_invocations,
      cout_usd_total: vCoutParCabinet.cout_usd_total,
      tokens_input_total: vCoutParCabinet.tokens_input_total,
      tokens_output_total: vCoutParCabinet.tokens_output_total,
      derniere_invocation_at: vCoutParCabinet.derniere_invocation_at,
    })
    .from(vCoutParCabinet)
    .where(eq(vCoutParCabinet.cabinet_id, cabinet_id))
    .limit(1);

  return (
    <IaClient
      isResponsable={role === "responsable"}
      cabinetActive={cab?.active ?? false}
      globalLive={resolveExtractionMode() === "live"}
      cout={
        cout
          ? {
              nb_invocations: Number(cout.nb_invocations),
              cout_usd_total: cout.cout_usd_total,
              tokens_input_total: Number(cout.tokens_input_total),
              tokens_output_total: Number(cout.tokens_output_total),
              derniere_invocation_at: cout.derniere_invocation_at
                ? cout.derniere_invocation_at.toISOString()
                : null,
            }
          : null
      }
    />
  );
}
