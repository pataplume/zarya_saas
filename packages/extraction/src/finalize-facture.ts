// Finalisation d'une facture à partir d'une proposition validée (Bloc E5a, facture.md §6).
//
// Chemin serveur appelé par la server action de validation (E5b, UI split-screen). Crée
// l'entité finale facture.facture + upsert facture.fournisseur, à partir des valeurs
// VALIDÉES par l'humain (pattern proposition → validation, ADR 0007).
//
// SÉCURITÉ IBAN (ADR 0013) — 1er write-path IBAN au repos, arbitré founder :
//  - l'IBAN n'est JAMAIS stocké en clair : il est chiffré dans Supabase Vault et seul
//    l'UUID du secret est persisté (fournisseur.iban_principal_vault_id /
//    facture.iban_paiement_vault_id) ;
//  - FRAUDE RIB (§5.3) : si l'IBAN diffère de l'IBAN connu d'un fournisseur existant →
//    ALERTE FORTE non bloquante (événement crm.evenement `anomalie_facture` + trace masquée
//    dans fournisseur.iban_changements + facture.iban_change_vs_historique), le collaborateur
//    décide (pas de blocage automatique). Le clair n'est comparé qu'en mémoire, jamais persisté.
//
// Tout est scopé cabinet_id + client_id (anti-fuite) ; le trigger fn_check_client_cabinet
// vérifie la cohérence à l'INSERT.

import { randomUUID } from "node:crypto";
import {
  db,
  evenement,
  facture as factureTable,
  fournisseur as fournisseurTable,
  propositionFacture,
  vaultCreateSecret,
  vaultGetSecret,
  vaultUpdateSecret,
} from "@zarya/db";
import { and, eq, sql } from "drizzle-orm";
import { isValidIban, normalizeIban } from "./qr-bill";

export type TypeFacture = "facture_standard" | "qr_facture" | "avoir" | "acompte" | "autre";
export type DeviseFacture = "CHF" | "EUR" | "USD" | "autre";

/** Identité fournisseur validée (l'IBAN, si présent, part en Vault). */
export interface FournisseurValide {
  /** Si fourni, réutilise ce fournisseur existant (vérifié scopé cabinet+client). */
  id?: string | null;
  raison_sociale: string;
  nom_court?: string | null;
  ide?: string | null;
  numero_tva?: string | null;
  iban?: string | null;
  bic?: string | null;
  adresse?: unknown;
}

export interface FinaliserFactureInput {
  cabinet_id: string;
  client_id: string;
  proposition_id: string;
  fournisseur: FournisseurValide;
  numero_facture: string;
  type?: TypeFacture;
  date_emission: string; // YYYY-MM-DD
  date_echeance?: string | null;
  total_ht: number;
  total_tva?: number;
  total_ttc: number;
  montant_a_payer: number;
  taux_tva_principal?: number | null;
  devise?: DeviseFacture;
  /** IBAN de paiement de la facture (souvent = IBAN fournisseur) → Vault. */
  iban_paiement?: string | null;
  reference_paiement?: string | null;
  categorie?: string | null;
  compte_charge: string;
  /** Auteur de la validation (cabinet_membre). */
  acteur_id: string;
}

export interface FinaliserFactureResult {
  facture_id: string;
  fournisseur_id: string;
  /** Fraude RIB : l'IBAN diffère de l'IBAN connu du fournisseur (alerte, non bloquant). */
  iban_change_detecte: boolean;
  /** Ids de factures potentiellement en doublon (§5.4) — non bloquant. */
  doublons: string[];
}

function num(v: number | null | undefined, scale = 2): string | null {
  return v === null || v === undefined ? null : v.toFixed(scale);
}

/** 4 derniers caractères d'un IBAN normalisé (pour trace audit sans clair). */
function masqueIban(iban: string): string {
  const n = normalizeIban(iban);
  return n.length >= 4 ? `****${n.slice(-4)}` : "****";
}

