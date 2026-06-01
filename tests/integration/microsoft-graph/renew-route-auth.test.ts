/**
 * Test d'auth de la route cron de renouvellement (D4c). Vérifie le garde CRON_SECRET
 * (chemins 401 uniquement — pas d'appel DB). Réf : apps/web/.../renew/route.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../../apps/web/app/api/integrations/microsoft/renew/route";

const ENDPOINT = "https://app.zarya.test/api/integrations/microsoft/renew";

function request(headers: Record<string, string> = {}) {
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest non requis (la route ne lit que headers).
  return new Request(ENDPOINT, { headers }) as any;
}

describe("renew route — garde CRON_SECRET (D4c)", () => {
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

  it("401 sans en-tête Authorization", async () => {
    process.env.CRON_SECRET = "topsecret";
    const res = await GET(request());
    expect(res.status).toBe(401);
  });
});
