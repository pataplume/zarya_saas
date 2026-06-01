import { describe, expect, it, vi } from "vitest";
import {
  createEmailSubscription,
  type GraphNotification,
  ingestEmailNotification,
  parseGraphNotifications,
} from "./email-ingestion";
import type { SubscriptionLookup, UpsertEmailBrutInput } from "./email-store";
import type { EmailDetail } from "./graph-types";

function emailDetail(over: Partial<EmailDetail> = {}): EmailDetail {
  return {
    id: "m1",
    subject: "Facture",
    from: "client@pme.ch",
    receivedDateTime: "2026-03-01T10:00:00Z",
    hasAttachments: true,
    bodyPreview: "Bonjour",
    bodyContentType: "text",
    body: "corps",
    toRecipients: [],
    ...over,
  };
}

describe("parseGraphNotifications", () => {
  it("extrait value[] ; tolère les corps invalides", () => {
    expect(parseGraphNotifications({ value: [{ subscriptionId: "s1" }] })).toHaveLength(1);
    expect(parseGraphNotifications({})).toEqual([]);
    expect(parseGraphNotifications(null)).toEqual([]);
    expect(parseGraphNotifications("nope")).toEqual([]);
  });
});

describe("createEmailSubscription (D4b)", () => {
  it("crée la subscription Inbox avec le secret et la persiste", async () => {
    const createSubscription = vi.fn(async () => ({
      id: "graph-sub-1",
      expirationDateTime: "2026-06-04T10:00:00Z",
    }));
    const saved: unknown[] = [];
    const result = await createEmailSubscription("cab-A", {
      client: { createSubscription },
      persist: async (row) => {
        saved.push(row);
      },
      generateSecret: () => "SECRET-XYZ",
      notificationUrl: "https://app.zarya.test/api/integrations/microsoft/webhook",
      now: () => 1_700_000_000_000,
    });

    expect(result).toEqual({ subscriptionId: "graph-sub-1", expirationAt: "2026-06-04T10:00:00Z" });
    expect(createSubscription).toHaveBeenCalledWith({
      changeType: "created",
      notificationUrl: "https://app.zarya.test/api/integrations/microsoft/webhook",
      resource: "/me/mailFolders('Inbox')/messages",
      expirationDateTime: new Date(1_700_000_000_000 + 70 * 60 * 60 * 1000).toISOString(),
      clientState: "SECRET-XYZ",
    });
    expect(saved[0]).toMatchObject({
      cabinet_id: "cab-A",
      subscription_id: "graph-sub-1",
      client_state_secret: "SECRET-XYZ",
      resource: "/me/mailFolders('Inbox')/messages",
    });
  });
});

describe("ingestEmailNotification (D4b)", () => {
  const sub: SubscriptionLookup = {
    id: "sub-uuid",
    cabinet_id: "cab-A",
    client_state_secret: "SECRET",
  };

  function baseOpts(over: {
    find?: SubscriptionLookup | null;
    getEmail?: () => Promise<EmailDetail>;
    persistReturn?: boolean;
  }) {
    const persisted: UpsertEmailBrutInput[] = [];
    const getEmail = over.getEmail ?? (async () => emailDetail());
    return {
      persisted,
      opts: {
        findSubscription: async () => (over.find === undefined ? sub : over.find),
        makeClient: () => ({ getEmail }),
        persist: async (input: UpsertEmailBrutInput) => {
          persisted.push(input);
          return over.persistReturn ?? true;
        },
      },
    };
  }

  const goodNotif: GraphNotification = {
    subscriptionId: "graph-sub-1",
    clientState: "SECRET",
    resourceData: { id: "msg-123" },
  };

  it("notif sans subscriptionId ou messageId → invalid", async () => {
    const { opts } = baseOpts({});
    expect(await ingestEmailNotification({ clientState: "x" }, opts)).toBe("invalid");
    expect(await ingestEmailNotification({ subscriptionId: "s", clientState: "x" }, opts)).toBe(
      "invalid",
    );
  });

  it("subscription inconnue → unknown_subscription", async () => {
    const { opts } = baseOpts({ find: null });
    expect(await ingestEmailNotification(goodNotif, opts)).toBe("unknown_subscription");
  });

  it("clientState ne matche pas le secret → unauthorized (pas de fetch ni d'écriture)", async () => {
    const getEmail = vi.fn(async () => emailDetail());
    const { opts, persisted } = baseOpts({ getEmail });
    const res = await ingestEmailNotification({ ...goodNotif, clientState: "MAUVAIS" }, opts);
    expect(res).toBe("unauthorized");
    expect(getEmail).not.toHaveBeenCalled();
    expect(persisted).toHaveLength(0);
  });

  it("secret valide + message nouveau → ingested, email_brut mappé", async () => {
    const { opts, persisted } = baseOpts({ persistReturn: true });
    const res = await ingestEmailNotification(goodNotif, opts);
    expect(res).toBe("ingested");
    expect(persisted[0]).toMatchObject({
      cabinet_id: "cab-A",
      message_id: "msg-123",
      subject: "Facture",
      from_address: "client@pme.ch",
      has_attachments: true,
      body_preview: "Bonjour",
    });
  });

  it("message déjà ingéré (upsert no-op) → duplicate", async () => {
    const { opts } = baseOpts({ persistReturn: false });
    expect(await ingestEmailNotification(goodNotif, opts)).toBe("duplicate");
  });
});
