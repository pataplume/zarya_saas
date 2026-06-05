"use server";

// Run I1 — demande de suppression d'accès côté CLIENT (espace). N'effectue PAS de
// suppression : enregistre la demande (crm.demande_suppression cible='client') routée vers
// le cabinet, qui est responsable du traitement (droits-personnes.md §3.2). Le client_id et
// le cabinet_id viennent du contexte serveur (app_metadata), jamais du corps de requête.
import { db, demandeSuppression } from "@zarya/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEspaceClientContext } from "@/lib/espace-context";

const ESPACE_PARAMS_PATH = "/espace/parametres";

const schema = z.object({ motif: z.string().trim().max(2000).optional() });

export type SuppressionClientState = { error?: string; success?: boolean };

export async function demanderSuppressionClientAction(
  _prev: SuppressionClientState,
  formData: FormData,
): Promise<SuppressionClientState> {
  const { cabinet_id, client_id, user_id, email } = await getEspaceClientContext();

  const parsed = schema.safeParse({ motif: formData.get("motif") || undefined });
  if (!parsed.success) return { error: "Formulaire invalide." };

  await db.insert(demandeSuppression).values({
    cabinet_id,
    cible: "client",
    client_id,
    demandeur_user_id: user_id,
    demandeur_email: email,
    motif: parsed.data.motif ?? null,
  });

  revalidatePath(ESPACE_PARAMS_PATH);
  return { success: true };
}
