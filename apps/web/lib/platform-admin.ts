// P0-7 (AUDIT-MVP §8) — accès plateforme au mini back-office des demandes d'accès
// (/app/admin/demandes). La liste des admins ZARYA vit dans PLATFORM_ADMIN_EMAILS
// (emails séparés par des virgules, comparaison insensible à la casse), vérifiée
// CÔTÉ SERVEUR uniquement. Fonctions pures : la lecture de process.env reste à la
// charge de l'appelant (server component / server action). Testé dans
// tests/unit/platform-admin.test.ts.

/** Parse PLATFORM_ADMIN_EMAILS : split virgules, trim, minuscules, vides ignorés. */
export function parsePlatformAdminEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** Vrai si `email` figure dans la liste (insensible à la casse). Liste vide = personne. */
export function isPlatformAdmin(
  email: string | null | undefined,
  raw: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalise = email.trim().toLowerCase();
  if (normalise.length === 0) return false;
  return parsePlatformAdminEmails(raw).includes(normalise);
}
