/**
 * F2 — Helpers purs de la coquille espace client (routage rôle + branding).
 * Réf : dashboard-client.md §4 ; KICKOFF Bloc F / F2.
 */
import { describe, expect, it } from "vitest";
import {
  BRANDING_DEFAUT,
  espaceCible,
  NAV_CLIENT,
  resolveBranding,
} from "../../apps/web/lib/client-space";

describe("espaceCible (routage par rôle)", () => {
  it("client_contact → espace client", () => {
    expect(espaceCible("client_contact")).toBe("client");
  });
  it("rôles cabinet ou inconnu → fiduciaire", () => {
    for (const r of ["responsable", "collaborateur", "lecteur", undefined]) {
      expect(espaceCible(r)).toBe("fiduciaire");
    }
  });
});

describe("resolveBranding (défauts ZARYA si non configuré)", () => {
  it("utilise les couleurs du cabinet quand présentes", () => {
    expect(
      resolveBranding({
        logo_url: "https://x/logo.png",
        couleur_primaire: "#ff0000",
        couleur_secondaire: "#00ff00",
      }),
    ).toEqual({
      logoUrl: "https://x/logo.png",
      couleurPrimaire: "#ff0000",
      couleurSecondaire: "#00ff00",
    });
  });

  it("retombe sur les défauts ZARYA si null / vide / absent", () => {
    expect(resolveBranding(null)).toEqual({
      logoUrl: null,
      couleurPrimaire: BRANDING_DEFAUT.couleurPrimaire,
      couleurSecondaire: BRANDING_DEFAUT.couleurSecondaire,
    });
    expect(
      resolveBranding({ logo_url: "  ", couleur_primaire: "", couleur_secondaire: null }),
    ).toEqual({
      logoUrl: null,
      couleurPrimaire: BRANDING_DEFAUT.couleurPrimaire,
      couleurSecondaire: BRANDING_DEFAUT.couleurSecondaire,
    });
  });
});

describe("NAV_CLIENT", () => {
  it("expose les 7 onglets du mini-dashboard, tous sous /espace", () => {
    expect(NAV_CLIENT).toHaveLength(7);
    expect(NAV_CLIENT.every((n) => n.href.startsWith("/espace"))).toBe(true);
    expect(NAV_CLIENT[0]?.href).toBe("/espace");
  });
});
