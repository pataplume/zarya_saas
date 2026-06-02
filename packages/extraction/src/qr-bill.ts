/**
 * Décodage QR-facture suisse (Swiss QR-bill) — couche DÉTERMINISTE (Bloc E2, ADR 0020).
 *
 * Deux couches (ADR 0020) :
 *   1. Obtenir le payload depuis le document (rendu image + lecture QR) — DIFFÉRÉE, exposée
 *      ici derrière le seam `decodeQrFromDocument` (non câblé : renvoie null → fallback IA E3).
 *   2. Parser + valider le payload SPC (texte déterministe, AUCUNE dépendance) — implémentée ici.
 *
 * Principe directeur (facture.md §4.4) : décodage déterministe AVANT tout LLM pour les
 * données de paiement (IBAN/QR-IBAN, créancier, montant, devise, débiteur, référence).
 * L'IA (E3) ne complète que les champs hors QR.
 *
 * Identification : un QR-bill commence par l'en-tête `SPC` (Swiss Payments Code). La « croix
 * suisse » de la doc est le marqueur VISUEL/humain ; en code, l'en-tête SPC suffit (ADR 0020).
 *
 * Références : docs/modules/facture.md §4.4 ; ADR 0020 ; SIX « Swiss Implementation
 * Guidelines QR-bill » v2.x (payload v0200/0210).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Type de référence de paiement (élément RmtInf/Tp du payload SPC). */
export type ReferenceType = "QRR" | "SCOR" | "NON";

/** Devise admise par la norme QR-bill. */
export type QrBillCurrency = "CHF" | "EUR";

/** Bloc adresse (créancier / créancier final / débiteur final). */
export interface QrBillParty {
  /** Type d'adresse : `S` = structurée, `K` = combinée. */
  addressType: "S" | "K" | null;
  name: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  town: string | null;
  country: string | null;
}

/** Structure typée d'un payload SPC parsé. */
export interface SwissQrBill {
  version: string;
  /** IBAN ou QR-IBAN du créancier (normalisé : sans espaces, majuscules). */
  iban: string;
  creditor: QrBillParty;
  /** Créancier final (réservé en v2.0, généralement vide). */
  ultimateCreditor: QrBillParty | null;
  /** Montant ; `null` si le champ est laissé vide (à compléter par le débiteur). */
  amount: number | null;
  currency: QrBillCurrency;
  /** Débiteur final (peut être vide = facture « ouverte »). */
  ultimateDebtor: QrBillParty | null;
  reference: { type: ReferenceType; value: string | null };
  /** Message non structuré (communication libre). */
  unstructuredMessage: string | null;
  /** Information de facturation structurée Swico (`//S1/...`), optionnelle. */
  billingInfo: string | null;
}

/** Une vérification déterministe et son verdict. */
export interface QrBillValidation {
  check: string;
  ok: boolean;
  detail?: string | undefined;
}

/** Résultat complet du décodage déterministe d'un payload. */
export interface QrBillDecodeResult {
  /** L'en-tête `SPC` est présent (c'est bien un QR-bill, pas un QR générique). */
  isSwissQrBill: boolean;
  /** Données parsées si la structure minimale est valide, sinon `null`. */
  data: SwissQrBill | null;
  /** Rapport des vérifications déterministes (structure + checksums + cohérence). */
  validations: QrBillValidation[];
  /** `true` si parsé ET toutes les vérifications critiques passent. */
  valid: boolean;
}

// ─── Validators purs (réutilisables aussi par E4 anomalies) ─────────────────────

/** Normalise un IBAN : retire espaces et met en majuscules. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Valide le checksum IBAN (ISO 13616, mod-97 == 1). Ne valide PAS la longueur par pays
 * au-delà des bornes générales (15–34) — la longueur exacte CH/LI = 21 est vérifiée à part.
 */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Déplacer les 4 premiers caractères à la fin, puis convertir lettres → nombres (A=10…Z=35).
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" && ch <= "Z" ? ch.charCodeAt(0) - 55 : Number(ch);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

/**
 * Détecte un QR-IBAN : l'identifiant d'institution financière (IID, positions 5–9 de l'IBAN)
 * est dans la plage réservée QR 30000–31999. Un QR-IBAN impose une référence QRR.
 */
export function isQrIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^(CH|LI)[0-9]{2}[0-9]{5}/.test(iban)) return false;
  const iid = Number(iban.slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}

/**
 * Valide une référence QRR (27 chiffres, dernier = clé selon « Modulo 10 récursif » ESR/SIX).
 */
export function isValidQrReference(raw: string): boolean {
  const ref = raw.replace(/\s+/g, "");
  if (!/^[0-9]{27}$/.test(ref)) return false;
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (let i = 0; i < 26; i++) {
    // biome-ignore lint/style/noNonNullAssertion: i borné par la regex /^[0-9]{27}$/.
    carry = table[(carry + Number(ref[i]!)) % 10]!;
  }
  const checkDigit = (10 - carry) % 10;
  return checkDigit === Number(ref[26]);
}

/**
 * Valide une référence créancier SCOR (ISO 11649 : `RF` + 2 chiffres de contrôle + 1–21 alnum,
 * mod-97 == 1 après réarrangement).
 */
