/**
 * Caviardage anti-clair des traces d'audit (extraction.invocation.raw_output / error_message).
 *
 * Contexte (ADR 0013) : l'IBAN et le numéro AVS ne doivent JAMAIS être persistés en clair au
 * repos. Les entités métier (proposition_facture, facture, salaire.employe) passent déjà par le
 * Vault. MAIS la sortie BRUTE de l'extracteur (réponse LLM live, proposal stub, texte océrisé)
 * est tracée dans `extraction.invocation.raw_output` (jsonb) pour l'audit/le debug — et peut
 * contenir un IBAN/AVS en clair (transcription IA, QR-bill, texte vision). Le sceau anti-clair
 * (tests/integration/anti-plaintext) ne scanne que les NOMS de colonnes, pas le contenu jsonb :
 * ce caviardage est la défense pour ce contenu.
 *
 * On masque IBAN/AVS partout où ils apparaissent — champ d'objet OU sous-chaîne d'une string
 * (ex. JSON sérialisé dans `choices[].message.content`) — en conservant tout le reste pour le
 * debug (clés, nombres, métadonnées). Le texte FONCTIONNEL `doc.fichier_physique.ocr_text` n'est
 * PAS concerné : c'est un store de contenu assumé, distinct du journal d'audit.
 */

// IBAN : 2 lettres pays + 2 chiffres de clé + 11 à 30 alphanum (CH = CH + 19 chiffres = 21 car.).
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
// Numéro AVS suisse : 756 + 4 + 4 + 2 chiffres ; séparateurs '.'/espace optionnels.
const AVS_RE = /\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/g;

/** Masque un IBAN en conservant pays + 3 derniers caractères (cohérent avec masqueIban). */
function maskIban(iban: string): string {
  const compact = iban.replace(/\s/g, "");
  return `${compact.slice(0, 4)}…${compact.slice(-3)}`;
}

/** Caviarde IBAN et AVS dans une chaîne (AVS d'abord : motif disjoint, évite tout chevauchement). */
export function redactSensitiveText(value: string): string {
  return value.replace(AVS_RE, "756.****.****.**").replace(IBAN_RE, maskIban);
}

/**
 * Caviarde récursivement IBAN/AVS dans une valeur arbitraire (objet, tableau, string) destinée à
 * une trace d'audit. PUR : retourne une copie caviardée, ne mute pas l'entrée. Les types non-string
 * (nombres, booléens) sont préservés tels quels — donc les champs fonctionnels d'audit (ex.
 * `{ passe: 2, champs: [...] }`) restent intacts.
 */
export function redactSensitiveForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactSensitiveText(value.message) };
  }
  if (Array.isArray(value)) return value.map(redactSensitiveForAudit);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactSensitiveForAudit(val);
  }
  return out;
}
