"use server";

import { requireAuth } from "@zarya/auth";
import { accesClient, and, db, eq, relanceSalaire } from "@zarya/db";
import { envoyerRelanceSalaire } from "@zarya/extraction";
import { revalidatePath } from "next/cache";

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
  });
  if (res.status === "envoyee") return "envoyee";
  if (res.status === "ignoree") return "ignoree";
  return "echec";
}

/** Valide + envoie une relance salaire (1-clic). */
export async function envoyerRelanceSalaireAction(
  relanceId: string,
): Promise<RelanceSalaireActionState> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const outcome = await envoyerUneRelance(relanceId, cabinet_id);
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
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };
  if (relanceIds.length === 0) return { envoyees: 0, echecs: 0, ignores: 0 };

  let envoyees = 0;
  let echecs = 0;
  let ignores = 0;
  for (const id of relanceIds) {
    const outcome = await envoyerUneRelance(id, cabinet_id);
    if (outcome === "envoyee") envoyees++;
    else if (outcome === "ignoree" || outcome === "sans_destinataire") ignores++;
    else echecs++;
  }
  revalidatePath(RELANCES_PATH);
  return { envoyees, echecs, ignores };
}
