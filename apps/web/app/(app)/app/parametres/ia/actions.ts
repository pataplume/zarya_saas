"use server";

// IA-c — Activation de l'IA du cabinet (self-service responsable) + lecture des coûts.
// Le flag crm.cabinet.extraction_ia_active ne prend effet que si EXTRACTION_MODE=live
// (kill-switch global maître, ADR 0023). Mutations réservées au rôle responsable.
import { getCurrentUser } from "@zarya/auth";
import { cabinet, db, eq } from "@zarya/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const PATH = "/app/parametres/ia";

type ToggleState = { error?: string; success?: boolean };

const ToggleSchema = z.object({ active: z.enum(["true", "false"]) });

export async function toggleExtractionIaAction(
  _prev: ToggleState,
  formData: FormData,
): Promise<ToggleState> {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!user || !cabinet_id) return { error: "Non autorisé." };
  const role = (user.app_metadata.role as string | undefined) ?? "collaborateur";
  if (role !== "responsable") {
    return { error: "Seul un responsable peut activer ou désactiver l'IA du cabinet." };
  }

  const parsed = ToggleSchema.safeParse({ active: formData.get("active") });
  if (!parsed.success) return { error: "Valeur invalide." };

  await db
    .update(cabinet)
    .set({ extraction_ia_active: parsed.data.active === "true", updated_at: new Date() })
    .where(eq(cabinet.id, cabinet_id));
  revalidatePath(PATH);
  return { success: true };
}
