// G5b — Relances + escalade du cycle salaire (flow E §3 / salaire.md §7.7).
//
// Mode A (validation humaine, comme C2) : le cron GÉNÈRE des brouillons de relance (sans envoi) ;
// l'envoi se fait après validation humaine (envoyerRelanceSalaire). Max 1 relance/cycle ; pause
// vacances client (calendar.pause_client) respectée. Escalade : périodes en retard → en_retard.
// Réf : salaire.md §7.7 ; KICKOFF G5 ; ADR 0016/0019.

import {
  and,
  client as clientTable,
  db,
  eq,
  evenementSalaire,
  periode as periodeTable,
  relanceSalaire,
  sql,
} from "@zarya/db";
import { sendCabinetEmailTracked } from "@zarya/integrations";

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

export interface RelanceContexte {
  raison_sociale: string;
  mois: number;
  annee: number;
  date_limite: string;
}

/** Sujet + corps d'une relance. PUR, FR. */
export function buildRelanceTemplate(ctx: RelanceContexte): { sujet: string; corps: string } {
  const moisLib = `${MOIS_FR[ctx.mois - 1]} ${ctx.annee}`;
  return {
    sujet: `Rappel : vos salaires de ${moisLib} sont à valider`,
    corps:
      `Bonjour,\n\nIl vous reste peu de temps pour valider les salaires de ${moisLib} de ${ctx.raison_sociale} ` +
      `(échéance le ${ctx.date_limite}). Merci de vous connecter à votre espace pour finaliser la période.`,
  };
}

export interface GenererBrouillonsRelancesInput {
  annee: number;
  mois: number;
  cabinet_id?: string;
}

/**
 * Génère les BROUILLONS de relance (mode A — pas d'envoi) pour les périodes non validées dont
 * l'échéance approche (≤ 5 j), hors pause vacances, max 1/cycle. Idempotent.
 */
export async function genererBrouillonsRelancesSalaire(
  input: GenererBrouillonsRelancesInput,
): Promise<{ brouillons_crees: number }> {
  const candidats = (await db.execute(sql`
    SELECT p.id, p.cabinet_id, p.client_id
    FROM salaire.periode p
    WHERE p.annee = ${input.annee} AND p.mois = ${input.mois}
      AND p.statut IN ('en_attente', 'relancee')
      AND p.date_limite_validation >= CURRENT_DATE
      AND p.date_limite_validation <= CURRENT_DATE + INTERVAL '5 days'
      AND ${input.cabinet_id ? sql`p.cabinet_id = ${input.cabinet_id}` : sql`true`}
      AND NOT EXISTS (SELECT 1 FROM salaire.relance r WHERE r.periode_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM calendar.pause_client pc
        WHERE pc.client_id = p.client_id AND pc.actif = true
          AND CURRENT_DATE BETWEEN pc.date_debut AND pc.date_fin
      )
  `)) as unknown as Array<{ id: string; cabinet_id: string; client_id: string }>;

  let crees = 0;
  for (const c of candidats) {
    await db.insert(relanceSalaire).values({
      cabinet_id: c.cabinet_id,
      client_id: c.client_id,
      periode_id: c.id,
      numero: 1,
      auto_generated: true,
      valide_par_humain: false,
    });
    crees++;
  }
  return { brouillons_crees: crees };
}

/**
 * Escalade : passe en `en_retard` les périodes dont l'échéance est dépassée et non validées.
 * Journalise (statut_modifie). Idempotent. Retourne le nombre de périodes escaladées.
 */
