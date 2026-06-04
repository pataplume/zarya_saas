"use server";

// Écran /parametres/integrations — server actions (déconnexion + accusé région D3).
// Scopées cabinet via getCurrentUser ; mutations réservées au rôle responsable.
import { getCurrentUser } from "@zarya/auth";
import { acknowledgeTenantRegion, archiveMicrosoftIntegration } from "@zarya/integrations";
import { revalidatePath } from "next/cache";

const PATH = "/app/parametres/integrations";

type ActionState = { error?: string; success?: boolean };

async function requireResponsable(): Promise<
  { cabinet_id: string; user_id: string } | { error: string }
> {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!user || !cabinet_id) return { error: "Non autorisé." };
  const role = (user.app_metadata.role as string | undefined) ?? "collaborateur";
  if (role !== "responsable") {
    return { error: "Seul un responsable peut gérer les intégrations du cabinet." };
  }
  return { cabinet_id, user_id: user.id };
}

/** Déconnecte l'intégration Microsoft du cabinet (archive + suppression du secret Vault). */
export async function disconnectMicrosoftAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;
  try {
    await archiveMicrosoftIntegration(auth.cabinet_id);
    revalidatePath(PATH);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de la déconnexion." };
  }
}

/** Accuse réception de l'avertissement région hors zone (D3) : « je continue ». */
export async function acknowledgeRegionAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;
  try {
    await acknowledgeTenantRegion(auth.cabinet_id, { id: auth.user_id, type: "membre" });
    revalidatePath(PATH);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de l'accusé de réception." };
  }
}