export function isValidCreditorReference(raw: string): boolean {
  const ref = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^RF[0-9]{2}[A-Z0-9]{1,21}$/.test(ref)) return false;
  const rearranged = ref.slice(4) + ref.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" && ch <= "Z" ? ch.charCodeAt(0) - 55 : Number(ch);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

// ─── Parser SPC ─────────────────────────────────────────────────────────────────

/** Indices des champs du payload SPC v2.0 (séparés par `\n`). */
const FIELD = {
  header: 0,
  version: 1,
  coding: 2,
  iban: 3,
  cdtrAdrTp: 4,
  cdtrName: 5,
  cdtrLine1: 6,
  cdtrLine2: 7,
  cdtrPostal: 8,
  cdtrTown: 9,
  cdtrCountry: 10,
  uCdtrAdrTp: 11,
  uCdtrName: 12,
  uCdtrLine1: 13,
  uCdtrLine2: 14,
  uCdtrPostal: 15,
  uCdtrTown: 16,
  uCdtrCountry: 17,
  amount: 18,
  currency: 19,
  uDtrAdrTp: 20,
  uDtrName: 21,
  uDtrLine1: 22,
  uDtrLine2: 23,
  uDtrPostal: 24,
  uDtrTown: 25,
  uDtrCountry: 26,
  refType: 27,
  reference: 28,
  unstructured: 29,
  trailer: 30,
  billingInfo: 31,
} as const;

/** Nombre minimal de champs jusqu'au trailer `EPD` inclus. */
const MIN_FIELDS = 31;

function blankToNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseParty(fields: string[], base: number): QrBillParty {
  const adrTp = blankToNull(fields[base]);
  return {
    addressType: adrTp === "S" || adrTp === "K" ? adrTp : null,
    name: blankToNull(fields[base + 1]),
    addressLine1: blankToNull(fields[base + 2]),
    addressLine2: blankToNull(fields[base + 3]),
    postalCode: blankToNull(fields[base + 4]),
    town: blankToNull(fields[base + 5]),
    country: blankToNull(fields[base + 6]),
  };
}

function isEmptyParty(p: QrBillParty): boolean {
  return (
    p.name === null &&
    p.addressLine1 === null &&
    p.addressLine2 === null &&
    p.postalCode === null &&
    p.town === null &&
    p.country === null
  );
}

/**
 * Parse + valide un payload SPC de façon déterministe (aucun LLM, aucune dépendance).
 *
 * Renvoie toujours un résultat (jamais d'exception) : `isSwissQrBill=false` si l'en-tête n'est
 * pas `SPC` ; `data=null` + `valid=false` si la structure minimale est absente ; sinon `data`
 * peuplé + le rapport `validations` (checksums IBAN / QRR / SCOR + cohérence QR-IBAN↔référence).
 */
