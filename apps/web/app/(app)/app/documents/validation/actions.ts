"use server";

import { requireAuth } from "@zarya/auth";
import { db, fichierPhysique, propositionClassement, uploadBrut } from "@zarya/db";
import { type ChampsProposition, diffValidation, finaliserDocument } from "@zarya/extraction";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Validation humaine d'une proposition de classement (pattern proposition →
// validation → entité finale, ADR 0007). L'entité doc.document est créée ici en
// code applicatif (pas par trigger DB) : extraction-ia.md § 8.
// L'auto-classement (statut_classement 'auto') n'est pas implémenté au MVP :
// toute proposition passe par une validation humaine explicite (doc.md § 11.1).

// Rôle lecteur = lecture seule ; les autres rôles peuvent valider.
const ROLES_VALIDATION = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

const CATEGORIES = [
  "bancaire",
  "fiscal",
  "salaire",
  "commercial",
  "administratif",
  "autre",
] as const;

export type ValidationState = { error?: string; success?: boolean };

const ValiderSchema = z.object({
  proposition_id: z.string().uuid(),
  client_id: z.string().uuid({ message: "Sélectionnez un client" }),
  type: z.string().min(1, "Type requis").max(120),
  categorie: z.enum(CATEGORIES, { errorMap: () => ({ message: "Catégorie invalide" }) }),
  periode: z.string().max(40).optional(),
  libelle: z.string().min(1, "Libellé requis").max(300),
});

export async function validerPropositionAction(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (!ROLES_VALIDATION.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = ValiderSchema.safeParse({
    proposition_id: formData.get("proposition_id"),
    client_id: formData.get("client_id"),
    type: formData.get("type"),
    categorie: formData.get("categorie"),
    periode: formData.get("periode") ?? undefined,
    libelle: formData.get("libelle"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const retenu = parsed.data;

  // Charger la proposition encore en attente, scoping cabinet (defense-in-depth en plus de la RLS).
  const [prop] = await db
    .select({
      id: propositionClassement.id,
      fichier_physique_id: propositionClassement.fichier_physique_id,
      type_propose: propositionClassement.type_propose,
      categorie_proposee: propositionClassement.categorie_proposee,
      periode_proposee: propositionClassement.periode_proposee,
      libelle_propose: propositionClassement.libelle_propose,
      client_id_propose: propositionClassement.client_id_propose,
      confiance_globale: propositionClassement.confiance_globale,
    })
    .from(propositionClassement)
    .where(
      and(
        eq(propositionClassement.id, retenu.proposition_id),
        eq(propositionClassement.cabinet_id, cabinet_id),
        eq(propositionClassement.statut, "a_valider"),
      ),
    )
    .limit(1);

  if (!prop) return { error: "Proposition introuvable ou déjà traitée" };

  const propose: ChampsProposition = {
    client_id: prop.client_id_propose,
    type: prop.type_propose,
    categorie: prop.categorie_proposee,
    periode: prop.periode_proposee,
    libelle: prop.libelle_propose,
  };
  const champsRetenus: ChampsProposition = {
    client_id: retenu.client_id,
    type: retenu.type,
    categorie: retenu.categorie,
    periode: retenu.periode ?? null,
    libelle: retenu.libelle,
  };
  const diff = diffValidation(propose, champsRetenus);

  // Finalisation : création doc.document + appariement attente (B3) + événement
  // `document_recu`. Chemin partagé avec l'auto-classement (B4) — acteur cabinet_membre
  // ici. Le trigger doc.fn_check_client_cabinet vérifie l'appartenance client↔cabinet.
  const fin = await finaliserDocument({
    cabinet_id,
    client_id: retenu.client_id,
    fichier_physique_id: prop.fichier_physique_id,
    proposition_classement_id: prop.id,
    type: retenu.type,
    categorie: retenu.categorie,
    periode: retenu.periode ?? null,
    libelle: retenu.libelle,
    statut_classement: diff.corrige ? "corrige_humain" : "valide_humain",
    confiance_classement: prop.confiance_globale,
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    cree_par: user.id,
  });

  await db
    .update(propositionClassement)
    .set({
      statut: "valide",
      valide_par: user.id,
      date_validation: new Date(),
      document_id: fin.document_id,
      corrections_apportees: diff.corrige ? diff.corrections : null,
    })
    .where(eq(propositionClassement.id, prop.id));

  // Refléter l'issue sur la trace d'upload (inbox /app/documents).
  if (prop.fichier_physique_id) {
    const [fichier] = await db
      .select({ upload_brut_id: fichierPhysique.upload_brut_id })
      .from(fichierPhysique)
      .where(eq(fichierPhysique.id, prop.fichier_physique_id))
      .limit(1);
    if (fichier?.upload_brut_id) {
      await db
        .update(uploadBrut)
        .set({ statut: "valide" })
        .where(eq(uploadBrut.id, fichier.upload_brut_id));
    }
  }

  revalidatePath("/app/documents/validation");
  revalidatePath("/app/documents");
  return { success: true };
}

const RejeterSchema = z.object({
  proposition_id: z.string().uuid(),
  motif: z.string().max(500).optional(),
});

export async function rejeterPropositionAction(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (!ROLES_VALIDATION.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = RejeterSchema.safeParse({
    proposition_id: formData.get("proposition_id"),
    motif: formData.get("motif") ?? undefined,
  });
  if (!parsed.success) return { error: "Données invalides" };

  const [prop] = await db
    .select({
      id: propositionClassement.id,
      fichier_physique_id: propositionClassement.fichier_physique_id,
    })
    .from(propositionClassement)
    .where(
      and(
        eq(propositionClassement.id, parsed.data.proposition_id),
        eq(propositionClassement.cabinet_id, cabinet_id),
        eq(propositionClassement.statut, "a_valider"),
      ),
    )
    .limit(1);

  if (!prop) return { error: "Proposition introuvable ou déjà traitée" };

  await db
    .update(propositionClassement)
    .set({
      statut: "rejete",
      valide_par: user.id,
      date_validation: new Date(),
      rejet_motif: parsed.data.motif ?? null,
    })
    .where(eq(propositionClassement.id, prop.id));

  if (prop.fichier_physique_id) {
    const [fichier] = await db
      .select({ upload_brut_id: fichierPhysique.upload_brut_id })
      .from(fichierPhysique)
      .where(eq(fichierPhysique.id, prop.fichier_physique_id))
      .limit(1);
    if (fichier?.upload_brut_id) {
      await db
        .update(uploadBrut)
        .set({ statut: "rejete" })
        .where(eq(uploadBrut.id, fichier.upload_brut_id));
    }
  }

  revalidatePath("/app/documents/validation");
  revalidatePath("/app/documents");
  return { success: true };
}
