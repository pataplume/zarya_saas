"use server";

// Écran /parametres/integrations — server actions (déconnexion + accusé région D3).
// Scopées cabinet via getCurrentUser ; mutations réservées au rôle responsable.
import { getCurrentUser } from "@zarya/auth";
import {
  acknowledgeTenantRegion,
  archiveMicrosoftIntegration,
  sendCabinetEmail,
} from "@zarya/integrations";
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

/**
 * Envoie un email de test à l'utilisateur courant via la boîte Microsoft du cabinet,
 * pour vérifier concrètement que l'envoi fonctionne avant qu'un vrai client reçoive
 * une relance. Pas de donnée persistée : le statut retourné à l'UI suffit.
 */
export async function testerEnvoiAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;

  const user = await getCurrentUser();
  const email = user?.email;
  if (!email) {
    return { error: "Impossible de déterminer votre adresse email." };
  }

  const result = await sendCabinetEmail(auth.cabinet_id, {
    to: [email],
    subject: "Test d'envoi ZARYA",
    body: "Cet email confirme que l'envoi depuis votre boîte Microsoft connectée fonctionne. Vous pouvez l'ignorer.",
    bodyType: "Text",
  });

  switch (result.status) {
    case "sent":
      return { success: true };
    case "revoked":
      return { error: "Connexion Microsoft expirée ou révoquée — reconnectez-vous ci-dessus." };
    default:
      return {
        error: `Échec de l'envoi (${result.code}). Vérifiez la connexion Microsoft du cabinet.`,
      };
  }
}
