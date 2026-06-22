"use server";

import { requireAuth } from "@zarya/auth";
import {
  and,
  client,
  db,
  eq,
  evenement,
  paramComptable,
  vaultCreateSecret,
  vaultUpdateSecret,
} from "@zarya/db";
import { upsertAccesLogicielSchema } from "@zarya/schemas";
import { revalidatePath } from "next/cache";

// Lot 5 (ADR 0025 §6) — Credentials d'accès au logiciel comptable externe du client
// (crm.param_comptable.acces_logiciel_externe). ⚠️ ULTRA-SENSIBLE (ADR 0013) : chiffré au
// Vault (acces_logiciel_externe_vault_id), jamais en clair. Distinct du Lot 2 (logiciel /
// exercice / transmission, non sensibles) qui vit dans param-comptable/actions.ts.
//
// Sécurité : scope cabinet_id (anti-fuite), Zod, RBAC, audit.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type AccesLogicielActionState = { error?: string; success?: boolean };

export async function upsertAccesLogicielAction(
  _prev: AccesLogicielActionState,
  formData: FormData,
): Promise<AccesLogicielActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = upsertAccesLogicielSchema.safeParse({
    client_id: formData.get("client_id"),
    acces_logiciel_externe: formData.get("acces_logiciel_externe"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { client_id, acces_logiciel_externe } = parsed.data;

  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable" };

  // Charge l'éventuel secret existant (param_comptable est 1-1, client_id = PK).
  const [existing] = await db
    .select({ vault_id: paramComptable.acces_logiciel_externe_vault_id })
    .from(paramComptable)
    .where(and(eq(paramComptable.client_id, client_id), eq(paramComptable.cabinet_id, cabinet_id)))
    .limit(1);

  let vaultId: string;
  if (existing?.vault_id) {
    await vaultUpdateSecret(existing.vault_id, acces_logiciel_externe);
    vaultId = existing.vault_id;
  } else {
    vaultId = await vaultCreateSecret(
      acces_logiciel_externe,
      `crm/param_comptable/acces_logiciel/${client_id}/${Date.now()}`,
      `Credentials logiciel comptable (cabinet ${cabinet_id})`,
    );
  }

  await db
    .insert(paramComptable)
    .values({ client_id, cabinet_id, acces_logiciel_externe_vault_id: vaultId })
    .onConflictDoUpdate({
      target: paramComptable.client_id,
      set: { acces_logiciel_externe_vault_id: vaultId, updated_at: new Date() },
    });

  await db.insert(evenement).values({
    cabinet_id,
    client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.param_comptable",
    ressource_id: client_id,
    description: "Accès logiciel comptable externe enregistré (chiffré)",
    metadata: { champ: "acces_logiciel_externe" },
  });

  revalidatePath(`/app/clients/${client_id}`);
  return { success: true };
}
