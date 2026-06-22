// Lot 5 (ADR 0025 §6) — Données d'affichage des sections bancaire / facturation / accès
// logiciel du dossier client. ⚠️ SCEAU ANTI-CLAIR (ADR 0013) : on ne projette JAMAIS l'IBAN
// ni les credentials en clair — uniquement les masques (iban_masque) et des booléens
// « secret présent ». Le clair vit au Vault, déchiffrable seulement côté serveur au besoin.
//
// Sécurité : `db` service role BYPASSE la RLS (ADR 0005 addendum). Frontière réelle = filtre
// (cabinet_id, client_id) discipliné. Renvoie null si le client n'appartient pas au cabinet.

import { banque, client, db, paramComptable, relation } from "@zarya/db";
import { and, asc, eq, isNull } from "drizzle-orm";

export interface BanqueLigne {
  id: string;
  nom_banque: string | null;
  iban_masque: string | null;
  bic: string | null;
  devise: string;
  usage: string | null;
  actif: boolean;
  /** Un secret Open Banking est-il enregistré (au Vault) ? Jamais le secret lui-même. */
  open_banking_configure: boolean;
}

export interface FacturationView {
  pack_tarifaire: string | null;
  honoraires_mensuels: string | null;
  honoraires_modele: string | null;
  date_signature: string | null;
  date_renouvellement: string | null;
  duree_engagement_mois: number | null;
  notes_facturation: string | null;
  iban_facturation_masque: string | null;
  iban_facturation_configure: boolean;
}

export interface BancaireDossierData {
  comptes: BanqueLigne[];
  facturation: FacturationView | null;
  /** Credentials logiciel comptable externe enregistrés (au Vault) ? Jamais le secret. */
  acces_logiciel_configure: boolean;
}

export async function getBancaireDossier(
  cabinet_id: string,
  client_id: string,
): Promise<BancaireDossierData | null> {
  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return null;

  const comptesRows = await db
    .select({
      id: banque.id,
      nom_banque: banque.nom_banque,
      iban_masque: banque.iban_masque,
      bic: banque.bic,
      devise: banque.devise,
      usage: banque.usage,
      actif: banque.actif,
      open_banking_vault_id: banque.credentials_open_banking_vault_id,
    })
    .from(banque)
    .where(
      and(
        eq(banque.cabinet_id, cabinet_id),
        eq(banque.client_id, client_id),
        isNull(banque.archived_at),
      ),
    )
    .orderBy(asc(banque.created_at));

  const comptes: BanqueLigne[] = comptesRows.map((r) => ({
    id: r.id,
    nom_banque: r.nom_banque,
    iban_masque: r.iban_masque,
    bic: r.bic,
    devise: r.devise,
    usage: r.usage,
    actif: r.actif,
    open_banking_configure: r.open_banking_vault_id !== null,
  }));

  const [rel] = await db
    .select({
      pack_tarifaire: relation.pack_tarifaire,
      honoraires_mensuels: relation.honoraires_mensuels,
      honoraires_modele: relation.honoraires_modele,
      date_signature: relation.date_signature,
      date_renouvellement: relation.date_renouvellement,
      duree_engagement_mois: relation.duree_engagement_mois,
      notes_facturation: relation.notes_facturation,
      iban_facturation_masque: relation.iban_facturation_masque,
      iban_facturation_vault_id: relation.iban_facturation_vault_id,
    })
    .from(relation)
    .where(and(eq(relation.client_id, client_id), eq(relation.cabinet_id, cabinet_id)))
    .limit(1);

  const facturation: FacturationView | null = rel
    ? {
        pack_tarifaire: rel.pack_tarifaire,
        honoraires_mensuels: rel.honoraires_mensuels,
        honoraires_modele: rel.honoraires_modele,
        date_signature: rel.date_signature,
        date_renouvellement: rel.date_renouvellement,
        duree_engagement_mois: rel.duree_engagement_mois,
        notes_facturation: rel.notes_facturation,
        iban_facturation_masque: rel.iban_facturation_masque,
        iban_facturation_configure: rel.iban_facturation_vault_id !== null,
      }
    : null;

  const [param] = await db
    .select({ vault_id: paramComptable.acces_logiciel_externe_vault_id })
    .from(paramComptable)
    .where(and(eq(paramComptable.client_id, client_id), eq(paramComptable.cabinet_id, cabinet_id)))
    .limit(1);

  return {
    comptes,
    facturation,
    acces_logiciel_configure: Boolean(param?.vault_id),
  };
}
