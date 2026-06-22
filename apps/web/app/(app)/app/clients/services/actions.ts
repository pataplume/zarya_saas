"use server";

import { requireAuth } from "@zarya/auth";
import { genererEcheancesPourClient } from "@zarya/calendar";
import {
  client as clientTable,
  db,
  documentAttendu,
  evenement,
  paramComptable,
  service,
} from "@zarya/db";
import { createServiceSchema, supprimerServiceSchema, updateServiceSchema } from "@zarya/schemas";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ClientType,
  checklistPourServices,
  type ServiceType,
} from "@/lib/checklist-onboarding";

// F4 — Configuration services + paramètres + checklist documents (onboarding-client §6).
// Le cabinet active les services souscrits d'un client → crée crm.service (+ crm.param_comptable
// si comptabilité) → applique la checklist CODÉE (checklistPourServices) → crée crm.document_attendu.
// Idempotent (ne recrée pas un service/document déjà présent). Scopé cabinet (anti-fuite).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

const SERVICES = ["comptabilite", "fiscalite", "salaires", "tva", "bouclement", "conseil"] as const;
const FREQUENCE_DEFAUT: Record<
  ServiceType,
  "mensuelle" | "trimestrielle" | "annuelle" | "ponctuelle"
> = {
  comptabilite: "mensuelle",
  tva: "trimestrielle",
  salaires: "mensuelle",
  bouclement: "annuelle",
  fiscalite: "annuelle",
  conseil: "ponctuelle",
};

export type ServicesActionState = {
  error?: string;
  success?: boolean;
  nb_services?: number;
  nb_documents?: number;
};

const Schema = z.object({
  client_id: z.string().uuid(),
  services: z.array(z.enum(SERVICES)).min(1, "Sélectionnez au moins un service"),
  compta_logiciel: z
    .enum(["bexio", "abacus", "cresus", "winbiz", "banana", "excel", "officemaker", "autre"])
    .optional(),
  compta_plan: z.string().trim().optional(),
  tva_regime: z.string().trim().optional(),
  tva_frequence: z.enum(["trimestrielle", "semestrielle"]).optional(),
});

