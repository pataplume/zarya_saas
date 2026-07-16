/**
 * P0-6 — Traduction des erreurs `inviteUserByEmail` (Supabase Auth) en messages
 * français actionnables (AUDIT-MVP §8).
 *
 * Contexte : les actions d'invitation ignoraient la valeur de retour de
 * `admin.auth.admin.inviteUserByEmail`. En cas d'échec (rate limit du SMTP intégré
 * Supabase ~2-4 emails/h sans SMTP dédié, compte déjà existant…), l'UI affichait
 * « succès » alors qu'aucun email n'était parti.
 *
 * Fonctions pures — aucune dépendance DB/réseau (testables en unitaire).
 */

/** Forme minimale de l'erreur retournée par supabase-js (AuthError). */
export type ErreurInvitationSupabase = {
  message?: string | undefined;
  status?: number | undefined;
  code?: string | undefined;
} | null;

/** Un compte Supabase existe déjà pour cet email (invitation acceptée ou signup direct). */
export function estCompteDejaExistant(erreur: ErreurInvitationSupabase): boolean {
  if (!erreur) return false;
  if (erreur.code === "email_exists") return true;
  return /already\s+(?:been\s+)?registered|already\s+exists/i.test(erreur.message ?? "");
}

/** Rate limit d'envoi d'emails (SMTP intégré Supabase : ~2-4 emails/heure sans SMTP dédié). */
export function estLimiteEnvoiAtteinte(erreur: ErreurInvitationSupabase): boolean {
  if (!erreur) return false;
  if (erreur.code === "over_email_send_rate_limit" || erreur.code === "over_request_rate_limit") {
    return true;
  }
  if (erreur.status === 429) return true;
  return /rate\s*limit/i.test(erreur.message ?? "");
}

/**
 * Message français actionnable pour l'UI.
 * `renvoiDisponible` : l'écran appelant propose un bouton « Renvoyer l'invitation »
 * (cas /app/parametres/equipe) — on y oriente l'utilisateur.
 */
export function messageErreurInvitation(
  erreur: ErreurInvitationSupabase,
  options?: { renvoiDisponible?: boolean },
): string {
  if (estCompteDejaExistant(erreur)) {
    return options?.renvoiDisponible
      ? "Un compte existe déjà pour cet email — utilisez « Renvoyer l'invitation » ou demandez à la personne de se connecter."
      : "Un compte existe déjà pour cet email — demandez à la personne de se connecter.";
  }
  if (estLimiteEnvoiAtteinte(erreur)) {
    return "Limite d'envoi d'emails atteinte — réessayez dans une heure, ou espacez les invitations.";
  }
  return "L'envoi de l'email d'invitation a échoué. Réessayez dans quelques minutes ; si le problème persiste, contactez le support.";
}
