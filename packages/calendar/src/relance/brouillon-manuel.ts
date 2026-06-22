// Création MANUELLE d'un brouillon de relance (Lot 4, ADR 0025 §5 — Mode A).
//
// Pendant à `genererBrouillonsRelances` (cron C2a) : ici l'humain clique « Relancer »
// sur un client / une échéance / un document manquant, et on matérialise UN brouillon
// `crm.relance` prêt à valider — JAMAIS envoyé automatiquement (l'envoi part via
// `envoyerRelance` après confirmation humaine).
//
// Réutilise le pipeline existant : lookup `calendar.modele_relance` (override cabinet +
// catalogue global), rendu `renderRelance` (Handlebars logic-less), résolution du contact
// destinataire (principal du client). Service role serveur ; scope `cabinet_id` assuré par
// l'appelant (server action). Toutes les requêtes refiltrent néanmoins `cabinet_id`
// (défense en profondeur sur le chemin service-role — ADR 0005 addendum).

import { db, sql } from "@zarya/db";
import { type RelanceVariables, renderRelance } from "./render";

// langue client (fr/de/it/en) → langue modèle (fr/de/it). 'en' → 'fr' par défaut.
function toModeleLangue(langue: string | null): "fr" | "de" | "it" {
  return langue === "de" || langue === "it" ? langue : "fr";
}

/** Cible de la relance : une échéance, un document attendu, ou le client globalement. */
export type CibleRelance =
  | { kind: "echeance"; echeanceId: string }
  | { kind: "document"; documentAttenduId: string }
  | { kind: "client"; clientId: string };

export type CreerBrouillonStatus = "cree" | "cible_introuvable" | "sans_modele" | "deja_brouillon";

export interface CreerBrouillonResult {
  status: CreerBrouillonStatus;
  relanceId?: string;
}

export interface CreerBrouillonOptions {
  /** Type d'échéance servant à choisir le modèle quand la cible n'est pas une échéance. */
  typeEcheanceDefaut?: "fiscale" | "tva" | "bouclement" | "salaire" | "relance_documents";
}

type Contexte = {
  cabinet_id: string;
  client_id: string;
  echeance_id: string | null;
  document_attendu_id: string | null;
  type_echeance: string;
  libelle: string;
  date_echeance: string | null;
  client_nom: string;
  cabinet_nom: string;
  client_langue: string | null;
  contact_id: string | null;
};

/**
 * Résout le contexte (client, libellé, type d'échéance, destinataire…) à partir de la cible.
 * Toujours scopé `cabinet_id`. Retourne null si la cible n'appartient pas au cabinet.
 */
async function resoudreContexte(
  cabinetId: string,
  cible: CibleRelance,
  typeDefaut: string,
): Promise<Contexte | null> {
  if (cible.kind === "echeance") {
    const [row] = await db.execute<Contexte>(sql`
      SELECT
        e.cabinet_id, e.client_id,
        e.id            AS echeance_id,
        NULL::uuid      AS document_attendu_id,
        e.type::text    AS type_echeance,
        e.libelle       AS libelle,
        to_char(e.date_echeance, 'YYYY-MM-DD') AS date_echeance,
        cl.raison_sociale  AS client_nom,
        cab.raison_sociale AS cabinet_nom,
        cl.langue::text AS client_langue,
        ct.id           AS contact_id
      FROM crm.echeance e
      JOIN crm.client cl   ON cl.id = e.client_id
      JOIN crm.cabinet cab ON cab.id = e.cabinet_id
      LEFT JOIN crm.contact ct
        ON ct.client_id = e.client_id AND ct.est_principal AND ct.archived_at IS NULL
      WHERE e.id = ${cible.echeanceId}::uuid
        AND e.cabinet_id = ${cabinetId}::uuid
        AND e.archived_at IS NULL
    `);
    return row ?? null;
  }

  if (cible.kind === "document") {
    const [row] = await db.execute<Contexte>(sql`
      SELECT
        da.cabinet_id, da.client_id,
        NULL::uuid      AS echeance_id,
        da.id           AS document_attendu_id,
        'relance_documents'::text AS type_echeance,
        da.type_document AS libelle,
        NULL::text      AS date_echeance,
        cl.raison_sociale  AS client_nom,
        cab.raison_sociale AS cabinet_nom,
        cl.langue::text AS client_langue,
        ct.id           AS contact_id
      FROM crm.document_attendu da
      JOIN crm.client cl   ON cl.id = da.client_id
      JOIN crm.cabinet cab ON cab.id = da.cabinet_id
      LEFT JOIN crm.contact ct
        ON ct.client_id = da.client_id AND ct.est_principal AND ct.archived_at IS NULL
      WHERE da.id = ${cible.documentAttenduId}::uuid
        AND da.cabinet_id = ${cabinetId}::uuid
        AND da.archived_at IS NULL
    `);
    return row ?? null;
  }

  // kind === "client" : relance globale documents manquants.
  const [row] = await db.execute<Contexte>(sql`
    SELECT
      cl.cabinet_id, cl.id AS client_id,
      NULL::uuid      AS echeance_id,
      NULL::uuid      AS document_attendu_id,
      ${typeDefaut}::text AS type_echeance,
      cl.raison_sociale AS libelle,
      NULL::text      AS date_echeance,
      cl.raison_sociale  AS client_nom,
      cab.raison_sociale AS cabinet_nom,
      cl.langue::text AS client_langue,
      ct.id           AS contact_id
    FROM crm.client cl
    JOIN crm.cabinet cab ON cab.id = cl.cabinet_id
    LEFT JOIN crm.contact ct
      ON ct.client_id = cl.id AND ct.est_principal AND ct.archived_at IS NULL
    WHERE cl.id = ${cible.clientId}::uuid
      AND cl.cabinet_id = ${cabinetId}::uuid
      AND cl.archived_at IS NULL
  `);
  return row ?? null;
}

