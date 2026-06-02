// F6c — Finalisation app-code d'une proposition d'employé → salaire.employe.
//
// Pourquoi app-code et NON un trigger DB (arbitré founder 2026-06-02, addendum ADR 0007/règle 4
// CLAUDE.md) : le déplacement des secrets AVS/IBAN passe par les helpers Vault (API serveur),
// impossibles dans un trigger SQL pur. Cohérent avec finaliserDocument/finaliserFacture (B/E).
//
// Validation granulaire stricte (ADR 0007) : la finalisation est REFUSÉE tant que les champs
// obligatoires-Swissdec ne sont pas tous `valide`/`modifie`. Anti-clair (ADR 0013) : on RÉUTILISE
// le vault_id de la proposition (créé en F6b, ou recréé à la modification d'un champ sensible) —
// jamais de re-déchiffrement ni d'écriture en clair. Réf : onboarding-client.md §7.6-7.8.

import {
  and,
  db,
  employe as employeTable,
  eq,
  propositionChamp,
  propositionEmploye,
  sessionOnboarding,
  sql,
} from "@zarya/db";
import type { NomChamp } from "./employe-fields";
import { type ChampPourFinalisation, champsBloquants } from "./valider-employe";

export class FinalisationBloqueeError extends Error {
  constructor(public readonly champs_bloquants: NomChamp[]) {
    super(
      `Finalisation refusée : champs obligatoires non validés : ${champs_bloquants.join(", ")}`,
    );
    this.name = "FinalisationBloqueeError";
  }
}

export interface FinaliserPropositionEmployeInput {
  cabinet_id: string;
  proposition_employe_id: string;
  valide_par_type: "client" | "fiduciaire";
  valide_par_id?: string;
}

export interface FinaliserPropositionEmployeResult {
  employe_id: string;
}

// Champs employé typés numériques / entiers (le reste = texte/enum passés tels quels).
const CHAMPS_ENTIERS: ReadonlySet<NomChamp> = new Set<NomChamp>(["nb_enfants_charge"]);
const CHAMPS_NON_EMPLOYE: ReadonlySet<NomChamp> = new Set<NomChamp>([]); // tous mappent 1-1 ici

/**
 * Finalise une proposition validée → crée salaire.employe (statut actif), déplace les secrets
 * AVS/IBAN (réutilise vault_id), lie la proposition, incrémente le compteur de session.
 * Lève FinalisationBloqueeError si un champ obligatoire-Swissdec n'est pas validé.
 */
export async function finaliserPropositionEmploye(
  input: FinaliserPropositionEmployeInput,
): Promise<FinaliserPropositionEmployeResult> {
  const [prop] = await db
    .select({
      id: propositionEmploye.id,
      cabinet_id: propositionEmploye.cabinet_id,
      client_id: propositionEmploye.client_id,
      session_id: propositionEmploye.session_id,
      statut: propositionEmploye.statut,
      confiance_globale: propositionEmploye.confiance_globale,
      sources_documents: propositionEmploye.sources_documents,
    })
    .from(propositionEmploye)
    .where(
      and(
        eq(propositionEmploye.id, input.proposition_employe_id),
        eq(propositionEmploye.cabinet_id, input.cabinet_id),
      ),
    )
    .limit(1);
  if (!prop) throw new Error("Proposition introuvable.");
  if (prop.statut === "validee") throw new Error("Proposition déjà validée.");

  const champs = await db
    .select({
      nom_champ: propositionChamp.nom_champ,
      statut: propositionChamp.statut,
      obligatoire_swissdec: propositionChamp.obligatoire_swissdec,
      valeur_finale: propositionChamp.valeur_finale,
      valeur_proposee: propositionChamp.valeur_proposee,
      valeur_proposee_normalisee: propositionChamp.valeur_proposee_normalisee,
    })
    .from(propositionChamp)
    .where(eq(propositionChamp.proposition_employe_id, prop.id));

  // Garde-fou validation stricte.
  const bloquants = champsBloquants(
    champs.map(
      (c): ChampPourFinalisation => ({
        nom_champ: c.nom_champ as NomChamp,
        statut: c.statut,
        obligatoire_swissdec: c.obligatoire_swissdec,
      }),
    ),
  );
  if (bloquants.length > 0) throw new FinalisationBloqueeError(bloquants);

  // Construction des valeurs de salaire.employe depuis les champs validés/modifiés.
  // biome-ignore lint/suspicious/noExplicitAny: assemblage dynamique colonne→valeur (cast DB).
  const valeurs: Record<string, any> = {
    cabinet_id: prop.cabinet_id,
    client_id: prop.client_id,
    statut: "actif",
    cree_via_onboarding: true,
    session_onboarding_id: prop.session_id,
    proposition_employe_id: prop.id,
    confiance_globale_initiale: prop.confiance_globale,
    ...(prop.sources_documents ? { documents_sources: prop.sources_documents } : {}),
  };

  for (const c of champs) {
    if (c.statut !== "valide" && c.statut !== "modifie") continue;
    const nom = c.nom_champ as NomChamp;
    if (CHAMPS_NON_EMPLOYE.has(nom)) continue;
    // Champs sensibles → on réutilise le vault_id (anti-clair, jamais de clair en sortie).
    if (nom === "numero_avs" || nom === "iban") {
      const norm = c.valeur_proposee_normalisee as { vault_id?: string } | null;
      const vaultId = norm?.vault_id;
      if (vaultId)
        valeurs[nom === "numero_avs" ? "numero_avs_vault_id" : "iban_vault_id"] = vaultId;
      continue;
    }
    const brut = c.valeur_finale ?? c.valeur_proposee;
    if (brut === null || brut === undefined || brut === "") continue;
    valeurs[nom] = CHAMPS_ENTIERS.has(nom) ? Number(brut) : brut;
  }

  const [emp] = await db
    .insert(employeTable)
    .values(valeurs as typeof employeTable.$inferInsert)
    .returning({ id: employeTable.id });
  if (!emp) throw new Error("Échec de la création de salaire.employe.");

  await db
    .update(propositionEmploye)
    .set({
      statut: "validee",
      employe_id: emp.id,
      date_validation: new Date(),
      valide_par_type: input.valide_par_type,
      ...(input.valide_par_id ? { valide_par_id: input.valide_par_id } : {}),
      updated_at: new Date(),
    })
    .where(eq(propositionEmploye.id, prop.id));

  await db
    .update(sessionOnboarding)
    .set({
      nb_employes_valides: sql`${sessionOnboarding.nb_employes_valides} + 1`,
      date_derniere_activite: new Date(),
      updated_at: new Date(),
    })
    .where(eq(sessionOnboarding.id, prop.session_id));

  return { employe_id: emp.id };
}
