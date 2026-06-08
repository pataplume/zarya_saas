"use server";

import { requireAuth } from "@zarya/auth";
import { client as clientTable, db, documentAttendu, paramComptable, service } from "@zarya/db";
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

  revalidatePath("/app/clients");
  return { success: true, nb_services: nbServices, nb_documents: nbDocuments };
}
