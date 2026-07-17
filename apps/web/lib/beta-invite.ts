// P0-7 (AUDIT-MVP §8) — gating optionnel de /signup par code d'invitation.
// Si BETA_INVITE_CODE est définie (non vide), l'inscription exige ce code ; si
// l'env est absente ou vide, le comportement historique (signup ouvert) est
// inchangé. Le code n'est JAMAIS envoyé au client : seul un booléen (gating
// actif ou non) est passé du server component au formulaire. Fonctions pures,
// testées dans tests/unit/beta-invite.test.ts.

/** Vrai si le gating est actif : BETA_INVITE_CODE définie et non vide (espaces ignorés). */
export function inviteGatingActif(codeAttendu: string | null | undefined): boolean {
  return typeof codeAttendu === "string" && codeAttendu.trim().length > 0;
}

/**
 * Vrai si le code saisi est accepté. Gating inactif (env absente/vide) = toujours
 * accepté ; gating actif = comparaison stricte après trim des deux côtés.
 */
export function verifierCodeInvitation(
  saisie: unknown,
  codeAttendu: string | null | undefined,
): boolean {
  const attendu = typeof codeAttendu === "string" ? codeAttendu.trim() : "";
  if (attendu.length === 0) return true;
  return typeof saisie === "string" && saisie.trim() === attendu;
}
