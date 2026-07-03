"use server";

import { requireAuth } from "@zarya/auth";
import { accesClient, and, db, eq, relanceSalaire } from "@zarya/db";
import { envoyerRelanceSalaire } from "@zarya/extraction";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMembreSignature } from "@/lib/membre-signature";

// Run F1 — server actions de la file de validation des relances salaire (mode A, G5b).
// L'envoi réel (Graph tracé + transition période + journal) vit dans @zarya/extraction
// (envoyerRelanceSalaire) ; ces actions ajoutent AUTH + SCOPE cabinet + RBAC + résolution
// du destinataire (accès client actif). Anti-fuite : chaque action re-vérifie l'appartenance
// au cabinet de l'acteur (frontière réelle sur le chemin service-role — ADR 0005 addendum).

const ROLES_VALIDATION = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);
const RELANCES_PATH = "/app/salaire/relances";

export type RelanceSalaireActionState = { error?: string; success?: boolean };
export type RelanceSalaireLotState = {
  error?: string;
  envoyees?: number;
  echecs?: number;
  ignores?: number;
};

const snoozerSchema = z.object({
  relanceId: z.string().uuid(),
  jours: z.number().int().min(1).max(30),
});

function acteur(user: { app_metadata: Record<string, unknown> }) {
  return {
    cabinet_id: user.app_metadata.cabinet_id as string | undefined,
    role: (user.app_metadata.role as string | undefined) ?? "lecteur",
  };
}

/** Envoie une relance salaire en brouillon, scopée cabinet. Renvoie son statut. */
async function envoyerUneRelance(
  relanceId: string,
  cabinet_id: string,
  signature?: string,
): Promise<"envoyee" | "sans_destinataire" | "ignoree" | "echec"> {
  const [row] = await db
    .select({
      id: relanceSalaire.id,
      client_id: relanceSalaire.client_id,
      valide: relanceSalaire.valide_par_humain,
    })
    .from(relanceSalaire)
    .where(and(eq(relanceSalaire.id, relanceId), eq(relanceSalaire.cabinet_id, cabinet_id)))
    .limit(1);
  if (!row || row.valide) return "ignoree";

  const [acces] = await db
    .select({ email: accesClient.email })
    .from(accesClient)
    .where(and(eq(accesClient.client_id, row.client_id), eq(accesClient.actif, true)))
    .limit(1);
  if (!acces?.email) return "sans_destinataire";

  const res = await envoyerRelanceSalaire({
    cabinet_id,
    relance_id: relanceId,
    destinataire_email: acces.email,
    ...(signature ? { signature } : {}),
  });
  if (res.status === "envoyee") return "envoyee";
  if (res.status === "ignoree") return "ignoree";
  return "echec";
}

/** Valide + envoie une relance salaire (1-clic). */
export async function envoyerRelanceSalaireAction(
  relanceId: string,
): Promise<RelanceSalaireActionState> {
  const user = await requireAuth();
  const { cabinet_id, role } = acteur(user);
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const signature = await getMembreSignature(user.id, cabinet_id);
  const outcome = await envoyerUneRelance(relanceId, cabinet_id, signature);
  revalidatePath(RELANCES_PATH);
  if (outcome === "envoyee") return { success: true };
  if (outcome === "sans_destinataire") return { error: "Aucun destinataire actif pour ce client." };
  if (outcome === "ignoree") return { error: "Relance déjà envoyée ou introuvable." };
  return { error: "Échec de l'envoi (reconnexion Microsoft possible)." };
}

/** Valide + envoie un lot de relances salaire (anti-fuite : seules celles du cabinet). */
export async function envoyerLotRelancesSalaireAction(
  relanceIds: string[],
): Promise<RelanceSalaireLotState> {
  const user = await requireAuth();
  const { cabinet_id, role } = acteur(user);
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };
  if (relanceIds.length === 0) return { envoyees: 0, echecs: 0, ignores: 0 };

  const signature = await getMembreSignature(user.id, cabinet_id);
  let envoyees = 0;
  let echecs = 0;
  let ignores = 0;
  for (const id of relanceIds) {
    const outcome = await envoyerUneRelance(id, cabinet_id, signature);
    if (outcome === "envoyee") envoyees++;
    else if (outcome === "ignoree" || outcome === "sans_destinataire") ignores++;
    else echecs++;
  }
  revalidatePath(RELANCES_PATH);
  return { envoyees, echecs, ignores };
}

/**
 * Reporte une relance salaire en brouillon ("Traiter plus tard") — symétrique à
 * `snoozerRelanceAction` du module Calendar (RUN6 usabilité, migration 0055).
 * `snoozed_par` n'est volontairement pas résolu ici : il référence `crm.cabinet_membre.id`,
 * pas `auth.users.id`, et aucun helper de résolution user→cabinet_membre n'existe dans ce
 * repo — le champ reste `null` (traçabilité optionnelle, pas bloquant).
 */
export async function snoozerRelanceSalaireAction(
  relanceId: string,
  jours: number,
): Promise<RelanceSalaireActionState> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const parsed = snoozerSchema.safeParse({ relanceId, jours });
  if (!parsed.success) return { error: "Paramètres invalides." };

  const snoozedUntil = new Date(Date.now() + parsed.data.jours * 24 * 60 * 60 * 1000);
  const updated = await db
    .update(relanceSalaire)
    .set({ snoozed_until: snoozedUntil })
    .where(
      and(eq(relanceSalaire.id, parsed.data.relanceId), eq(relanceSalaire.cabinet_id, cabinet_id)),
    )
    .returning({ id: relanceSalaire.id });
  if (updated.length === 0) return { error: "Relance introuvable." };

  revalidatePath(RELANCES_PATH);
  return { success: true };
}
