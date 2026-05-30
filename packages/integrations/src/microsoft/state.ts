// Paramètre `state` OAuth signé (HMAC-SHA256) — anti-CSRF + liaison au cabinet.
// Le callback Microsoft est public (redirection depuis login.microsoftonline.com) : on
// ne peut donc PAS se fier à la seule session pour savoir quel cabinet se connecte. On
// encode le `cabinet_id` dans un `state` signé côté serveur, vérifié au retour. La clé
// MS_OAUTH_STATE_SECRET est un secret serveur (jamais exposé client).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MicrosoftGraphError } from "./errors";
import type { MicrosoftOAuthStatePayload } from "./types";

const STATE_TTL_MS = 10 * 60 * 1000; // un state OAuth est valable 10 min.

function getStateSecret(): string {
  const secret = typeof process !== "undefined" ? process.env.MS_OAUTH_STATE_SECRET : undefined;
  if (!secret || secret.length < 16) {
    throw new MicrosoftGraphError(
      "config_missing",
      "MS_OAUTH_STATE_SECRET manquant ou trop court (>= 16 caractères requis) côté serveur.",
    );
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Signe un `state` liant le flux OAuth au `cabinet_id`. */
export function signOAuthState(cabinet_id: string): string {
  const secret = getStateSecret();
  const payload: MicrosoftOAuthStatePayload = {
    cabinet_id,
    nonce: b64url(randomBytes(16)),
    iat: Date.now(),
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Vérifie un `state` reçu au callback : signature + fraîcheur. Lève si invalide. */
export function verifyOAuthState(state: string): MicrosoftOAuthStatePayload {
  const secret = getStateSecret();
  const parts = state.split(".");
  if (parts.length !== 2) {
    throw new MicrosoftGraphError("state_invalid", "Format de state OAuth invalide.");
  }
  const [payloadB64, sig] = parts as [string, string];

  const expected = sign(payloadB64, secret);
  const sigBuf = Buffer.from(sig, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new MicrosoftGraphError(
      "state_invalid",
      "Signature de state OAuth invalide (anti-CSRF).",
    );
  }

  let payload: MicrosoftOAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (err) {
    throw new MicrosoftGraphError("state_invalid", "Payload de state OAuth non parseable.", err);
  }

  if (typeof payload.iat !== "number" || Date.now() - payload.iat > STATE_TTL_MS) {
    throw new MicrosoftGraphError("state_invalid", "State OAuth expiré (> 10 min).");
  }
  if (!payload.cabinet_id) {
    throw new MicrosoftGraphError("state_invalid", "State OAuth sans cabinet_id.");
  }
  return payload;
}