export async function finaliserFacture(
  input: FinaliserFactureInput,
): Promise<FinaliserFactureResult> {
  // 1. Charge la proposition (scopée cabinet) et vérifie l'état + le document porteur.
  const [prop] = await db
    .select({
      id: propositionFacture.id,
      document_id: propositionFacture.document_id,
      statut: propositionFacture.statut,
      qr_facture_detecte: propositionFacture.qr_facture_detecte,
    })
    .from(propositionFacture)
    .where(
      and(
        eq(propositionFacture.id, input.proposition_id),
        eq(propositionFacture.cabinet_id, input.cabinet_id),
      ),
    )
    .limit(1);

  if (!prop) throw new Error("Proposition de facture introuvable pour ce cabinet");
  if (prop.statut !== "a_valider") {
    throw new Error(`Proposition déjà traitée (statut=${prop.statut})`);
  }

  const ibanFournisseur = input.fournisseur.iban ? normalizeIban(input.fournisseur.iban) : null;
  if (ibanFournisseur && !isValidIban(ibanFournisseur)) {
    throw new Error("IBAN fournisseur invalide (checksum mod-97)");
  }

  // 2. Résolution / upsert du fournisseur (scopé cabinet+client).
  const { fournisseurId, ibanChange } = await resoudreFournisseur(input, ibanFournisseur);

  // 3. Détection de doublons (§5.4) — non bloquant.
  const doublons = await detecterDoublons(input, fournisseurId);

  // 4. Création de la facture finale. IBAN de paiement → Vault.
  const factureId = randomUUID();
  let ibanPaiementVaultId: string | null = null;
  const ibanPaiement = input.iban_paiement ? normalizeIban(input.iban_paiement) : ibanFournisseur;
  if (ibanPaiement) {
    if (!isValidIban(ibanPaiement)) throw new Error("IBAN de paiement invalide (checksum mod-97)");
    ibanPaiementVaultId = await vaultCreateSecret(
      ibanPaiement,
      `iban:facture:${factureId}`,
      "IBAN de paiement (facture)",
    );
  }

  const [fact] = await db
    .insert(factureTable)
    .values({
      id: factureId,
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      fournisseur_id: fournisseurId,
      document_id: prop.document_id,
      proposition_id: prop.id,
      numero_facture: input.numero_facture,
      type: input.type ?? (prop.qr_facture_detecte ? "qr_facture" : "facture_standard"),
      date_emission: input.date_emission,
      date_echeance: input.date_echeance ?? null,
      reference_paiement: input.reference_paiement ?? null,
      total_ht: num(input.total_ht) as string,
      total_tva: num(input.total_tva ?? 0) as string,
      total_ttc: num(input.total_ttc) as string,
      montant_a_payer: num(input.montant_a_payer) as string,
      taux_tva_principal: num(input.taux_tva_principal),
      devise: input.devise ?? "CHF",
      iban_paiement_vault_id: ibanPaiementVaultId,
      qr_facture: prop.qr_facture_detecte,
      categorie: input.categorie ?? null,
      compte_charge: input.compte_charge,
      statut: "validee",
      statut_classement: "valide_humain",
      iban_change_vs_historique: ibanChange,
      cree_par: input.acteur_id,
    })
    .returning({ id: factureTable.id });

  if (!fact) throw new Error("Échec de la création de la facture");

  // 5. Proposition terminale → validee, liée à la facture.
  await db
    .update(propositionFacture)
    .set({
      statut: "validee",
      facture_id: fact.id,
      valide_par: input.acteur_id,
      date_validation: new Date(),
    })
    .where(
      and(eq(propositionFacture.id, prop.id), eq(propositionFacture.cabinet_id, input.cabinet_id)),
    );

  // 6. Fraude RIB (§5.3) : événement d'alerte FORT, non bloquant (le collaborateur décide).
  if (ibanChange) {
    await db.insert(evenement).values({
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      type: "anomalie_facture",
      acteur_type: "cabinet_membre",
      acteur_id: input.acteur_id,
      ressource_type: "facture.facture",
      ressource_id: fact.id,
      description: "Changement d'IBAN détecté sur un fournisseur connu (fraude au RIB possible)",
      metadata: {
        anomalie: "iban_change",
        fournisseur_id: fournisseurId,
        iban_masque: ibanFournisseur ? masqueIban(ibanFournisseur) : null,
      },
    });
  }

  return {
    facture_id: fact.id,
    fournisseur_id: fournisseurId,
    iban_change_detecte: ibanChange,
    doublons,
  };
}

/**
 * Résout le fournisseur : réutilise l'id fourni, sinon matche par (cabinet, client, IDE)
 * puis par raison sociale normalisée, sinon crée. Gère l'IBAN en Vault (création ou rotation
 * sur changement = fraude RIB). Retourne l'id + un drapeau `ibanChange`.
 */
