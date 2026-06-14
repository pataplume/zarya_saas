"use server";

import { requireAuth } from "@zarya/auth";
import { db, propositionFacture, vaultGetSecret } from "@zarya/db";
import { finaliserFacture } from "@zarya/extraction";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Validation des factures — module Facture (facture.md §6, Bloc E5b). L'UI split-screen
// soumet les champs VALIDÉS par l'humain ; ces server actions ajoutent AUTH + SCOPE cabinet
// + RBAC, puis délèguent la création de l'entité finale à `finaliserFacture` (E5a) qui gère
// l'IBAN→Vault, la fraude RIB et les doublons. Anti-fuite : on re-vérifie systématiquement
// que la proposition appartient au cabinet de l'acteur (frontière réelle sur service-role).

const ROLES_VALIDATION = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);
const FACTURES_PATH = "/app/factures/validation";

export type FactureActionState = {
  error?: string;
  success?: boolean;
  iban_change_detecte?: boolean;
  doublons?: number;
};

function acteur(user: { id: string; app_metadata: Record<string, unknown> }) {
  return {
    id: user.id,
    cabinet_id: user.app_metadata.cabinet_id as string | undefined,
    role: (user.app_metadata.role as string | undefined) ?? "lecteur",
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optNullStr = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const ValiderSchema = z.object({
  proposition_id: z.string().uuid(),
  fournisseur_raison_sociale: z.string().trim().min(1, "Raison sociale requise"),
  fournisseur_ide: optNullStr,
  fournisseur_numero_tva: optNullStr,
  fournisseur_iban: optNullStr,
  fournisseur_bic: optNullStr,
  numero_facture: z.string().trim().min(1, "Numéro de facture requis"),
  date_emission: z.string().regex(DATE_RE, "Date d'émission AAAA-MM-JJ requise"),
  date_echeance: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .refine((v) => v === null || v === undefined || DATE_RE.test(v), "Date d'échéance invalide"),
  total_ht: z.coerce.number(),
  total_tva: z.coerce.number().default(0),
  total_ttc: z.coerce.number(),
  montant_a_payer: z.coerce.number(),
  taux_tva_principal: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .optional(),
  devise: z.enum(["CHF", "EUR", "USD", "autre"]).default("CHF"),
  iban_paiement: optNullStr,
  categorie: optNullStr,
  compte_charge: z.string().trim().min(1, "Compte de charge requis"),
});

/** Valide une proposition de facture → crée facture.facture + fournisseur (E5a). */
export async function validerFactureAction(
  _prev: FactureActionState,
  formData: FormData,
): Promise<FactureActionState> {
  const { id, cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const parsed = ValiderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const v = parsed.data;

  // Scope + état : la proposition doit appartenir au cabinet et être à valider.
  const [prop] = await db
    .select({
      id: propositionFacture.id,
      client_id: propositionFacture.client_id,
      statut: propositionFacture.statut,
      // IBAN-du-QR au Vault dès la proposition (C6.1) : on charge l'UUID du secret (scopé cabinet).
      iban_paiement_vault_id: propositionFacture.iban_paiement_vault_id,
    })
    .from(propositionFacture)
    .where(
      and(
        eq(propositionFacture.id, v.proposition_id),
        eq(propositionFacture.cabinet_id, cabinet_id),
      ),
    )
    .limit(1);
  if (!prop) return { error: "Proposition introuvable." };
  if (prop.statut !== "a_valider") return { error: "Proposition déjà traitée." };

  // IBAN de paiement : un IBAN saisi à la main PRIME (l'humain corrige). Sinon, si la proposition
  // porte un IBAN-du-QR au Vault, on le déchiffre EN MÉMOIRE (clair transitoire, jamais persisté
  // ni loggé) et on le passe à finaliserFacture (qui re-valide + re-chiffre pour la facture finale).
  let ibanPaiement = v.iban_paiement ?? null;
  if (!ibanPaiement && prop.iban_paiement_vault_id) {
    ibanPaiement = await vaultGetSecret(prop.iban_paiement_vault_id);
  }

  try {
    const res = await finaliserFacture({
      cabinet_id,
      client_id: prop.client_id,
      proposition_id: v.proposition_id,
      fournisseur: {
        raison_sociale: v.fournisseur_raison_sociale,
        ide: v.fournisseur_ide ?? null,
        numero_tva: v.fournisseur_numero_tva ?? null,
        iban: v.fournisseur_iban ?? null,
        bic: v.fournisseur_bic ?? null,
      },
      numero_facture: v.numero_facture,
      date_emission: v.date_emission,
      date_echeance: v.date_echeance ?? null,
      total_ht: v.total_ht,
      total_tva: v.total_tva,
      total_ttc: v.total_ttc,
      montant_a_payer: v.montant_a_payer,
      taux_tva_principal: v.taux_tva_principal ?? null,
      devise: v.devise,
      iban_paiement: ibanPaiement,
      categorie: v.categorie ?? null,
      compte_charge: v.compte_charge,
      acteur_id: id,
    });
    revalidatePath(FACTURES_PATH);
    return {
      success: true,
      iban_change_detecte: res.iban_change_detecte,
      doublons: res.doublons.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de la validation." };
  }
}

/** Rejette une proposition de facture (mauvaise détection). */
export async function rejeterFactureAction(
  propositionId: string,
  motif?: string,
): Promise<FactureActionState> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const [prop] = await db
    .select({ id: propositionFacture.id, statut: propositionFacture.statut })
    .from(propositionFacture)
    .where(
      and(eq(propositionFacture.id, propositionId), eq(propositionFacture.cabinet_id, cabinet_id)),
    )
    .limit(1);
  if (!prop) return { error: "Proposition introuvable." };
  if (prop.statut !== "a_valider") return { error: "Proposition déjà traitée." };

  await db
    .update(propositionFacture)
    .set({ statut: "rejetee", rejet_motif: motif?.trim() || null })
    .where(
      and(eq(propositionFacture.id, propositionId), eq(propositionFacture.cabinet_id, cabinet_id)),
    );
  revalidatePath(FACTURES_PATH);
  return { success: true };
}
