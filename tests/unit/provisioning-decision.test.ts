/**
 * P0-8 — Self-heal provisioning (AUDIT-MVP.md §8). Fonction de décision PURE :
 * état user (claim JWT + lignes cabinet_membre) → action de réparation.
 * Aucune connexion DB, aucun I/O.
 */
import { describe, expect, it } from "vitest";
import {
  deciderReparationProvisioning,
  type MembreExistant,
} from "../../apps/web/lib/provisioning-decision";

const CABINET_ID = "11111111-1111-1111-1111-111111111111";
const AUTRE_CABINET_ID = "22222222-2222-2222-2222-222222222222";

function membre(overrides: Partial<MembreExistant> = {}): MembreExistant {
  return { cabinet_id: CABINET_ID, role: "responsable", actif: true, ...overrides };
}

describe("deciderReparationProvisioning", () => {
  it("claim présent → rien_a_faire (même si des membres existent)", () => {
    expect(
      deciderReparationProvisioning({
        cabinet_id_claim: CABINET_ID,
        email: "sophie@cabinet.ch",
        membres: [membre()],
      }),
    ).toEqual({ action: "rien_a_faire" });
  });

  it("provisioning partiel (membre actif, claim absent) → reparer_metadata avec cabinet_id + role du membre", () => {
    expect(
      deciderReparationProvisioning({
        cabinet_id_claim: null,
        email: "sophie@cabinet.ch",
        membres: [membre({ role: "collaborateur" })],
      }),
    ).toEqual({ action: "reparer_metadata", cabinet_id: CABINET_ID, role: "collaborateur" });
  });

  it("plusieurs membres → prend le premier membre ACTIF, pas l'inactif", () => {
    expect(
      deciderReparationProvisioning({
        cabinet_id_claim: null,
        email: "sophie@cabinet.ch",
        membres: [
          membre({ actif: false, role: "responsable" }),
          membre({ cabinet_id: AUTRE_CABINET_ID, actif: true, role: "lecteur" }),
        ],
      }),
    ).toEqual({ action: "reparer_metadata", cabinet_id: AUTRE_CABINET_ID, role: "lecteur" });
  });

  it("uniquement des membres inactifs → erreur membre_inactif (jamais ré-injecter un accès révoqué)", () => {
    expect(
      deciderReparationProvisioning({
        cabinet_id_claim: null,
        email: "sophie@cabinet.ch",
        membres: [membre({ actif: false })],
      }),
    ).toEqual({ action: "erreur", raison: "membre_inactif" });
  });

  it("aucune trace en DB + email présent → provisionner", () => {
    expect(
      deciderReparationProvisioning({
        cabinet_id_claim: null,
        email: "sophie@cabinet.ch",
        membres: [],
      }),
    ).toEqual({ action: "provisionner", email: "sophie@cabinet.ch" });
  });

  it("aucune trace en DB + email absent → erreur email_absent", () => {
    expect(
      deciderReparationProvisioning({
        cabinet_id_claim: null,
        email: null,
        membres: [],
      }),
    ).toEqual({ action: "erreur", raison: "email_absent" });
  });

  it("idempotence : rejouer la décision sur l'état réparé → rien_a_faire", () => {
    // 1er passage : réparation métadata
    const avant = deciderReparationProvisioning({
      cabinet_id_claim: null,
      email: "sophie@cabinet.ch",
      membres: [membre()],
    });
    expect(avant.action).toBe("reparer_metadata");

    // 2e passage : le claim est posé → plus rien à faire
    const apres = deciderReparationProvisioning({
      cabinet_id_claim: avant.action === "reparer_metadata" ? avant.cabinet_id : null,
      email: "sophie@cabinet.ch",
      membres: [membre()],
    });
    expect(apres).toEqual({ action: "rien_a_faire" });
  });
});
