"use server";

import { requireAuth } from "@zarya/auth";
import { and, client as clientTable, db, eq, sessionOnboarding } from "@zarya/db";
import { terminerOnboarding } from "@zarya/extraction";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// F6d — Clôture de l'onboarding client (onboarding-client §2/§8). Termine la session si
// terminable (aucune proposition en attente + ≥1 employé validé). L'onboarding est BLOQUANT :
// le futur Bloc G appellera assertOnboardingTermine avant toute création de période salaire.
// AUTH + RBAC + scope cabinet/client.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type TerminerOnboardingState = { error?: string; success?: boolean };

const Schema = z.object({ client_id: z.string().uuid() });

export async function terminerOnboardingAction(
  _prev: TerminerOnboardingState,
  formData: FormData,
): Promise<TerminerOnboardingState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const parsed = Schema.safeParse({ client_id: formData.get("client_id") });
  if (!parsed.success) return { error: "Client invalide." };

  // Scope : le client appartient au cabinet ? + récupération de sa session.
  const [row] = await db
    .select({ session_id: sessionOnboarding.id })
    .from(sessionOnboarding)
    .innerJoin(clientTable, eq(clientTable.id, sessionOnboarding.client_id))
    .where(
      and(
        eq(sessionOnboarding.client_id, parsed.data.client_id),
        eq(sessionOnboarding.cabinet_id, cabinet_id),
        eq(clientTable.cabinet_id, cabinet_id),
      ),
    )
    .limit(1);
  if (!row) return { error: "Session d'onboarding introuvable." };

  try {
    await terminerOnboarding(cabinet_id, row.session_id);
    revalidatePath("/app/clients");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec de la clôture." };
  }
}
