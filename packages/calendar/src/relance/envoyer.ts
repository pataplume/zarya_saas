// Envoi des relances validées (Bloc C2b, Mode A). Consomme l'envoi tracé D5
// (sendCabinetEmailTracked, draft+send) pour récupérer l'internetMessageId (tracking
// réponses C4, ADR 0019), bascule la relance `brouillon`→`envoyee`, stocke les ids et
// émet un événement `relance_envoyee`. NE LÈVE PAS : retourne un statut par relance
// (lot non interrompu). Dépendance d'envoi injectable → testable sans réseau.

import { db, sql } from "@zarya/db";
import {
  type SendCabinetEmailParams,
  type SendCabinetEmailTrackedOutcome,
  sendCabinetEmailTracked,
} from "@zarya/integrations";

/** Plafond d'un lot d'envoi (au-delà, le reste est reporté au prochain lot). */
export const PLAFOND_LOT = 50;

export type EnvoyerRelanceStatus =
  | "envoyee"
  | "introuvable"
  | "deja_envoyee"
  | "sans_destinataire"
  | "revoked"
  | "error";

export interface EnvoyerRelanceResult {
  status: EnvoyerRelanceStatus;
  code?: string;
}

export interface EnvoyerRelanceOptions {
  /** Envoi tracé (défaut : sendCabinetEmailTracked → Graph draft+send). */
  send?: (
    cabinetId: string,
    params: SendCabinetEmailParams,
  ) => Promise<SendCabinetEmailTrackedOutcome>;
  /** Signature à apposer (fournie par l'appelant ; stockage = onboarding, hors scope). */
  signature?: string;
  now?: () => number;
}

type RelanceRow = {
  id: string;
  cabinet_id: string;
  client_id: string;
  statut: string;
  sujet: string | null;
  corps: string | null;
  dest_email: string | null;
};

/**
 * Envoie UNE relance en brouillon : draft+send, puis bascule envoyee + stocke les ids +
 * événement. Idempotent par statut (une relance déjà envoyée n'est pas renvoyée).
 */
export async function envoyerRelance(
  relanceId: string,
  opts: EnvoyerRelanceOptions = {},
): Promise<EnvoyerRelanceResult> {
  const [r] = await db.execute<RelanceRow>(sql`
    SELECT r.id, r.cabinet_id, r.client_id, r.statut::text AS statut, r.sujet, r.corps,
           ct.email AS dest_email
    FROM crm.relance r
    LEFT JOIN crm.contact ct ON ct.id = r.destinataire_contact_id
    WHERE r.id = ${relanceId}::uuid
  `);

  if (!r) return { status: "introuvable" };
  if (r.statut !== "brouillon") return { status: "deja_envoyee" };
  if (!r.dest_email) return { status: "sans_destinataire" };

  const send = opts.send ?? sendCabinetEmailTracked;
  const params: SendCabinetEmailParams = {
    to: [r.dest_email],
    subject: r.sujet ?? "",
    body: r.corps ?? "",
    ...(opts.signature ? { signature: opts.signature } : {}),
  };
  const outcome = await send(r.cabinet_id, params);

  if (outcome.status === "revoked") return { status: "revoked" };
  if (outcome.status === "error") return { status: "error", code: outcome.code };

  const now = opts.now ?? Date.now;
  await db.execute(sql`
    UPDATE crm.relance
    SET statut = 'envoyee',
        date_envoi = ${new Date(now()).toISOString()}::timestamptz,
        microsoft_message_id = ${outcome.messageId},
        internet_message_id = ${outcome.internetMessageId},
        updated_at = now()
    WHERE id = ${relanceId}::uuid
  `);
  await db.execute(sql`
    INSERT INTO crm.evenement
      (cabinet_id, client_id, type, acteur_type, ressource_type, ressource_id, description, metadata)
    VALUES (
      ${r.cabinet_id}::uuid, ${r.client_id}::uuid, 'relance_envoyee', 'systeme', 'relance',
      ${relanceId}::uuid, 'Relance envoyée',
      ${JSON.stringify({ microsoft_message_id: outcome.messageId })}::jsonb
    )
  `);
  return { status: "envoyee" };
}

export interface EnvoyerLotResult {
  traitees: number;
  envoyees: number;
  echecs: number;
  plafonnees: boolean;
}

/**
 * Envoie un lot de relances (séquentiel, plafonné à PLAFOND_LOT). Best-effort : un échec
 * n'interrompt pas le lot. Le reste au-delà du plafond est reporté (plafonnees = true).
 */
export async function envoyerRelancesValidees(
  relanceIds: string[],
  opts: EnvoyerRelanceOptions = {},
): Promise<EnvoyerLotResult> {
  const lot = relanceIds.slice(0, PLAFOND_LOT);
  let envoyees = 0;
  let echecs = 0;
  for (const id of lot) {
    const res = await envoyerRelance(id, opts);
    if (res.status === "envoyee") envoyees++;
    else echecs++;
  }
  return {
    traitees: lot.length,
    envoyees,
    echecs,
    plafonnees: relanceIds.length > PLAFOND_LOT,
  };
}
