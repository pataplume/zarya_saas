"use server";

import { requireAuth } from "@zarya/auth";
import { client, db, document, notInArray, propositionFacture } from "@zarya/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ConfianceChampUi, ConfianceParChampUi } from "../validation/confiance-provenance";

// Saisie manuelle de facture — RUN4 usabilité (PLAN-USABILITE-MVP.md). Arbitrage founder :
// une facture saisie à la main passe par la MÊME file de validation que l'extraction IA
// (facture.proposition_facture → validation humaine → facture.facture), pas de raccourci
// direct ("double validation", maker-checker). On réutilise donc EXACTEMENT le pattern
// RBAC/scope/Zod de `factures/validation/actions.ts` : cette action ne fait que CRÉER la
// proposition (origine_saisie='saisie_manuelle', extraction_invocation_id NULL), la
// validation elle-même reste `validerFactureAction` (inchangée).
//
// IBAN : non collecté ici. Comme pour l'extraction IA (ADR 0013 — le validateur le saisit),
// l'IBAN reste absent de `fournisseur_propose_data` ; il sera saisi au moment de
// `validerFactureAction` (formulaire existant, inchangé).

const ROLES_VALIDATION = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);
const FACTURES_VALIDATION_PATH = "/app/factures/validation";

export type FactureManuelleState = {
  error?: string;
  success?: boolean;
  proposition_id?: string;
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

const CreerManuelleSchema = z
  .object({
    client_id: z.string().uuid(),
    document_id: z.string().uuid(),
    fournisseur_raison_sociale: z.string().trim().min(1, "Raison sociale requise"),
    fournisseur_ide: optNullStr,
    fournisseur_numero_tva: optNullStr,
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
    // `.finite()` rejette NaN/Infinity (ex. un total non numérique forgé hors formulaire client)
    // AVANT l'insert numeric (sinon erreur Postgres brute illisible). `.nonnegative()` : une
    // saisie manuelle est toujours une facture standard (type forcé plus bas), jamais un avoir.
    total_ht: z.coerce.number().finite().nonnegative(),
    total_tva: z.coerce.number().finite().nonnegative().default(0),
    total_ttc: z.coerce.number().finite().nonnegative(),
    montant_a_payer: z.coerce.number().finite().nonnegative(),
    taux_tva_principal: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .optional()
      .refine(
        (v) => v === null || v === undefined || (Number.isFinite(v) && v >= 0),
        "Taux de TVA invalide",
      ),
    devise: z.enum(["CHF", "EUR", "USD", "autre"]).default("CHF"),
    categorie: optNullStr,
  })
  .refine(
    // Miroir de la contrainte DB `chk_facture_montants` (migration 0030) : on échoue TÔT avec un
    // message métier lisible au lieu de laisser l'incohérence remonter en erreur Postgres brute
    // au moment de la validation. Tolérance 0.05 identique à la contrainte.
    (v) => Math.abs(v.total_ttc - (v.total_ht + v.total_tva)) <= 0.05,
    {
      message: "Incohérence des montants : le TTC doit égaler HT + TVA (± 0.05).",
      path: ["total_ttc"],
    },
  );

/** Construit confiance_par_champ = { source: "humain", confiance: 1 } pour chaque champ rempli. */
function confianceHumaine(champs: Record<string, unknown>): ConfianceParChampUi {
  const out: ConfianceParChampUi = {};
  const entree: ConfianceChampUi = { source: "humain", confiance: 1 };
  for (const [champ, valeur] of Object.entries(champs)) {
    if (valeur !== null && valeur !== undefined && valeur !== "") {
      out[champ] = entree;
    }
  }
  return out;
}

/** Crée une facture.proposition_facture manuelle (RUN4) → rejoint la file de validation. */
export async function creerFactureManuelleAction(
  _prev: FactureManuelleState,
  formData: FormData,
): Promise<FactureManuelleState> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const parsed = CreerManuelleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const v = parsed.data;

  const [c] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, v.client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!c) return { error: "Client introuvable." };

  const [doc] = await db
    .select({ id: document.id })
    .from(document)
    .where(
      and(
        eq(document.id, v.document_id),
        eq(document.cabinet_id, cabinet_id),
        eq(document.client_id, v.client_id),
      ),
    )
    .limit(1);
  if (!doc) return { error: "Document introuvable pour ce client." };

  const fournisseurProposeData = {
    raison_sociale: v.fournisseur_raison_sociale,
    nom_court: null,
    ide: v.fournisseur_ide ?? null,
    numero_tva: v.fournisseur_numero_tva ?? null,
    bic: v.fournisseur_bic ?? null,
  };

  const confianceParChamp = confianceHumaine({
    numero_facture: v.numero_facture,
    date_emission: v.date_emission,
    total_ht: v.total_ht,
    total_tva: v.total_tva,
    total_ttc: v.total_ttc,
    montant_a_payer: v.montant_a_payer,
    fournisseur_raison_sociale: v.fournisseur_raison_sociale,
    fournisseur_ide: v.fournisseur_ide ?? null,
    fournisseur_numero_tva: v.fournisseur_numero_tva ?? null,
    fournisseur_bic: v.fournisseur_bic ?? null,
    date_echeance: v.date_echeance ?? null,
    taux_tva_principal: v.taux_tva_principal ?? null,
    categorie: v.categorie ?? null,
  });

  try {
    const [inserted] = await db
      .insert(propositionFacture)
      .values({
        cabinet_id,
        client_id: v.client_id,
        document_id: v.document_id,
        extraction_invocation_id: null,
        statut: "a_valider",
        origine_saisie: "saisie_manuelle",
        fournisseur_propose_data: fournisseurProposeData,
        numero_facture_propose: v.numero_facture,
        type_propose: "facture_standard",
        date_emission_proposee: v.date_emission,
        date_echeance_proposee: v.date_echeance ?? null,
        total_ht_propose: String(v.total_ht),
        total_tva_propose: String(v.total_tva),
        total_ttc_propose: String(v.total_ttc),
        montant_a_payer_propose: String(v.montant_a_payer),
        taux_tva_principal_propose:
          v.taux_tva_principal !== null && v.taux_tva_principal !== undefined
            ? String(v.taux_tva_principal)
            : null,
        devise_proposee: v.devise,
        categorie_proposee: v.categorie ?? null,
        qr_facture_detecte: false,
        confiance_globale: "1.00",
        confiance_par_champ: confianceParChamp,
      })
      .returning({ id: propositionFacture.id });

    if (!inserted) return { error: "Échec de la création de la facture." };

    revalidatePath(FACTURES_VALIDATION_PATH);
    return { success: true, proposition_id: inserted.id };
  } catch (err) {
    // Violation de la contrainte unique sur document_id (SQLSTATE 23505) : le document est
    // déjà rattaché à une autre proposition (peu importe le statut de celle-ci). Drizzle
    // enveloppe l'erreur postgres-js d'origine dans `.cause` (le code SQLSTATE n'est pas
    // porté par l'erreur de plus haut niveau).
    const code =
      err && typeof err === "object" && "cause" in err && err.cause && typeof err.cause === "object"
        ? (err.cause as { code?: string }).code
        : undefined;
    if (code === "23505") {
      return {
        error: "Ce document est déjà rattaché à une facture ou une proposition en attente.",
      };
    }
    return { error: "Échec de la création de la facture." };
  }
}

