// Pipeline d'envoi email au nom du cabinet (Bloc D5). Couche métier au-dessus de
// l'envoi brut D2 (client.sendEmail) :
//  • identité expéditeur = la boîte Microsoft connectée du cabinet (envoi délégué) —
//    le From est nativement l'adresse cabinet, aucune config 'send-as' (boîtes
//    partagées = Phase 2) ;
//  • signature appliquée si fournie EN ENTRÉE par l'appelant (la persistance de la
//    signature cabinet = livrable onboarding-fiduciaire, hors D5 — cf. PLAN-MVP-BETA) ;
//  • statut retourné (sent / revoked / error) plutôt que lever : les consommateurs
//    (C2 relances, G5 notifs salaire) tracent le statut métier dans LEUR table et ne
//    doivent pas crasher sur un envoi raté. L'appel sendMail est déjà audité (D2).
//
// Serveur uniquement. Dépendance client injectable → testable sans réseau.

import { MicrosoftGraphClient } from "./client";
import { MicrosoftGraphError } from "./errors";
import type { SendEmailParams } from "./graph-types";

export interface SendCabinetEmailParams {
  to: string[];
  subject: string;
  body: string;
  bodyType?: "Text" | "HTML";
  cc?: string[];
  /** Signature à apposer (HTML ou texte selon bodyType). Fournie par l'appelant. */
  signature?: string;
  saveToSentItems?: boolean;
}

export type SendEmailOutcome =
  | { status: "sent" }
  // Token révoqué/expiré (401) → le cabinet doit reconnecter Microsoft (§9.2).
  | { status: "revoked" }
  | { status: "error"; code: string };

interface EmailSender {
  sendEmail(params: SendEmailParams): Promise<void>;
}

export interface SendCabinetEmailOptions {
  client?: EmailSender;
}

/**
 * Applique la signature au corps. PUR. Sépare par un double saut (texte) ou deux <br>
 * (HTML). Sans signature → corps inchangé.
 */
export function applySignature(
  body: string,
  signature: string | undefined,
  bodyType: "Text" | "HTML",
): string {
  if (!signature) return body;
  return bodyType === "HTML" ? `${body}<br><br>${signature}` : `${body}\n\n${signature}`;
}

/**
 * Envoie un email au nom du cabinet. Retourne un statut (ne lève pas) pour que les
 * appelants en lot (relances, notifs) tracent et continuent.
 */
export async function sendCabinetEmail(
  cabinet_id: string,
  params: SendCabinetEmailParams,
  opts: SendCabinetEmailOptions = {},
): Promise<SendEmailOutcome> {
  const client = opts.client ?? new MicrosoftGraphClient(cabinet_id);
  const bodyType = params.bodyType ?? "Text";
  const body = applySignature(params.body, params.signature, bodyType);

  try {
    await client.sendEmail({
      to: params.to,
      subject: params.subject,
      body,
      bodyType,
      ...(params.cc ? { cc: params.cc } : {}),
      ...(params.saveToSentItems !== undefined ? { saveToSentItems: params.saveToSentItems } : {}),
    });
    return { status: "sent" };
  } catch (err) {
    if (err instanceof MicrosoftGraphError && err.code === "revoked") {
      return { status: "revoked" };
    }
    const code = err instanceof MicrosoftGraphError ? err.code : "error";
    return { status: "error", code };
  }
}
