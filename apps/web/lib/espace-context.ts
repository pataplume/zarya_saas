import { getCurrentUser } from "@zarya/auth";
import { redirect } from "next/navigation";

// F8 — Contexte client de l'espace : (cabinet_id, client_id) portés par l'app_metadata
// (server-controlled, F1). Le layout (app)/espace garde déjà role=client_contact ; ce helper
// est une défense en profondeur côté page + le point unique de résolution du scope.
export interface EspaceClientContext {
  cabinet_id: string;
  client_id: string;
  user_id: string;
  email: string | null;
}

export async function getEspaceClientContext(): Promise<EspaceClientContext> {
  const user = await getCurrentUser();
  const role = user?.app_metadata.role as string | undefined;
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  const client_id = user?.app_metadata.client_id as string | undefined;
  if (!user || role !== "client_contact" || !cabinet_id || !client_id) redirect("/app");
  return { cabinet_id, client_id, user_id: user.id, email: user.email ?? null };
}
