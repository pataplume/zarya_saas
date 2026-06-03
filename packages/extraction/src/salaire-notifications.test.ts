// G5a — templates de notifications de cycle (cœur pur).
import { describe, expect, it } from "vitest";
import { buildNotificationTemplate } from "./salaire-notifications";

const ctx = { raison_sociale: "Acme SA", mois: 5, annee: 2026, date_limite: "2026-05-25" };

describe("buildNotificationTemplate", () => {
  it("initiale : sujet à valider + date limite + nom client dans le corps", () => {
    const t = buildNotificationTemplate("initiale", ctx);
    expect(t.sujet).toBe("Vos salaires de mai 2026 sont à valider");
    expect(t.corps).toContain("2026-05-25");
    expect(t.corps).toContain("Acme SA");
  });

  it("confirmation / modification / clôture ont des sujets distincts et datés", () => {
    expect(buildNotificationTemplate("confirmation_validation", ctx).sujet).toMatch(
      /validation reçue/i,
    );
    expect(buildNotificationTemplate("modification_fiduciaire", ctx).sujet).toMatch(/fiduciaire/i);
    expect(buildNotificationTemplate("cloture", ctx).sujet).toMatch(/clôturés/i);
    for (const type of ["confirmation_validation", "modification_fiduciaire", "cloture"] as const) {
      expect(buildNotificationTemplate(type, ctx).sujet).toContain("mai 2026");
    }
  });
});