export async function escaladerPeriodesEnRetard(
  input: GenererBrouillonsRelancesInput,
): Promise<{ escaladees: number }> {
  const enRetard = (await db.execute(sql`
    SELECT id, cabinet_id, client_id FROM salaire.periode
    WHERE annee = ${input.annee} AND mois = ${input.mois}
      AND statut IN ('en_attente', 'relancee')
      AND date_limite_validation < CURRENT_DATE
      AND ${input.cabinet_id ? sql`cabinet_id = ${input.cabinet_id}` : sql`true`}
  `)) as unknown as Array<{ id: string; cabinet_id: string; client_id: string }>;

  for (const p of enRetard) {
    await db
      .update(periodeTable)
      .set({ statut: "en_retard", updated_at: new Date() })
      .where(eq(periodeTable.id, p.id));
    await db.insert(evenementSalaire).values({
      cabinet_id: p.cabinet_id,
      client_id: p.client_id,
      periode_id: p.id,
      type: "statut_modifie",
      acteur_type: "systeme",
      metadata: { vers: "en_retard", motif: "echeance_depassee" },
    });
  }
  return { escaladees: enRetard.length };
}

type TrackedSenderLike = {
  sendEmailTracked: (params: {
    to: string[];
    subject: string;
    body: string;
    bodyType?: "Text" | "HTML";
  }) => Promise<{ messageId: string; internetMessageId: string | null }>;
};

export interface EnvoyerRelanceInput {
  cabinet_id: string;
  relance_id: string;
  destinataire_email: string;
  /** Sender injectable (tests). */
  sender?: TrackedSenderLike;
}

export interface EnvoyerRelanceResult {
  status: "envoyee" | "echec" | "ignoree";
  raison?: string;
}

/**
 * Envoie une relance (après validation humaine, mode A) via Graph tracé. Marque la relance
 * `valide_par_humain` + graph_message_id, passe la période en `relancee`, journalise. Scopé cabinet.
 */
export async function envoyerRelanceSalaire(
  input: EnvoyerRelanceInput,
): Promise<EnvoyerRelanceResult> {
  const [r] = await db
    .select({
      id: relanceSalaire.id,
      periode_id: relanceSalaire.periode_id,
      client_id: relanceSalaire.client_id,
      valide_par_humain: relanceSalaire.valide_par_humain,
    })
    .from(relanceSalaire)
    .where(
      and(eq(relanceSalaire.id, input.relance_id), eq(relanceSalaire.cabinet_id, input.cabinet_id)),
    )
    .limit(1);
  if (!r) return { status: "ignoree", raison: "relance_introuvable" };
  if (r.valide_par_humain) return { status: "ignoree", raison: "deja_envoyee" };

  const [p] = await db
    .select({
      annee: periodeTable.annee,
      mois: periodeTable.mois,
      date_limite: periodeTable.date_limite_validation,
      statut: periodeTable.statut,
    })
    .from(periodeTable)
    .where(eq(periodeTable.id, r.periode_id))
    .limit(1);
  const [cli] = await db
    .select({ raison_sociale: clientTable.raison_sociale })
    .from(clientTable)
    .where(eq(clientTable.id, r.client_id))
    .limit(1);

  const tpl = buildRelanceTemplate({
    raison_sociale: cli?.raison_sociale ?? "votre entreprise",
    mois: p?.mois ?? 1,
    annee: p?.annee ?? 2026,
    date_limite: String(p?.date_limite ?? ""),
  });

  const outcome = await sendCabinetEmailTracked(
    input.cabinet_id,
    { to: [input.destinataire_email], subject: tpl.sujet, body: tpl.corps },
    input.sender ? { client: input.sender as never } : {},
  );
  if (outcome.status !== "sent") return { status: "echec", raison: outcome.status };

  const now = new Date();
  await db
    .update(relanceSalaire)
    .set({
      valide_par_humain: true,
      sujet: tpl.sujet,
      corps: tpl.corps,
      date_envoi: now,
      graph_message_id: outcome.messageId,
    })
    .where(eq(relanceSalaire.id, r.id));
  if (p?.statut === "en_attente") {
    await db
      .update(periodeTable)
      .set({ statut: "relancee", updated_at: now })
      .where(eq(periodeTable.id, r.periode_id));
  }
  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: r.client_id,
    periode_id: r.periode_id,
    type: "relance_envoyee",
    acteur_type: "humain_fiduciaire",
  });

  return { status: "envoyee" };
}