async function resoudreFournisseur(
  input: FinaliserFactureInput,
  ibanNormalise: string | null,
): Promise<{ fournisseurId: string; ibanChange: boolean }> {
  const f = input.fournisseur;

  // Recherche d'un fournisseur existant (id explicite > IDE > raison sociale normalisée).
  let existing: { id: string; iban_principal_vault_id: string | null } | undefined;
  if (f.id) {
    [existing] = await db
      .select({
        id: fournisseurTable.id,
        iban_principal_vault_id: fournisseurTable.iban_principal_vault_id,
      })
      .from(fournisseurTable)
      .where(
        and(
          eq(fournisseurTable.id, f.id),
          eq(fournisseurTable.cabinet_id, input.cabinet_id),
          eq(fournisseurTable.client_id, input.client_id),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Fournisseur fourni introuvable pour ce cabinet/client");
  } else if (f.ide) {
    [existing] = await db
      .select({
        id: fournisseurTable.id,
        iban_principal_vault_id: fournisseurTable.iban_principal_vault_id,
      })
      .from(fournisseurTable)
      .where(
        and(
          eq(fournisseurTable.cabinet_id, input.cabinet_id),
          eq(fournisseurTable.client_id, input.client_id),
          eq(fournisseurTable.ide, f.ide),
        ),
      )
      .limit(1);
  }
  if (!existing && !f.id) {
    [existing] = await db
      .select({
        id: fournisseurTable.id,
        iban_principal_vault_id: fournisseurTable.iban_principal_vault_id,
      })
      .from(fournisseurTable)
      .where(
        and(
          eq(fournisseurTable.cabinet_id, input.cabinet_id),
          eq(fournisseurTable.client_id, input.client_id),
          sql`lower(${fournisseurTable.raison_sociale}) = lower(${f.raison_sociale})`,
        ),
      )
      .limit(1);
  }

  // ─── Fournisseur existant : MAJ + détection changement d'IBAN (fraude RIB) ───
  if (existing) {
    let ibanChange = false;
    let ibanMasqueAvant: string | null = null;
    let ibanMasqueApres: string | null = null;
    let vaultId = existing.iban_principal_vault_id;
    if (ibanNormalise) {
      if (vaultId) {
        const ancien = await vaultGetSecret(vaultId);
        if (ancien && normalizeIban(ancien) !== ibanNormalise) {
          ibanChange = true;
          ibanMasqueAvant = masqueIban(ancien);
          ibanMasqueApres = masqueIban(ibanNormalise);
          await vaultUpdateSecret(vaultId, ibanNormalise); // rotation, même UUID
        } else if (!ancien) {
          await vaultUpdateSecret(vaultId, ibanNormalise);
        }
      } else {
        vaultId = await vaultCreateSecret(
          ibanNormalise,
          `iban:fournisseur:${existing.id}`,
          "IBAN principal (fournisseur)",
        );
      }
    }
    await db
      .update(fournisseurTable)
      .set({
        raison_sociale: f.raison_sociale,
        nom_court: f.nom_court ?? null,
        ide: f.ide ?? null,
        numero_tva: f.numero_tva ?? null,
        bic: f.bic ?? null,
        ...(f.adresse !== undefined ? { adresse: f.adresse } : {}),
        ...(vaultId ? { iban_principal_vault_id: vaultId } : {}),
        ...(ibanChange
          ? {
              iban_changements: sql`${fournisseurTable.iban_changements} || ${JSON.stringify([
                {
                  date: new Date().toISOString(),
                  acteur_id: input.acteur_id,
                  iban_masque_avant: ibanMasqueAvant,
                  iban_masque_apres: ibanMasqueApres,
                },
              ])}::jsonb`,
            }
          : {}),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(fournisseurTable.id, existing.id),
          eq(fournisseurTable.cabinet_id, input.cabinet_id),
        ),
      );
    return { fournisseurId: existing.id, ibanChange };
  }

  // ─── Nouveau fournisseur ───
  const fournisseurId = randomUUID();
  let vaultId: string | null = null;
  if (ibanNormalise) {
    vaultId = await vaultCreateSecret(
      ibanNormalise,
      `iban:fournisseur:${fournisseurId}`,
      "IBAN principal (fournisseur)",
    );
  }
  await db.insert(fournisseurTable).values({
    id: fournisseurId,
    cabinet_id: input.cabinet_id,
    client_id: input.client_id,
    raison_sociale: f.raison_sociale,
    nom_court: f.nom_court ?? null,
    ide: f.ide ?? null,
    numero_tva: f.numero_tva ?? null,
    adresse: (f.adresse ?? null) as never,
    iban_principal_vault_id: vaultId,
    bic: f.bic ?? null,
  });
  return { fournisseurId, ibanChange: false };
}

/**
 * Doublons (§5.4) : exact (fournisseur + numéro) ou probable (fournisseur + montant TTC +
 * date d'émission ±3 jours). Scopé cabinet. Retourne les ids des factures candidates.
 */
async function detecterDoublons(
  input: FinaliserFactureInput,
  fournisseurId: string,
): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT id FROM facture.facture f
     WHERE f.cabinet_id = ${input.cabinet_id}::uuid
       AND f.fournisseur_id = ${fournisseurId}::uuid
       AND f.archived_at IS NULL
       AND (
         f.numero_facture = ${input.numero_facture}
         OR (
           f.total_ttc = ${num(input.total_ttc)}::numeric
           AND f.date_emission BETWEEN ${input.date_emission}::date - 3 AND ${input.date_emission}::date + 3
         )
       )
  `);
  return rows.map((r) => r.id);
}
