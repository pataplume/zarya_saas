/**
 * Test d'auth de la route cron maj-echeances (C4). Garde CRON_SECRET (401, pas d'appel DB).
 * Réf : apps/web/.../calendar/maj-echeances/route.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../../apps/web/app/api/calendar/maj-echeances/route";

const ENDPOINT = "https://app.zarya.test/api/calendar/maj-echeances";

function request(headers: Record<string, string> = {}) {
  // biome-ignore lint/suspicious/noExplicitAny: la route ne lit que les headers.
  return new Request(ENDPOINT, { headers }) as any;
}

describe("maj-echeances route — garde CRON_SECRET (C4)", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("401 sans CRON_SECRET configuré", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request({ authorization: "Bearer x" }))).status).toBe(401);
  });

  it("401 si bearer incorrect", async () => {
    process.env.CRON_SECRET = "topsecret";
    expect((await GET(request({ authorization: "Bearer faux" }))).status).toBe(401);
  });
});
