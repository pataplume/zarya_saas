// G5a — Notifications du cycle salaire (flow E §3 / salaire.md §7.7). Envoi via Microsoft Graph
// (sendCabinetEmail). Templates CODÉS FR (arbitré founder ; DE/IT différés). Max 1 notification
// par (période, type) — idempotent. Réf : salaire.md §5/§7.7 ; KICKOFF G5 ; ADR 0016.

import {
  accesClient,
  and,
  client as clientTable,
  db,
  eq,
  evenementSalaire,
  notificationSalaire,
  periode as periodeTable,
} from "@zarya/db";
import { sendCabinetEmail } from "@zarya/integrations";

export type TypeNotificationCycle =
  | "initiale"
  | "confirmation_validation"
  | "modification_fiduciaire"
  | "cloture";

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export interface TemplateContexte {
  raison_sociale: string;
  mois: number;
  annee: number;
  date_limite: string;
}

export interface EmailTemplate {
  sujet: string;
  corps: string;
}

/** Construit le sujet + corps d'une notification de cycle. PUR. FR. */
export function buildNotificationTemplate(
  type: TypeNotificationCycle,
  ctx: TemplateContexte,
): EmailTemplate {
  const moisLib = `${MOIS_FR[ctx.mois - 1]} ${ctx.annee}`;
  switch (type) {
    case "initiale":
      return {
        sujet: `Vos salaires de ${moisLib} sont à valider`,
        corps:
          `Bonjour,\n\nLes éléments de salaire de ${ctx.raison_sociale} pour ${moisLib} sont prêts. ` +
          `Merci de les vérifier et de les valider d'ici le ${ctx.date_limite}.\n\n` +
          `Connectez-vous à votre espace pour compléter et valider la période.`,
      };
    case "confirmation_validation":
      return {
        sujet: `Salaires de ${moisLib} : validation reçue`,
        corps: `Bonjour,\n\nNous avons bien reçu la validation des salaires de ${moisLib} pour ${ctx.raison_sociale}. Merci !`,
      };
    case "modification_fiduciaire":
      return {
        sujet: `Salaires de ${moisLib} : complétés par votre fiduciaire`,
        corps:
          `Bonjour,\n\nVotre fiduciaire a complété les éléments de salaire de ${moisLib} pour ` +
          `${ctx.raison_sociale}. Vous pouvez les consulter dans votre espace.`,
      };
    case "cloture":
      return {
        sujet: `Salaires de ${moisLib} : clôturés`,
        corps: `Bonjour,\n\nLes salaires de ${moisLib} pour ${ctx.raison_sociale} sont clôturés. Aucune action requise.`,
      };
  }
}

// Sender injectable pour les tests (compatible sendCabinetEmail opts.client).
type EmailSenderLike = {
  sendEmail: (params: {
    to: string[];
    subject: string;
    body: string;
    bodyType?: "Text" | "HTML";
  }) => Promise<unknown>;
};

export interface EnvoyerNotificationInput {
  cabinet_id: string;
  periode_id: string;
  type: TypeNotificationCycle;
  /** Destinataire explicite ; sinon résolu depuis salaire.acces_client (actif). */
  destinataire_email?: string;
  /** Sender injectable (tests). */
  sender?: EmailSenderLike;
}

export interface EnvoyerNotificationResult {
  status: "envoyee" | "echec" | "ignoree";
  raison?: string;
}

/**
 * Envoie une notification de cycle (idempotent : 1 max par période/type). Enregistre
 * salaire.notification + l'événement. Pour `initiale`, passe la période en `en_attente`.
 */
export async function envoyerNotificationCycle(
  input: EnvoyerNotificationInput,
): Promise<EnvoyerNotificationResult> {
  // Période scopée cabinet.
  const [p] = await db
    .select({
      id: periodeTable.id,
      client_id: periodeTable.client_id,
      annee: periodeTable.annee,
      mois: periodeTable.mois,
      statut: periodeTable.statut,
    })
    .from(periodeTable)
    .where(
      and(eq(periodeTable.id, input.periode_id), eq(periodeTable.cabinet_id, input.cabinet_id)),
    )
    .limit(1);
  if (!p) return { status: "ignoree", raison: "periode_introuvable" };

  // Idempotence : une notification de ce type existe déjà pour la période ?
  const [existante] = await db
    .select({ id: notificationSalaire.id })
    .from(notificationSalaire)
    .where(
      and(
        eq(notificationSalaire.periode_id, input.periode_id),
        eq(notificationSalaire.type, input.type),
      ),
    )
    .limit(1);
  if (existante) return { status: "ignoree", raison: "deja_envoyee" };

  // Client (raison sociale) + date limite.
  const [cli] = await db
    .select({ raison_sociale: clientTable.raison_sociale })
    .from(clientTable)
    .where(eq(clientTable.id, p.client_id))
    .limit(1);
  const [per] = await db
    .select({ date_limite: periodeTable.date_limite_validation })
    .from(periodeTable)
    .where(eq(periodeTable.id, input.periode_id))
    .limit(1);

  // Destinataire : explicite ou contact RH actif.
  let destinataire = input.destinataire_email;
  if (!destinataire) {
    const [acces] = await db
      .select({ email: accesClient.email })
      .from(accesClient)
      .where(and(eq(accesClient.client_id, p.client_id), eq(accesClient.actif, true)))
      .limit(1);
    destinataire = acces?.email;
  }
  if (!destinataire) return { status: "ignoree", raison: "pas_de_destinataire" };

  const tpl = buildNotificationTemplate(input.type, {
    raison_sociale: cli?.raison_sociale ?? "votre entreprise",
    mois: p.mois,
    annee: p.annee,
    date_limite: String(per?.date_limite ?? ""),
  });

  const outcome = await sendCabinetEmail(
    input.cabinet_id,
    { to: [destinataire], subject: tpl.sujet, body: tpl.corps },
    input.sender ? { client: input.sender as never } : {},
  );
  const statut_envoi = outcome.status === "sent" ? "envoyee" : "echec";

  await db.insert(notificationSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: p.client_id,
    periode_id: input.periode_id,
    type: input.type,
    destinataire_email: destinataire,
    sujet: tpl.sujet,
    corps: tpl.corps,
    langue: "fr",
    statut_envoi,
  });
  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: p.client_id,
    periode_id: input.periode_id,
    type: "notification_envoyee",
    acteur_type: "systeme",
  });

  // L'envoi initial = demande de validation → période en_attente.
  if (input.type === "initiale" && statut_envoi === "envoyee" && p.statut === "non_demandee") {
    await db
      .update(periodeTable)
      .set({ statut: "en_attente", date_notification_envoyee: new Date(), updated_at: new Date() })
      .where(eq(periodeTable.id, input.periode_id));
  }

  return { status: statut_envoi };
}
