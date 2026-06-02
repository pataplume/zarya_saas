// F6b — Pipeline de persistance des propositions d'employés (onboarding-client §6-7).
//
// Orchestration : extracteur (déterministe) → enregistrement salaire.extraction_ia →
// salaire.proposition_employe + salaire.proposition_champ (granularité champ-par-champ, ADR 0007).
//
// ANTI-CLAIR (ADR 0013, arbitré founder 2026-06-02) : pour les champs sensibles (AVS, IBAN),
// la valeur extraite est chiffrée au Vault DÈS la proposition (vaultCreateSecret) → l'UUID est
// stocké dans proposition_champ.valeur_proposee_normalisee {vault_id} et valeur_proposee = MASQUÉE.
// Jamais d'AVS/IBAN en clair, y compris au stade proposition. donnees_brutes ne contient aucune PII.
// Le déplacement du secret vers salaire.employe.{numero_avs,iban}_vault_id se fait au finalize (F6c).
//
// Réf : docs/data-model/onboarding-client-schema.md §5-7 ; ADR 0007/0013.

import { randomUUID } from "node:crypto";
import {
  db,
  extractionIa,
  propositionChamp,
  propositionEmploye,
  vaultCreateSecret,
} from "@zarya/db";
import { CHAMPS_SENSIBLES_VAULT, masquerSensible } from "./employe-fields";
import {
  buildManualProposal,
  type EmployeProposal,
  type EmployesExtractor,
  type ExtractionMode,
  getEmployesExtractor,
  type SaisieManuelle,
} from "./extract-employes";
import type { LigneEmploye } from "./parse-employes-file";

export interface PersistPropositionContext {
  cabinet_id: string;
  client_id: string;
  session_id: string;
  /** Extraction d'origine (null en mode manuel). */
  extraction_id: string | null;
}

/** Insère une proposition_employe + ses proposition_champ (Vault pour les champs sensibles). */
async function persistProposition(
  ctx: PersistPropositionContext,
  proposal: EmployeProposal,
): Promise<string> {
  const [prop] = await db
    .insert(propositionEmploye)
    .values({
      cabinet_id: ctx.cabinet_id,
      client_id: ctx.client_id,
      session_id: ctx.session_id,
      extraction_id: ctx.extraction_id,
      numero_dans_extraction: proposal.numero_dans_extraction,
      confiance_globale: proposal.confiance_globale.toFixed(2),
      anomalies_detectees: proposal.anomalies,
    })
    .returning({ id: propositionEmploye.id });
  if (!prop) throw new Error("Échec de l'insertion proposition_employe");

  for (const champ of proposal.champs) {
    let valeur_proposee = champ.valeur_proposee;
    let valeur_proposee_normalisee: Record<string, unknown> | null = null;

    if (champ.valeur_proposee && CHAMPS_SENSIBLES_VAULT.has(champ.nom_champ)) {
      // ANTI-CLAIR : chiffrement immédiat au Vault, on ne stocke que l'UUID + une vue masquée.
      const vaultId = await vaultCreateSecret(
        champ.valeur_proposee,
        `salaire/proposition_champ/${champ.nom_champ}/${randomUUID()}`,
        `Champ sensible ${champ.nom_champ} proposé (onboarding, cabinet ${ctx.cabinet_id})`,
      );
      valeur_proposee_normalisee = { vault_id: vaultId };
      valeur_proposee = masquerSensible(champ.nom_champ, champ.valeur_proposee);
    }

    await db.insert(propositionChamp).values({
      cabinet_id: ctx.cabinet_id,
      client_id: ctx.client_id,
      proposition_employe_id: prop.id,
      nom_champ: champ.nom_champ,
      categorie: champ.categorie,
      valeur_proposee,
      valeur_proposee_normalisee,
      confiance: champ.confiance.toFixed(2),
      obligatoire_swissdec: champ.obligatoire_swissdec,
      ...(champ.source_cellule ? { source_cellule: champ.source_cellule } : {}),
      statut: champ.statut,
    });
  }
  return prop.id;
}

export interface ExtraireEmployesInput {
  cabinet_id: string;
  client_id: string;
  session_id: string;
  upload_fichier_id: string;
  nom_fichier: string;
  lignes: LigneEmploye[];
  mode?: ExtractionMode;
  /** Injectable pour les tests (défaut : getEmployesExtractor). */
  extractor?: EmployesExtractor;
}

export interface ExtraireEmployesResult {
  extraction_id: string;
  proposition_ids: string[];
  nb_employes_detectes: number;
}

/**
 * Extrait les employés d'un fichier déjà parsé et persiste extraction_ia + propositions.
 * Le parsing (.xlsx/CSV → lignes) est fait en amont par parse-employes-file (apps/web).
 */
export async function extraireEmployesDepuisFichier(
  input: ExtraireEmployesInput,
): Promise<ExtraireEmployesResult> {
  const extractor = input.extractor ?? getEmployesExtractor(input.mode ?? "stub");
  const result = await extractor.extract({ nom_fichier: input.nom_fichier, lignes: input.lignes });

  const [extr] = await db
    .insert(extractionIa)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      upload_fichier_id: input.upload_fichier_id,
      modele_utilise: result.modele_utilise,
      prompt_version: result.prompt_version,
      nb_employes_detectes: result.nb_employes_detectes,
      confiance_globale: result.confiance_globale.toFixed(2),
      statut: "succes",
      date_fin: new Date(),
      // donnees_brutes : métadonnées NON sensibles uniquement (aucune PII en clair).
      donnees_brutes: {
        mode: result.mode,
        prompt_version: result.prompt_version,
        nb_employes_detectes: result.nb_employes_detectes,
      },
    })
    .returning({ id: extractionIa.id });
  if (!extr) throw new Error("Échec de l'insertion extraction_ia");

  const ctx: PersistPropositionContext = {
    cabinet_id: input.cabinet_id,
    client_id: input.client_id,
    session_id: input.session_id,
    extraction_id: extr.id,
  };
  const proposition_ids: string[] = [];
  for (const proposal of result.employes) {
    proposition_ids.push(await persistProposition(ctx, proposal));
  }
  return {
    extraction_id: extr.id,
    proposition_ids,
    nb_employes_detectes: result.nb_employes_detectes,
  };
}

export interface AjouterEmployeManuelInput {
  cabinet_id: string;
  client_id: string;
  session_id: string;
  saisie: SaisieManuelle;
}

/**
 * Mode manuel : crée une proposition d'employé depuis une saisie directe (extraction_id null).
 * Même chemin de validation que l'extraction (ADR 0007). Vault pour AVS/IBAN saisis.
 */
export async function ajouterEmployeManuel(
  input: AjouterEmployeManuelInput,
): Promise<{ proposition_id: string }> {
  const proposal = buildManualProposal(input.saisie);
  const id = await persistProposition(
    {
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      session_id: input.session_id,
      extraction_id: null,
    },
    proposal,
  );
  return { proposition_id: id };
}
