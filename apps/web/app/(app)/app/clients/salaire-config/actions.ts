"use server";

import { requireAuth } from "@zarya/auth";
import { client as clientTable, db, salaireConfig, service } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// F5 — Onboarding client, étape 3a : configuration de la paie (onboarding-client §6.3).
// Le cabinet renseigne la config salaire d'un client → upsert crm.salaire_config (1-1 client).
// PRÉ-REQUIS : le service `salaires` doit être actif pour ce client (sinon on refuse) — la config
// paie n'a de sens que si la fiduciaire gère les salaires. Idempotent (upsert sur PK client_id).
// Scopé cabinet (anti-fuite). NE calcule PAS de paie (Bloc G = workflow, pas de moteur de paie).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

const FREQUENCES = ["mensuelle", "quinzomadaire", "hebdomadaire"] as const;
const LOGICIELS = [
  "bexio_payroll",
  "cresus_salaires",
  "winbiz_salaires",
  "abacus_lohn",
  "officemaker_staff",
  "swissdec",
  "autre",
  "aucun",
] as const;

export type SalaireConfigActionState = {
  error?: string;
  success?: boolean;
};

const Schema = z.object({
  client_id: z.string().uuid(),
  nombre_employes: z.coerce.number().int().min(0).max(100_000).optional(),
  frequence_paie: z.enum(FREQUENCES).default("mensuelle"),
  date_validation_jour_du_mois: z.coerce.number().int().min(1).max(31).optional(),
  contact_rh_id: z.string().uuid().optional(),
  logiciel_paie: z.enum(LOGICIELS).optional(),
  caisse_avs: z.string().trim().max(200).optional(),
  caisse_lpp: z.string().trim().max(200).optional(),
  assurance_accidents: z.string().trim().max(200).optional(),
  assurance_ijm: z.string().trim().max(200).optional(),
  envoi_automatique_relance: z.coerce.boolean().optional(),
});

export async function configurerSalaireConfigAction(
  _prev: SalaireConfigActionState,
  formData: FormData,
): Promise<SalaireConfigActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const raw = (key: string) => {
    const v = formData.get(key);
    return v === null || v === "" ? undefined : v;
  };
  const parsed = Schema.safeParse({
    client_id: formData.get("client_id"),
    nombre_employes: raw("nombre_employes"),
    frequence_paie: raw("frequence_paie") ?? "mensuelle",
    date_validation_jour_du_mois: raw("date_validation_jour_du_mois"),
    contact_rh_id: raw("contact_rh_id"),
    logiciel_paie: raw("logiciel_paie"),
    caisse_avs: raw("caisse_avs"),
    caisse_lpp: raw("caisse_lpp"),
    assurance_accidents: raw("assurance_accidents"),
    assurance_ijm: raw("assurance_ijm"),
    envoi_automatique_relance: raw("envoi_automatique_relance"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const v = parsed.data;

  // Scope : le client appartient bien au cabinet ?
  const [cli] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(and(eq(clientTable.id, v.client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable." };

  // Pré-requis : service `salaires` actif pour ce client (config paie inutile sinon).
  const [svc] = await db
    .select({ id: service.id })
    .from(service)
    .where(
      and(
        eq(service.cabinet_id, cabinet_id),
        eq(service.client_id, v.client_id),
        eq(service.type, "salaires"),
        eq(service.actif, true),
      ),
    )
    .limit(1);
  if (!svc) return { error: "Le service salaires n'est pas actif pour ce client." };

  // Champs optionnels : on n'écrit que ceux fournis (les colonnes nullables le restent).
  const champs = {
    ...(v.nombre_employes !== undefined ? { nombre_employes: v.nombre_employes } : {}),
    frequence_paie: v.frequence_paie,
    ...(v.date_validation_jour_du_mois !== undefined
      ? { date_validation_jour_du_mois: v.date_validation_jour_du_mois }
      : {}),
    ...(v.contact_rh_id !== undefined ? { contact_rh_id: v.contact_rh_id } : {}),
    ...(v.logiciel_paie !== undefined ? { logiciel_paie: v.logiciel_paie } : {}),
    ...(v.caisse_avs !== undefined ? { caisse_avs: v.caisse_avs } : {}),
    ...(v.caisse_lpp !== undefined ? { caisse_lpp: v.caisse_lpp } : {}),
    ...(v.assurance_accidents !== undefined ? { assurance_accidents: v.assurance_accidents } : {}),
    ...(v.assurance_ijm !== undefined ? { assurance_ijm: v.assurance_ijm } : {}),
    ...(v.envoi_automatique_relance !== undefined
      ? { envoi_automatique_relance: v.envoi_automatique_relance }
      : {}),
  };

  await db
    .insert(salaireConfig)
    .values({ client_id: v.client_id, cabinet_id, ...champs })
    .onConflictDoUpdate({
      target: salaireConfig.client_id,
      set: { ...champs, updated_at: new Date() },
    });

  revalidatePath("/app/clients");
  return { success: true };
}