/**
 * Crée un brouillon de relance pour une cible (échéance / document / client).
 *
 * - Idempotence ciblée : si un brouillon non envoyé existe DÉJÀ pour la même cible précise
 *   (échéance OU document), on ne le duplique pas (`deja_brouillon`). Une relance « client »
 *   (sans cible précise) n'est pas dédupliquée (geste explicite répétable).
 * - Renvoie le contenu rendu + un destinataire à confirmer côté UI. NE PART JAMAIS seul.
 */
export async function creerBrouillonRelance(
  cabinetId: string,
  cible: CibleRelance,
  opts: CreerBrouillonOptions = {},
): Promise<CreerBrouillonResult> {
  const typeDefaut = opts.typeEcheanceDefaut ?? "relance_documents";
  const ctx = await resoudreContexte(cabinetId, cible, typeDefaut);
  if (!ctx) return { status: "cible_introuvable" };

  // Idempotence : pas deux brouillons ouverts pour la même cible précise.
  if (cible.kind === "echeance") {
    const [existing] = await db.execute<{ id: string }>(sql`
      SELECT id FROM crm.relance
      WHERE cabinet_id = ${cabinetId}::uuid
        AND echeance_id = ${cible.echeanceId}::uuid
        AND statut = 'brouillon'
      LIMIT 1
    `);
    if (existing) return { status: "deja_brouillon", relanceId: existing.id };
  } else if (cible.kind === "document") {
    const [existing] = await db.execute<{ id: string }>(sql`
      SELECT id FROM crm.relance
      WHERE cabinet_id = ${cabinetId}::uuid
        AND document_attendu_id = ${cible.documentAttenduId}::uuid
        AND statut = 'brouillon'
      LIMIT 1
    `);
    if (existing) return { status: "deja_brouillon", relanceId: existing.id };
  }

  const langue = toModeleLangue(ctx.client_langue);
  const [modele] = await db.execute<{ objet: string; corps: string }>(sql`
    SELECT objet, corps FROM calendar.modele_relance
    WHERE type_echeance = ${ctx.type_echeance}::crm.type_echeance
      AND langue = ${langue}::calendar.langue
      AND actif = true
      AND (numero_relance = 1 OR numero_relance IS NULL)
      AND (cabinet_id = ${cabinetId}::uuid OR cabinet_id IS NULL)
    ORDER BY (cabinet_id IS NOT NULL) DESC, (numero_relance = 1) DESC
    LIMIT 1
  `);
  if (!modele) return { status: "sans_modele" };

  const vars: RelanceVariables = {
    client_nom: ctx.client_nom,
    echeance_libelle: ctx.libelle,
    date_echeance: ctx.date_echeance ?? "",
    responsable_nom: ctx.cabinet_nom,
    cabinet_nom: ctx.cabinet_nom,
  };
  const rendu = renderRelance({ objet: modele.objet, corps: modele.corps }, vars);

  const [inserted] = await db.execute<{ id: string }>(sql`
    INSERT INTO crm.relance
      (cabinet_id, client_id, echeance_id, document_attendu_id, canal,
       destinataire_contact_id, sujet, corps, statut, numero_dans_serie)
    VALUES (
      ${ctx.cabinet_id}::uuid, ${ctx.client_id}::uuid,
      ${ctx.echeance_id}::uuid, ${ctx.document_attendu_id}::uuid, 'email',
      ${ctx.contact_id}::uuid, ${rendu.objet}, ${rendu.corps}, 'brouillon', 1
    )
    RETURNING id
  `);

  return inserted?.id ? { status: "cree", relanceId: inserted.id } : { status: "cree" };
}
