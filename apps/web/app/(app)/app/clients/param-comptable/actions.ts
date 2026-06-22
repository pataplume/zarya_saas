"use server";

import { requireAuth } from "@zarya/auth";
import { genererEcheancesPourClient } from "@zarya/calendar";
import { client, db, evenement, paramComptable } from "@zarya/db";
import { upsertParamComptableSchema } from "@zarya/schemas";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Lot 2 (ADR 0025) — Paramétrage comptable d'un client (crm.param_comptable, 1-1 client).
// Upsert granulaire (logiciel, plan, date_debut_exercice, date_bouclement, mode_transmission)
// depuis le dossier client éditable. Une modification du régime/bouclement peut faire bouger
// les échéances → re-génération idempotente après écriture.
//
// Sécurité : scope cabinet_id (anti-fuite, db service role bypasse la RLS), Zod, audit.
// ⚠️ `acces_logiciel_externe` (credentials) est EXCLU ici — réservé Lot 5 (Vault, ADR 0013).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type ParamComptableActionState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

export async function upsertParamComptableAction(
  _prev: ParamComptableActionState,
  formData: FormData,
): Promise<ParamComptableActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = upsertParamComptableSchema.safeParse({
    client_id: formData.get("client_id"),
    logiciel: optionnel(formData.get("logiciel")),
    logiciel_autre: optionnel(formData.get("logiciel_autre")),
    plan_comptable: optionnel(formData.get("plan_comptable")),
    date_debut_exercice: optionnel(formData.get("date_debut_exercice")),
    date_bouclement: optionnel(formData.get("date_bouclement")),
    mode_transmission: optionnel(formData.get("mode_transmission")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  const { client_id, ...champs } = parsed.data;

  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable" };

  // N'écrit que les champs fournis (les colonnes nullables restent inchangées sinon).
  const set = {
    ...(champs.logiciel !== undefined ? { logiciel: champs.logiciel } : {}),
    ...(champs.logiciel_autre !== undefined ? { logiciel_autre: champs.logiciel_autre } : {}),
    ...(champs.plan_comptable !== undefined ? { plan_comptable: champs.plan_comptable } : {}),
    ...(champs.date_debut_exercice !== undefined
      ? { date_debut_exercice: champs.date_debut_exercice }
      : {}),
    ...(champs.date_bouclement !== undefined ? { date_bouclement: champs.date_bouclement } : {}),
    ...(champs.mode_transmission !== undefined
      ? { mode_transmission: champs.mode_transmission }
      : {}),
  };

  await db
    .insert(paramComptable)
    .values({ client_id, cabinet_id, ...set })
    .onConflictDoUpdate({
      target: paramComptable.client_id,
      set: { ...set, updated_at: new Date() },
    });

  await db.insert(evenement).values({
    cabinet_id,
    client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.param_comptable",
    ressource_id: client_id,
    description: "Paramétrage comptable modifié",
    metadata: { champs: Object.keys(set) },
  });

  // Le régime/bouclement peut influencer les échéances (bouclement, TVA) → re-génération.
  await genererEcheancesPourClient(cabinet_id, client_id);

  revalidatePath(`/app/clients/${client_id}`);
  return { success: true };
}
