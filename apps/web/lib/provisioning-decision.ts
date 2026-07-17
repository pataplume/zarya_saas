// P0-8 — Décision de réparation du provisioning (AUDIT-MVP.md §8).
//
// Au signup, si provisionNewCabinet échoue APRÈS supabase.auth.signUp, l'utilisateur
// auth existe sans cabinet → boucle infinie login ↔ onboarding au prochain login.
// Cette fonction PURE (zéro import, zéro I/O) décide de l'action de réparation à
// partir de l'état observé ; l'exécution (DB, admin API, refresh session) vit dans
// le route handler /auth/reparer.

/** Ligne crm.cabinet_membre existante pour ce user (projection minimale). */
export interface MembreExistant {
  cabinet_id: string;
  role: string;
  actif: boolean;
}

/** État observé de l'utilisateur authentifié au point de décision. */
export interface EtatProvisioningUser {
  /** `app_metadata.cabinet_id` du JWT (claim) — null si absent. */
  cabinet_id_claim: string | null;
  /** Email de l'utilisateur auth — nécessaire pour re-provisionner. */
  email: string | null;
  /** Lignes crm.cabinet_membre trouvées pour ce user_id. */
  membres: MembreExistant[];
}

export type DecisionReparation =
  /** Le claim est déjà présent — rien à réparer, continuer le flux normal. */
  | { action: "rien_a_faire" }
  /** Provisioning partiel : le membre existe, seul app_metadata manque. */
  | { action: "reparer_metadata"; cabinet_id: string; role: string }
  /** Aucune trace en DB : re-provisionner (cabinet + membre + app_metadata). */
  | { action: "provisionner"; email: string }
  /** Irréparable automatiquement → page d'erreur + support. */
  | { action: "erreur"; raison: "membre_inactif" | "email_absent" };

/**
 * Décide l'action de réparation pour un utilisateur authentifié.
 * Idempotente : rejouer la décision sur l'état réparé donne "rien_a_faire".
 */
export function deciderReparationProvisioning(etat: EtatProvisioningUser): DecisionReparation {
  // Claim présent → l'utilisateur n'est pas briqué (le flux normal s'en charge).
  if (etat.cabinet_id_claim) {
    return { action: "rien_a_faire" };
  }

  // Provisioning partiel : une ligne cabinet_membre active existe déjà →
  // il ne manque que l'injection app_metadata (ré-appliquer, pas re-créer).
  const membreActif = etat.membres.find((m) => m.actif);
  if (membreActif) {
    return {
      action: "reparer_metadata",
      cabinet_id: membreActif.cabinet_id,
      role: membreActif.role,
    };
  }

  // Membre existant mais désactivé : ne JAMAIS ré-injecter l'accès d'un membre
  // révoqué, ni lui créer un cabinet neuf en douce — cas support humain.
  if (etat.membres.length > 0) {
    return { action: "erreur", raison: "membre_inactif" };
  }

  // Aucune trace : re-provisionner via la logique existante (il faut un email).
  if (!etat.email) {
    return { action: "erreur", raison: "email_absent" };
  }

  return { action: "provisionner", email: etat.email };
}
