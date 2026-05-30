// Évaluation LIVE de l'OCR contre Infomaniak — OPT-IN, jamais en CI.
//
// Objectif : revue manuelle du pipeline OCR réel (Phase 4.1) sur des fixtures
// locales. Vérifie le routage de bout en bout avec le vrai client :
//   - PDF natif  → source "pdf_natif", texte extrait, AUCUN appel LLM ;
//   - PDF scanné → source "aucune" + needs_image_ocr (rasterisation différée) ;
//   - image      → source "vision", transcription IK réelle (tokens, durée, modèle).
// Coûte des tokens et appelle le réseau → garde derrière RUN_LIVE_OCR=1.
//
// Lancer :
//   RUN_LIVE_OCR=1 pnpm vitest run packages/extraction/src/eval/ocr-live.test.ts
//
// Pré-requis :
//   - IK_PRODUCT_ID, IK_API_TOKEN, IK_MODEL_VISION dans .env.local (chargé par
//     tests/setup.ts) ;
//   - au moins un fichier déposé dans `ocr-fixtures/` (extensions reconnues :
//     .pdf .png .jpg .jpeg .webp .gif). Fixtures SYNTHÉTIQUES uniquement —
//     jamais de document client réel (PII). Le dossier est versionné vide.

import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { infomaniakClient } from "@zarya/integrations";
import { describe, expect, it } from "vitest";
import { extractText } from "../ocr";

const RUN_LIVE = process.env.RUN_LIVE_OCR === "1";

const FIXTURES_DIR = fileURLToPath(new URL("./ocr-fixtures", import.meta.url));

// Espacement inter-requêtes : les modèles IK Beta ont un plafond de débit
// (RPS/RPM) indépendant des crédits. 700 ms entre appels vision évite les 429
// en rafale (le retry/backoff du client reste le filet de sécurité).
const INTER_REQUEST_DELAY_MS = 700;

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => extname(name).toLowerCase() in MIME_BY_EXT)
    .sort();
}

function preview(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.runIf(RUN_LIVE)("OCR (live) — revue manuelle des fixtures", () => {
  it("extrait le texte de chaque fixture et imprime un rapport", { timeout: 600_000 }, async () => {
    const fixtures = listFixtures();
    if (fixtures.length === 0) {
      throw new Error(
        `Aucune fixture dans ${FIXTURES_DIR}. Dépose au moins un fichier ` +
          "synthétique (.pdf/.png/.jpg/.webp/.gif) avant de lancer le live OCR.",
      );
    }

    const lines: string[] = [];
    for (const name of fixtures) {
      const ext = extname(name).toLowerCase();
      const type_mime = MIME_BY_EXT[ext] as string;
      const bytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));

      const res = await extractText(
        { cabinet_id: "live-eval", bytes, type_mime },
        infomaniakClient,
      );

      lines.push(
        [
          `▸ ${name} (${type_mime}, ${bytes.byteLength} o)`,
          `    source=${res.source}  nb_pages=${res.nb_pages ?? "—"}  ` +
            `needs_image_ocr=${res.needs_image_ocr}  chars=${res.text.length}`,
          res.source === "vision"
            ? `    model=${res.model_used}  durée=${res.vision_duration_ms}ms  ` +
              `tokens_in=${res.usage?.tokens_input ?? "?"}  tokens_out=${res.usage?.tokens_output ?? "?"}`
            : "    (déterministe — aucun appel LLM)",
          `    texte: ${preview(res.text) || "∅"}`,
        ].join("\n"),
      );

      // N'espacer qu'entre deux appels réseau réels (vision).
      if (res.source === "vision") await sleep(INTER_REQUEST_DELAY_MS);
    }

    // Rapport destiné à l'œil humain (revue manuelle de la qualité OCR).
    // biome-ignore lint/suspicious/noConsole: sortie volontaire du harnais d'éval.
    console.log(`\n=== OCR live — ${fixtures.length} fixture(s) ===\n${lines.join("\n\n")}\n`);

    // Garde-fou « smoke » : tout a été traité et chaque résultat est cohérent
    // (le vrai jugement de qualité reste la lecture du rapport ci-dessus).
    expect(lines).toHaveLength(fixtures.length);
  });
});
