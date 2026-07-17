"use server";

// P0-7 (AUDIT-MVP §8) — mini back-office des demandes d'accès (crm.demande_acces).
// Réservé aux admins plateforme ZARYA (PLATFORM_ADMIN_EMAILS, vérifié côté serveur —
// défense en profondeur : la page fait déjà notFound() pour les autres).
// Statuts permis : cf. ./statuts.ts (colonne text libre en DB, contrainte via Zod).
import { requireAuth } from "@zarya/auth";
import { db, demandeAcces } from "@zarya/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { STATUTS_DEMANDE_ACCES } from "./statuts";

const PATH = "/app/admin/demandes";

const changerStatutSchema = z.object({
  demandeId: z.string().uuid(),
  statut: z.enum(STATUTS_DEMANDE_ACCES),
});

/** Change le statut d'une demande d'accès (admin plateforme uniquement). */
export async function changerStatutDemandeAccesAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  // Garde serveur : silencieux (pas d'info à donner) si l'appelant n'est pas admin.
  if (!isPlatformAdmin(user.email, process.env.PLATFORM_ADMIN_EMAILS)) return;

  const parsed = changerStatutSchema.safeParse({
    demandeId: formData.get("demandeId"),
    statut: formData.get("statut"),
  });
  if (!parsed.success) return;

  await db
    .update(demandeAcces)
    .set({ statut: parsed.data.statut })
    .where(eq(demandeAcces.id, parsed.data.demandeId));

  revalidatePath(PATH);
}
