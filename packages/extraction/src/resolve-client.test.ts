// Tests unitaires du cœur PUR de rattachement client (B2, ADR 0014).
// Aucune DB : on teste extractIde + scoreClients (ranking, paliers, top-3, multi-signal).

import { describe, expect, test } from "vitest";
import {
  type ClientRow,
  type ContactRow,
  extractIde,
  SEUIL_RATTACHEMENT_AUTO,
  SEUIL_RATTACHEMENT_PROPOSER,
  scoreClients,
} from "./resolve-client";

function client(over: Partial<ClientRow> & { id: string }): ClientRow {
  return {
    raison_sociale: "Société Anonyme",
    nom_court: null,
    ide: null,
    email_contact: null,
    ...over,
  };
}

describe("extractIde", () => {
  test("formats variés → forme canonique CHE-XXX.XXX.XXX", () => {
    expect(extractIde("IDE CHE-123.456.789 TVA")).toBe("CHE-123.456.789");
    expect(extractIde("che 123 456 789")).toBe("CHE-123.456.789");
    expect(extractIde("CHE123456789")).toBe("CHE-123.456.789");
  });

  test("absence d'IDE → null", () => {
    expect(extractIde("aucun numéro ici")).toBeNull();
    expect(extractIde(null)).toBeNull();
    expect(extractIde("CHE-12.456.789")).toBeNull(); // format invalide
  });
});

describe("scoreClients — signaux & paliers", () => {
  const noContacts: ContactRow[] = [];

  test("IDE exact → palier auto, client proposé", () => {
    const res = scoreClients(
      { ide: "CHE-123.456.789", expediteur_email: null, texte: "relevé" },
      [client({ id: "c1", ide: "CHE-123.456.789" }), client({ id: "c2", ide: "CHE-999.999.999" })],
      noContacts,
    );
    expect(res.client_id_propose).toBe("c1");
    expect(res.palier).toBe("auto");
    expect(res.confiance).toBeGreaterThanOrEqual(SEUIL_RATTACHEMENT_AUTO);
    expect(res.candidats[0]).toMatchObject({ client_id: "c1", raison: "ide_exact" });
  });

  test("email expéditeur ↔ contact → palier auto", () => {
    const res = scoreClients(
      { ide: null, expediteur_email: "Compta@Acme.ch", texte: "facture" },
      [client({ id: "c1" })],
      [{ client_id: "c1", email: "compta@acme.ch" }],
    );
    expect(res.client_id_propose).toBe("c1");
    expect(res.palier).toBe("auto");
    expect(res.candidats[0]?.raison).toBe("email_contact_exact");
  });

  test("email expéditeur ↔ client.email_contact → palier auto", () => {
    const res = scoreClients(
      { ide: null, expediteur_email: "info@acme.ch", texte: "" },
      [client({ id: "c1", email_contact: "info@acme.ch" })],
      [],
    );
    expect(res.client_id_propose).toBe("c1");
    expect(res.candidats[0]?.raison).toBe("email_client_exact");
  });

  test("raison sociale présente dans le texte → palier proposer", () => {
    const res = scoreClients(
      { ide: null, expediteur_email: null, texte: "Relevé bancaire Boulangerie Dupont avril 2026" },
      [client({ id: "c1", raison_sociale: "Boulangerie Dupont" })],
      [],
    );
    expect(res.client_id_propose).toBe("c1");
    expect(res.palier).toBe("proposer");
    expect(res.confiance).toBeGreaterThanOrEqual(SEUIL_RATTACHEMENT_PROPOSER);
    expect(res.confiance).toBeLessThan(SEUIL_RATTACHEMENT_AUTO);
  });

  test("aucun signal → manuel, pas de rattachement, candidats vides", () => {
    const res = scoreClients(
      { ide: null, expediteur_email: null, texte: "document sans indice" },
      [client({ id: "c1", raison_sociale: "Zephyr Industries" })],
      [],
    );
    expect(res.client_id_propose).toBeNull();
    expect(res.palier).toBe("manuel");
    expect(res.confiance).toBeNull();
    expect(res.candidats).toHaveLength(0);
  });
});

describe("scoreClients — top-3 & homonymes", () => {
  test("ne renvoie que les 3 meilleurs candidats, triés décroissant", () => {
    const texte = "Alpha Beta Gamma Delta réunis";
    const res = scoreClients(
      { ide: null, expediteur_email: null, texte },
      [
        client({ id: "a", raison_sociale: "Alpha" }),
        client({ id: "b", raison_sociale: "Beta" }),
        client({ id: "g", raison_sociale: "Gamma" }),
        client({ id: "d", raison_sociale: "Delta" }),
      ],
      [],
    );
    expect(res.candidats).toHaveLength(3);
    const scores = res.candidats.map((c) => c.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  test("homonymes : deux clients de même raison sociale → deux candidats", () => {
    const res = scoreClients(
      { ide: null, expediteur_email: null, texte: "Facture Constructions Martin SA" },
      [
        client({ id: "m1", raison_sociale: "Constructions Martin" }),
        client({ id: "m2", raison_sociale: "Constructions Martin" }),
      ],
      [],
    );
    const ids = res.candidats.map((c) => c.client_id).sort();
    expect(ids).toEqual(["m1", "m2"]);
  });

  test("multi-signal concordant : bonus, raison = signal le plus fort", () => {
    const res = scoreClients(
      {
        ide: "CHE-123.456.789",
        expediteur_email: null,
        texte: "Boulangerie Dupont CHE-123.456.789",
      },
      [client({ id: "c1", raison_sociale: "Boulangerie Dupont", ide: "CHE-123.456.789" })],
      [],
    );
    expect(res.candidats[0]?.raison).toBe("ide_exact");
    expect(res.confiance).toBeGreaterThan(0.98); // boost multi-signal
    expect(res.confiance).toBeLessThanOrEqual(0.99); // capé
  });
});
