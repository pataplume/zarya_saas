/**
 * Test d'auth de la route cron de génération des relances (C2a). Garde CRON_SECRET
 * (chemins 401 — pas d'appel DB). Réf : apps/web/.../calendar/generer-relances/route.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../../apps/web/app/api/calendar/generer-relances/route";

const ENDPOINT = "https://app.zarya.test/api/calendar/generer-relances";

function request(headers: Record<string, string> = {}) {
  // biome-ignore lint/suspicious/noExplicitAny: la route ne lit que les headers.
  return new Request(ENDPOINT, { headers }) as any;
}

describe("generer-relances route — garde CRON_SECRET (C2a)", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("401 si CRON_SECRET non configuré", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request({ authorization: "Bearer x" }));
    expect(res.status).toBe(401);
  });

  it("401 si le bearer ne correspond pas", async () => {
    process.env.CRON_SECRET = "topsecret";
    const res = await GET(request({ authorization: "Bearer mauvais" }));
    expect(res.status).toBe(401);
  });
});