export function parseSwissQrBill(payload: string): QrBillDecodeResult {
  const validations: QrBillValidation[] = [];
  const fields = payload.replace(/\r\n/g, "\n").split("\n");

  const header = (fields[FIELD.header] ?? "").trim();
  const isSwissQrBill = header === "SPC";
  if (!isSwissQrBill) {
    validations.push({
      check: "structure.header",
      ok: false,
      detail: `en-tête « ${header} » ≠ SPC`,
    });
    return { isSwissQrBill: false, data: null, validations, valid: false };
  }
  validations.push({ check: "structure.header", ok: true });

  const enoughFields = fields.length >= MIN_FIELDS;
  validations.push({
    check: "structure.fields",
    ok: enoughFields,
    detail: enoughFields ? undefined : `${fields.length} champs < ${MIN_FIELDS} attendus`,
  });

  const trailer = (fields[FIELD.trailer] ?? "").trim();
  const trailerOk = trailer === "EPD";
  validations.push({
    check: "structure.trailer",
    ok: trailerOk,
    detail: trailerOk ? undefined : `trailer « ${trailer} » ≠ EPD`,
  });

  if (!enoughFields || !trailerOk) {
    return { isSwissQrBill: true, data: null, validations, valid: false };
  }

  const version = (fields[FIELD.version] ?? "").trim();
  validations.push({
    check: "structure.version",
    ok: /^02[0-9]{2}$/.test(version),
    detail: /^02[0-9]{2}$/.test(version) ? undefined : `version « ${version} » non reconnue`,
  });

  const iban = normalizeIban(fields[FIELD.iban] ?? "");
  const refTypeRaw = (fields[FIELD.refType] ?? "").trim().toUpperCase();
  const refType: ReferenceType =
    refTypeRaw === "QRR" || refTypeRaw === "SCOR" || refTypeRaw === "NON" ? refTypeRaw : "NON";
  const reference = blankToNull(fields[FIELD.reference]);

  const amountRaw = blankToNull(fields[FIELD.amount]);
  const amount = amountRaw === null ? null : Number(amountRaw);
  const currencyRaw = (fields[FIELD.currency] ?? "").trim().toUpperCase();
  const currency: QrBillCurrency = currencyRaw === "EUR" ? "EUR" : "CHF";

  const ultimateCreditor = parseParty(fields, FIELD.uCdtrAdrTp);
  const ultimateDebtor = parseParty(fields, FIELD.uDtrAdrTp);

  const data: SwissQrBill = {
    version,
    iban,
    creditor: parseParty(fields, FIELD.cdtrAdrTp),
    ultimateCreditor: isEmptyParty(ultimateCreditor) ? null : ultimateCreditor,
    amount,
    currency,
    ultimateDebtor: isEmptyParty(ultimateDebtor) ? null : ultimateDebtor,
    reference: { type: refType, value: reference },
    unstructuredMessage: blankToNull(fields[FIELD.unstructured]),
    billingInfo: blankToNull(fields[FIELD.billingInfo]),
  };

  // ─── Vérifications de paiement (critiques) ───
  const ibanFormatOk = /^(CH|LI)[0-9]{19}$/.test(iban);
  validations.push({
    check: "iban.format",
    ok: ibanFormatOk,
    detail: ibanFormatOk ? undefined : "IBAN suisse/liechtensteinois attendu (21 caractères)",
  });

  const ibanChecksumOk = isValidIban(iban);
  validations.push({
    check: "iban.checksum",
    ok: ibanChecksumOk,
    detail: ibanChecksumOk ? undefined : "checksum mod-97 invalide",
  });

  const qrIban = isQrIban(iban);

  // Cohérence QR-IBAN ↔ type de référence (ADR 0020).
  let coherenceOk: boolean;
  let coherenceDetail: string | undefined;
  if (qrIban) {
    coherenceOk = refType === "QRR";
    if (!coherenceOk) coherenceDetail = "QR-IBAN exige une référence QRR";
  } else {
    coherenceOk = refType === "SCOR" || refType === "NON";
    if (!coherenceOk) coherenceDetail = "IBAN standard incompatible avec une référence QRR";
  }
  validations.push({ check: "reference.coherence", ok: coherenceOk, detail: coherenceDetail });

  // Checksum de référence selon le type.
  if (refType === "QRR") {
    const ok = reference !== null && isValidQrReference(reference);
    validations.push({
      check: "reference.qrr",
      ok,
      detail: ok ? undefined : "référence QRR invalide (27 chiffres + mod-10 récursif)",
    });
  } else if (refType === "SCOR") {
    const ok = reference !== null && isValidCreditorReference(reference);
    validations.push({
      check: "reference.scor",
      ok,
      detail: ok ? undefined : "référence SCOR invalide (ISO 11649)",
    });
  } else {
    const ok = reference === null;
    validations.push({
      check: "reference.non",
      ok,
      detail: ok ? undefined : "type NON mais une référence est présente",
    });
  }

  // Montant : si présent, doit être un nombre fini > 0.
  const amountOk = amount === null || (Number.isFinite(amount) && amount > 0);
  validations.push({
    check: "amount",
    ok: amountOk,
    detail: amountOk ? undefined : `montant « ${amountRaw} » invalide`,
  });

  const valid = validations.every((v) => v.ok);
  return { isSwissQrBill: true, data, validations, valid };
}

// ─── Seam image (couche 1) — DIFFÉRÉ (ADR 0020) ─────────────────────────────────

/**
 * Source d'extraction du payload depuis un document (rendu image + lecture QR 2D).
 * Volontairement abstrait : l'implémentation réelle mutualisera l'infra OCR `vision`
 * (différée, Infomaniak — ADR 0010/0020). Câbler ce seam = même jalon que l'OCR vision.
 */
export interface QrDocumentSource {
  /** Identifiant logique du fichier (clé Storage / chemin). */
  storagePath: string;
  /** Octets du document si déjà en mémoire (sinon résolus par l'implémentation). */
  bytes?: Uint8Array;
}

/**
 * Seam : extrait le payload SPC brut depuis un document. NON CÂBLÉ en E2 (ADR 0020) :
 * l'implémentation par défaut renvoie `null` → le pipeline (E3) bascule sur le fallback IA.
 * Brancher un vrai décodeur image plus tard ne changera ni le parser ni les validators.
 */
export type QrPayloadExtractor = (source: QrDocumentSource) => Promise<string | null>;

/** Extracteur par défaut : aucun décodage image disponible (couche 1 différée → fallback IA). */
export const unavailableQrPayloadExtractor: QrPayloadExtractor = async () => null;

/**
 * Décode un QR-bill depuis un document via l'extracteur fourni (seam), puis parse/valide le
 * payload. Sans extracteur câblé, renvoie `isSwissQrBill=false` (→ fallback IA E3).
 */
export async function decodeQrFromDocument(
  source: QrDocumentSource,
  extract: QrPayloadExtractor = unavailableQrPayloadExtractor,
): Promise<QrBillDecodeResult> {
  const payload = await extract(source);
  if (payload === null) {
    return {
      isSwissQrBill: false,
      data: null,
      validations: [
        {
          check: "image.payload",
          ok: false,
          detail: "aucun payload QR extrait (couche image différée)",
        },
      ],
      valid: false,
    };
  }
  return parseSwissQrBill(payload);
}