export async function configurerServicesClientAction(
  _prev: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const parsed = Schema.safeParse({
    client_id: formData.get("client_id"),
    services: formData.getAll("services"),
    compta_logiciel: formData.get("compta_logiciel") ?? undefined,
    compta_plan: formData.get("compta_plan") ?? undefined,
    tva_regime: formData.get("tva_regime") ?? undefined,
    tva_frequence: formData.get("tva_frequence") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const v = parsed.data;

  // Scope : le client appartient au cabinet ? + son type pour la checklist.
  const [cli] = await db
    .select({ id: clientTable.id, type: clientTable.type })
    .from(clientTable)
    .where(and(eq(clientTable.id, v.client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable." };

  // Services déjà présents (idempotence).
  const existants = await db
    .select({ type: service.type, id: service.id })
    .from(service)
    .where(and(eq(service.cabinet_id, cabinet_id), eq(service.client_id, v.client_id)));
  const serviceIdParType = new Map<string, string>(existants.map((s) => [s.type, s.id]));

  let nbServices = 0;
  for (const type of v.services) {
    if (serviceIdParType.has(type)) continue;
    const parametres =
      type === "comptabilite"
        ? { logiciel: v.compta_logiciel ?? null, plan_comptable: v.compta_plan ?? null }
        : type === "tva"
          ? { regime: v.tva_regime ?? null }
          : null;
    const frequence =
      type === "tva" ? (v.tva_frequence ?? "trimestrielle") : FREQUENCE_DEFAUT[type];
    const [inserted] = await db
      .insert(service)
      .values({ cabinet_id, client_id: v.client_id, type, actif: true, frequence, parametres })
      .returning({ id: service.id });
    if (inserted) {
      serviceIdParType.set(type, inserted.id);
      nbServices++;
    }
  }

  // Paramètres comptables (1-1 client) si comptabilité activée.
  if (v.services.includes("comptabilite")) {
    await db
      .insert(paramComptable)
      .values({
        client_id: v.client_id,
        cabinet_id,
        ...(v.compta_logiciel ? { logiciel: v.compta_logiciel } : {}),
        ...(v.compta_plan ? { plan_comptable: v.compta_plan } : {}),
      })
      .onConflictDoUpdate({
        target: paramComptable.client_id,
        set: {
          ...(v.compta_logiciel ? { logiciel: v.compta_logiciel } : {}),
          ...(v.compta_plan ? { plan_comptable: v.compta_plan } : {}),
          updated_at: new Date(),
        },
      });
  }

  // Checklist codée → crm.document_attendu (dédup par type_document déjà présent).
  const docsExistants = await db
    .select({ type_document: documentAttendu.type_document })
    .from(documentAttendu)
    .where(
      and(eq(documentAttendu.cabinet_id, cabinet_id), eq(documentAttendu.client_id, v.client_id)),
    );
  const dejaPresents = new Set(docsExistants.map((d) => d.type_document));

  let nbDocuments = 0;
  for (const doc of checklistPourServices(cli.type as ClientType, v.services)) {
    if (dejaPresents.has(doc.type_document)) continue;
    await db.insert(documentAttendu).values({
      cabinet_id,
      client_id: v.client_id,
      service_id: doc.service ? (serviceIdParType.get(doc.service) ?? null) : null,
      type_document: doc.type_document,
      type_code: doc.type_code,
      categorie: doc.categorie,
      frequence: doc.frequence,
      obligatoire: doc.obligatoire,
      actif: true,
    });
    dejaPresents.add(doc.type_document);
    nbDocuments++;
  }

  // Lot 2 (ADR 0025 / ADR 0011 Run 6) : maintenant que les services + documents attendus
  // existent, on matérialise les échéances récurrentes du client (idempotent).
  await genererEcheancesPourClient(cabinet_id, v.client_id);

  revalidatePath("/app/clients");
  revalidatePath(`/app/clients/${v.client_id}`);
  return { success: true, nb_services: nbServices, nb_documents: nbDocuments };
}

// ════════════════════════════════════════════════════════════════════════════
// Lot 2 (ADR 0025) — CRUD GRANULAIRE des services (crm.service) + moteur d'échéances.
// Complète l'action d'onboarding bulk ci-dessus par l'édition fine d'un service dans le
// dossier client éditable. Chaque mutation : scope cabinet_id (anti-fuite), Zod, audit
// crm.evenement, puis (re)génération idempotente des échéances. Le régime TVA vit dans
// service.parametres->>'regime_tva' (point d'extension lu par le moteur).
// ════════════════════════════════════════════════════════════════════════════

const ROLES_CRUD = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type ServiceCrudState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

function bool(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

async function gardeCrud(): Promise<{ cabinet_id: string; user_id: string } | { error: string }> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_CRUD.has(role)) return { error: "Action non autorisée pour votre rôle" };
  return { cabinet_id, user_id: user.id };
}

function parametresAvecRegime(regime_tva: string | undefined): Record<string, unknown> | null {
  return regime_tva ? { regime_tva } : null;
}

export async function createServiceAction(
  _prev: ServiceCrudState,
  formData: FormData,
): Promise<ServiceCrudState> {
  const garde = await gardeCrud();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = createServiceSchema.safeParse({
    client_id: formData.get("client_id"),
    type: formData.get("type") ?? undefined,
    frequence: optionnel(formData.get("frequence")),
    regime_tva: optionnel(formData.get("regime_tva")),
    actif: formData.get("actif") == null ? undefined : bool(formData.get("actif")),
    notes: optionnel(formData.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { client_id, type, frequence, regime_tva, actif, notes } = parsed.data;

  const [cli] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(and(eq(clientTable.id, client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable" };

  try {
    await db.insert(service).values({
      cabinet_id,
      client_id,
      type,
      frequence: frequence ?? null,
      actif: actif ?? true,
      parametres: parametresAvecRegime(regime_tva),
      notes: notes ?? null,
    });
  } catch (_err) {
    return { error: "Un service actif de ce type existe déjà pour ce client" };
  }

  await db.insert(evenement).values({
    cabinet_id,
    client_id,
    type: "service_active",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.service",
    description: `Service activé : ${type}`,
    metadata: { type, frequence: frequence ?? null, regime_tva: regime_tva ?? null },
  });

  await genererEcheancesPourClient(cabinet_id, client_id);

  revalidatePath(`/app/clients/${client_id}`);
  return { success: true };
}

export async function updateServiceAction(
  _prev: ServiceCrudState,
  formData: FormData,
): Promise<ServiceCrudState> {
  const garde = await gardeCrud();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = updateServiceSchema.safeParse({
    id: formData.get("id"),
    frequence: optionnel(formData.get("frequence")),
    regime_tva: optionnel(formData.get("regime_tva")),
    actif: formData.get("actif") == null ? undefined : bool(formData.get("actif")),
    notes: optionnel(formData.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id, frequence, regime_tva, actif, notes } = parsed.data;

  const [cible] = await db
    .select({ id: service.id, client_id: service.client_id })
    .from(service)
    .where(and(eq(service.id, id), eq(service.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Service introuvable" };

  try {
    await db
      .update(service)
      .set({
        ...(frequence !== undefined ? { frequence } : {}),
        ...(actif !== undefined ? { actif } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(regime_tva !== undefined ? { parametres: parametresAvecRegime(regime_tva) } : {}),
        updated_at: new Date(),
      })
      .where(and(eq(service.id, id), eq(service.cabinet_id, cabinet_id)));
  } catch (_err) {
    return { error: "Un service actif de ce type existe déjà pour ce client" };
  }

  await db.insert(evenement).values({
    cabinet_id,
    client_id: cible.client_id,
    type: "service_active",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.service",
    ressource_id: id,
    description: "Service modifié",
    metadata: {
      frequence: frequence ?? null,
      regime_tva: regime_tva ?? null,
      actif: actif ?? null,
    },
  });

  // Re-génération idempotente (ne duplique pas, ne détruit pas l'historique traité).
  await genererEcheancesPourClient(cabinet_id, cible.client_id);

  revalidatePath(`/app/clients/${cible.client_id}`);
  return { success: true };
}

export async function supprimerServiceAction(
  _prev: ServiceCrudState,
  formData: FormData,
): Promise<ServiceCrudState> {
  const garde = await gardeCrud();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = supprimerServiceSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  const [cible] = await db
    .select({ id: service.id, client_id: service.client_id })
    .from(service)
    .where(and(eq(service.id, parsed.data.id), eq(service.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Service introuvable" };

  await db
    .update(service)
    .set({ actif: false, archived_at: new Date(), updated_at: new Date() })
    .where(and(eq(service.id, parsed.data.id), eq(service.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: cible.client_id,
    type: "service_active",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.service",
    ressource_id: cible.id,
    description: "Service désactivé",
  });

  revalidatePath(`/app/clients/${cible.client_id}`);
  return { success: true };
}