export type DocumentEligible = {
  id: string;
  libelle: string;
  type: string;
  date_document: string | null;
};

/**
 * Liste les documents d'un client NON DÉJÀ liés à une proposition de facture (quel que soit
 * le statut de celle-ci — document_id est UNIQUE dans proposition_facture). Lecture seule,
 * appelée directement depuis un client component (pas un form action).
 */
export async function documentsEligiblesAction(clientId: string): Promise<DocumentEligible[]> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return [];
  if (!ROLES_VALIDATION.has(role)) return [];

  const parsedId = z.string().uuid().safeParse(clientId);
  if (!parsedId.success) return [];

  const [c] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, parsedId.data), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!c) return [];

  const utilises = db
    .select({ id: propositionFacture.document_id })
    .from(propositionFacture)
    .where(eq(propositionFacture.cabinet_id, cabinet_id));

  const docs = await db
    .select({
      id: document.id,
      libelle: document.libelle,
      type: document.type,
      date_document: document.date_document,
    })
    .from(document)
    .where(
      and(
        eq(document.cabinet_id, cabinet_id),
        eq(document.client_id, parsedId.data),
        isNull(document.archived_at),
        notInArray(document.id, utilises),
      ),
    )
    .orderBy(desc(document.date_reception))
    .limit(50);

  return docs;
}
