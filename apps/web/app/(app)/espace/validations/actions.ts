"use server";

import { requireClientContact } from "@zarya/auth";
import {
  and,
  client as clientTable,
  db,
  elementPaie,
  eq,
  evenementSalaire,
  periode as periodeTable,
  validationPeriode,
} from "@zarya/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STATUTS_EDITABLES } from "@/lib/periode-client-data";

// G3a — Dashboard client : compléter & valider la période (flow E §4). Le contact RH client
// saisit les éléments de paie et valide la période. Édition partagée last-write-wins : chaque
// écriture trace periode.derniere_modification_*. Scopé (cabinet_id, client_id) via app_metadata.

export type PeriodeActionState = { error?: string; success?: boolean };

/** Vérifie que la période appartient au client connecté et qu'elle est encore éditable. */
async function chargerPeriodeEditable(
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [p] = await db
    .select({ statut: periodeTable.statut })
    .from(periodeTable)
    .where(
      and(
        eq(periodeTable.id, periode_id),
        eq(periodeTable.cabinet_id, cabinet_id),
        eq(periodeTable.client_id, client_id),
      ),
    )
    .limit(1);
  if (!p) return { ok: false, error: "Période introuvable." };
  if (!STATUTS_EDITABLES.has(p.statut))
    return { ok: false, error: "Période déjà validée ou clôturée." };
  return { ok: true };
}

async function tracerModification(periode_id: string, acteur_id: string): Promise<void> {
  const now = new Date();
  await db
    .update(periodeTable)
    .set({
      derniere_modification_par: "client",
      derniere_modification_acteur_id: acteur_id,
      derniere_modification_at: now,
      updated_at: now,
    })
    .where(eq(periodeTable.id, periode_id));
}

const SaisieSchema = z.object({
  periode_id: z.string().uuid(),
  employe_id: z.string().uuid(),
  type_element_id: z.string().uuid(),
  valeur_numerique: z.coerce.number().finite(),
});

/** Saisit/modifie un élément de paie (employé × type) pour la période. Upsert. */
export async function saisirElementPaieAction(
  _prev: PeriodeActionState,
  formData: FormData,
): Promise<PeriodeActionState> {
  const { user, client_id } = await requireClientContact();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };

  const parsed = SaisieSchema.safeParse({
    periode_id: formData.get("periode_id"),
    employe_id: formData.get("employe_id"),
    type_element_id: formData.get("type_element_id"),
    valeur_numerique: formData.get("valeur_numerique"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const v = parsed.data;

  const editable = await chargerPeriodeEditable(cabinet_id, client_id, v.periode_id);
  if (!editable.ok) return { error: editable.error };

  // L'employé doit appartenir au client (anti-fuite). Le trigger DB garantit aussi la cohérence.
  const [emp] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(and(eq(clientTable.id, client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!emp) return { error: "Client introuvable." };

  await db
    .insert(elementPaie)
    .values({
      cabinet_id,
      client_id,
      periode_id: v.periode_id,
      employe_id: v.employe_id,
      type_element_id: v.type_element_id,
      valeur_numerique: v.valeur_numerique.toString(),
      source: "client_dashboard",
      modifie_par_acteur_type: "client",
      modifie_par_acteur_id: user.id,
    })
    .onConflictDoUpdate({
      target: [elementPaie.periode_id, elementPaie.employe_id, elementPaie.type_element_id],
      set: {
        valeur_numerique: v.valeur_numerique.toString(),
        source: "client_dashboard",
        modifie_par_acteur_type: "client",
        modifie_par_acteur_id: user.id,
        updated_at: new Date(),
      },
    });

  await tracerModification(v.periode_id, user.id);
  revalidatePath("/espace/validations");
  return { success: true };
}

const ValiderSchema = z.object({
  periode_id: z.string().uuid(),
  sans_changement: z.coerce.boolean().optional(),
});

/** Valide la période (1-clic « rien à signaler » ou « valider ») → statut validee. */
export async function validerPeriodeClientAction(
  _prev: PeriodeActionState,
  formData: FormData,
): Promise<PeriodeActionState> {
  const { user, client_id } = await requireClientContact();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };

  const parsed = ValiderSchema.safeParse({
    periode_id: formData.get("periode_id"),
    sans_changement: formData.get("sans_changement") ?? undefined,
  });
  if (!parsed.success) return { error: "Période invalide." };
  const v = parsed.data;

  const editable = await chargerPeriodeEditable(cabinet_id, client_id, v.periode_id);
  if (!editable.ok) return { error: editable.error };

  const now = new Date();
  await db.insert(validationPeriode).values({
    cabinet_id,
    client_id,
    periode_id: v.periode_id,
    valide_par_type: "client",
    methode: "dashboard",
    sans_changement_confirme: v.sans_changement ?? false,
  });
  await db
    .update(periodeTable)
    .set({
      statut: "validee",
      date_validation_recue: now,
      sans_changement_declare: v.sans_changement ?? false,
      derniere_modification_par: "client",
      derniere_modification_acteur_id: user.id,
      derniere_modification_at: now,
      updated_at: now,
    })
    .where(eq(periodeTable.id, v.periode_id));
  await db.insert(evenementSalaire).values({
    cabinet_id,
    client_id,
    periode_id: v.periode_id,
    type: "validation_recue_client",
    acteur_type: "humain_client",
    acteur_id: user.id,
  });

  revalidatePath("/espace/validations");
  return { success: true };
}
