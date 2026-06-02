"use server";

import { requireAuth } from "@zarya/auth";
import { and, db, eq, propositionChamp, propositionEmploye, vaultCreateSecret } from "@zarya/db";
import {
  CHAMPS_SENSIBLES_VAULT,
  FinalisationBloqueeError,
  finaliserPropositionEmploye,
  isValidAvs,
  masquerSensible,
  type NomChamp,
} from "@zarya/extraction";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// F6c — Validation granulaire stricte des employés + finalisation (onboarding-client §7.6-7.8).
// Validation champ par champ (valider/modifier/rejeter) puis finaliserPropositionEmploye →
// salaire.employe (app-code, ADR 0007 addendum). Anti-clair (ADR 0013) : un champ sensible
// modifié est re-chiffré au Vault, jamais stocké en clair. AUTH + RBAC + scope cabinet.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type ChampActionState = { error?: string; success?: boolean };

const ChampSchema = z.object({
  proposition_champ_id: z.string().uuid(),
  action: z.enum(["valider", "modifier", "rejeter"]),
  nouvelle_valeur: z.string().trim().optional(),
});

/**
 * Valide / modifie / rejette UN champ proposé. Pour un champ sensible (AVS/IBAN) modifié,
 * la nouvelle valeur est chiffrée au Vault (nouveau secret) et seule la version masquée est
 * stockée en clair. L'AVS modifié est validé par checksum.
 */
export async function validerChampEmployeAction(
  _prev: ChampActionState,
  formData: FormData,
): Promise<ChampActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const parsed = ChampSchema.safeParse({
    proposition_champ_id: formData.get("proposition_champ_id"),
    action: formData.get("action"),
    nouvelle_valeur: formData.get("nouvelle_valeur") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const v = parsed.data;

  const [champ] = await db
    .select({
      id: propositionChamp.id,
      nom_champ: propositionChamp.nom_champ,
      valeur_proposee: propositionChamp.valeur_proposee,
      valeur_proposee_normalisee: propositionChamp.valeur_proposee_normalisee,
    })
    .from(propositionChamp)
    .where(
      and(
        eq(propositionChamp.id, v.proposition_champ_id),
        eq(propositionChamp.cabinet_id, cabinet_id),
      ),
    )
    .limit(1);
  if (!champ) return { error: "Champ introuvable." };

  const nom = champ.nom_champ as NomChamp;
  const sensible = CHAMPS_SENSIBLES_VAULT.has(nom);
  const acteurMaj = {
    modifie_par_type: "fiduciaire" as const,
    date_validation: new Date(),
    updated_at: new Date(),
  };

  if (v.action === "rejeter") {
    await db
      .update(propositionChamp)
      .set({ statut: "rejete", ...acteurMaj })
      .where(eq(propositionChamp.id, champ.id));
    revalidatePath("/app/clients");
    return { success: true };
  }

  if (v.action === "valider") {
    // Confirme la valeur extraite. Sensible : valeur_finale = version masquée (vault_id inchangé).
    await db
      .update(propositionChamp)
      .set({ statut: "valide", valeur_finale: champ.valeur_proposee, ...acteurMaj })
      .where(eq(propositionChamp.id, champ.id));
    revalidatePath("/app/clients");
    return { success: true };
  }

  // action === "modifier"
  if (!v.nouvelle_valeur) return { error: "Nouvelle valeur requise." };
  if (nom === "numero_avs" && !isValidAvs(v.nouvelle_valeur))
    return { error: "Numéro AVS invalide (format 756.XXXX.XXXX.XX, checksum)." };

  if (sensible) {
    // Re-chiffrement au Vault : nouveau secret, on ne stocke que l'UUID + version masquée.
    const vaultId = await vaultCreateSecret(
      v.nouvelle_valeur,
      `salaire/proposition_champ/${nom}/modif/${champ.id}`,
      `Champ sensible ${nom} modifié à la validation (cabinet ${cabinet_id})`,
    );
    await db
      .update(propositionChamp)
      .set({
        statut: "modifie",
        valeur_finale: masquerSensible(nom, v.nouvelle_valeur),
        valeur_proposee_normalisee: { vault_id: vaultId },
        ...acteurMaj,
      })
      .where(eq(propositionChamp.id, champ.id));
  } else {
    await db
      .update(propositionChamp)
      .set({ statut: "modifie", valeur_finale: v.nouvelle_valeur, ...acteurMaj })
      .where(eq(propositionChamp.id, champ.id));
  }
  revalidatePath("/app/clients");
  return { success: true };
}

export type FinaliserActionState = { error?: string; success?: boolean; employe_id?: string };

const FinaliserSchema = z.object({ proposition_employe_id: z.string().uuid() });

/**
 * Finalise une proposition validée → crée salaire.employe (via le cœur app-code).
 * Refuse si un champ obligatoire-Swissdec n'est pas validé (validation stricte, ADR 0007).
 */
export async function finaliserPropositionEmployeAction(
  _prev: FinaliserActionState,
  formData: FormData,
): Promise<FinaliserActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const parsed = FinaliserSchema.safeParse({
    proposition_employe_id: formData.get("proposition_employe_id"),
  });
  if (!parsed.success) return { error: "Proposition invalide." };

  try {
    const { employe_id } = await finaliserPropositionEmploye({
      cabinet_id,
      proposition_employe_id: parsed.data.proposition_employe_id,
      valide_par_type: "fiduciaire",
      valide_par_id: user.id,
    });
    revalidatePath("/app/clients");
    return { success: true, employe_id };
  } catch (e) {
    if (e instanceof FinalisationBloqueeError)
      return { error: `Champs obligatoires non validés : ${e.champs_bloquants.join(", ")}` };
    return { error: e instanceof Error ? e.message : "Échec de la finalisation." };
  }
}
