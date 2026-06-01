import { describe, expect, it, vi } from "vitest";
import type { ExpiringSubscription } from "./email-store";
import { MicrosoftGraphError } from "./errors";
import { renewExpiringSubscriptions } from "./subscription-renewal";

function sub(id: string): ExpiringSubscription {
  return { id, cabinet_id: `cab-${id}`, subscription_id: `graph-${id}` };
}

describe("renewExpiringSubscriptions (D4c)", () => {
  it("renouvelle toutes les subscriptions expirantes et persiste la nouvelle expiration", async () => {
    const renewed: { id: string; expiration: Date }[] = [];
    const renewSubscription = vi.fn(async (_id: string, exp: string) => ({
      id: _id,
      expirationDateTime: exp,
    }));
    const res = await renewExpiringSubscriptions({
      list: async () => [sub("a"), sub("b")],
      makeClient: () => ({ renewSubscription }),
      persistRenewed: async (id, expiration) => {
        renewed.push({ id, expiration });
      },
      persistError: async () => {},
      now: () => 1_700_000_000_000,
    });
    expect(res).toEqual({ total: 2, renewed: 2, failed: 0 });
    expect(renewed.map((r) => r.id)).toEqual(["a", "b"]);
    // Nouvelle expiration = now + 70 h.
    expect(renewSubscription).toHaveBeenCalledWith(
      "graph-a",
      new Date(1_700_000_000_000 + 70 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("un échec générique → compté failed, marqué 'erreur', n'interrompt pas le lot", async () => {
    const errors: { id: string; statut: string }[] = [];
    let call = 0;
    const res = await renewExpiringSubscriptions({
      list: async () => [sub("a"), sub("b")],
      makeClient: () => ({
        renewSubscription: async (id: string, exp: string) => {
          call++;
          if (call === 1) throw new Error("réseau");
          return { id, expirationDateTime: exp };
        },
      }),
      persistRenewed: async () => {},
      persistError: async (id, _err, statut) => {
        errors.push({ id, statut });
      },
      now: () => 1_700_000_000_000,
    });
    expect(res).toEqual({ total: 2, renewed: 1, failed: 1 });
    expect(errors).toEqual([{ id: "a", statut: "erreur" }]);
  });

  it("erreur 'revoked' → marquée 'revoquee'", async () => {
    const errors: { id: string; statut: string }[] = [];
    const res = await renewExpiringSubscriptions({
      list: async () => [sub("a")],
      makeClient: () => ({
        renewSubscription: async () => {
          throw new MicrosoftGraphError("revoked", "token mort");
        },
      }),
      persistRenewed: async () => {},
      persistError: async (id, _err, statut) => {
        errors.push({ id, statut });
      },
      now: () => 1_700_000_000_000,
    });
    expect(res.failed).toBe(1);
    expect(errors[0]?.statut).toBe("revoquee");
  });

  it("aucune subscription expirante → lot vide", async () => {
    const res = await renewExpiringSubscriptions({
      list: async () => [],
      makeClient: () => ({ renewSubscription: async () => ({ id: "x", expirationDateTime: "" }) }),
      persistRenewed: async () => {},
      persistError: async () => {},
    });
    expect(res).toEqual({ total: 0, renewed: 0, failed: 0 });
  });
});
