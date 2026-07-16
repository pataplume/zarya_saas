import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { childLogger, logger, REDACT_CENSOR, REDACT_PATHS } from "./index";

// Construit un logger pino avec la config redact RÉELLE (REDACT_PATHS/REDACT_CENSOR) mais
// écrivant dans un buffer mémoire, pour inspecter la sortie JSON ligne par ligne.
function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const sink = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk));
    },
  };
  const log = pino({ base: null, redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, sink);
  return { log, lines };
}

describe("@zarya/logger — redact (ADR 0017, CLAUDE.md §2)", () => {
  it("censure les clés sensibles à la racine", () => {
    const { log, lines } = captureLogger();
    log.info({
      cabinet_id: "cab-123",
      access_token: "AT-DOIT-FUIR-PAS",
      refresh_token: "RT-DOIT-FUIR-PAS",
      client_secret: "CS-DOIT-FUIR-PAS",
      authorization: "Bearer XYZ",
      password: "hunter2",
    });
    const [entry] = lines;
    expect(entry?.cabinet_id).toBe("cab-123");
    expect(entry?.access_token).toBe(REDACT_CENSOR);
    expect(entry?.refresh_token).toBe(REDACT_CENSOR);
    expect(entry?.client_secret).toBe(REDACT_CENSOR);
    expect(entry?.authorization).toBe(REDACT_CENSOR);
    expect(entry?.password).toBe(REDACT_CENSOR);
  });

  it("censure les clés sensibles imbriquées d'un niveau et les en-têtes HTTP", () => {
    const { log, lines } = captureLogger();
    log.info({
      tokens: { access_token: "AT", refresh_token: "RT" },
      req: { headers: { authorization: "Bearer ZZZ", cookie: "sid=abc" } },
    });
    const [entry] = lines;
    const tokens = entry?.tokens as Record<string, unknown>;
    expect(tokens.access_token).toBe(REDACT_CENSOR);
    expect(tokens.refresh_token).toBe(REDACT_CENSOR);
    const headers = (entry?.req as Record<string, unknown>).headers as Record<string, unknown>;
    expect(headers.authorization).toBe(REDACT_CENSOR);
    expect(headers.cookie).toBe(REDACT_CENSOR);
  });

  it("censure les clés PII financière/sociale (iban, numero_avs, avs)", () => {
    const { log, lines } = captureLogger();
    log.info({
      iban: "CH93 0076 2011 6238 5295 7",
      numero_avs: "756.1234.5678.97",
      employe: { avs: "756.9999.8888.77", iban: "CH56 0483 5012 3456 7800 9" },
    });
    const [entry] = lines;
    expect(entry?.iban).toBe(REDACT_CENSOR);
    expect(entry?.numero_avs).toBe(REDACT_CENSOR);
    const employe = entry?.employe as Record<string, unknown>;
    expect(employe.avs).toBe(REDACT_CENSOR);
    expect(employe.iban).toBe(REDACT_CENSOR);
  });

  it("ne touche pas aux champs non sensibles", () => {
    const { log, lines } = captureLogger();
    log.info({ cabinet_id: "cab-1", statut: "actif", vault_secret_id: "uuid-non-sensible" });
    const [entry] = lines;
    // vault_secret_id n'est qu'une indirection (UUID), pas un secret → non censuré.
    expect(entry?.cabinet_id).toBe("cab-1");
    expect(entry?.statut).toBe("actif");
    expect(entry?.vault_secret_id).toBe("uuid-non-sensible");
  });

  it("expose une instance logger et un childLogger fonctionnels", () => {
    expect(typeof logger.info).toBe("function");
    const child = childLogger({ cabinet_id: "cab-9" });
    expect(typeof child.info).toBe("function");
  });
});
