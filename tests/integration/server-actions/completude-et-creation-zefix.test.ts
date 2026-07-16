/**
 * Lot 3 (ADR 0025) — Assistant de complétude + création client avec préremplissage Zefix.
 *
 * Couvre :
 *  - getCompletudeClient (lecteur DB → cœur pur) contre la base : bloquants de génération
 *    d'échéances (régime TVA), recommandations, anti-fuite cross-cabinet ;
 *  - createClientDepuisZefixAction : création crm.client + crm.adresse (siège) en une fois
 *    (corrige le bug ONB « Zefix ne remplit pas l'adresse »), audit crm.evenement, RBAC,
 *    parcours non bloquant (création possible sans adresse).
 *
 * `@zarya/auth` mocké ; db service role réel (triggers crm + Zod réels).
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedAdresse,
  seedClient,
  seedContact,
  seedParamComptable,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { createClientDepuisZefixAction } = await import(
  "../../../apps/web/app/(app)/app/clients/actions"
);
const { getCompletudeClient } = await import("../../../apps/web/lib/completude-client-data");

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;

beforeAll(async () => {
  const s = await seedTwoCabinets(sql);
  cabinetA = s.cabinetA;
  cabinetB = s.cabinetB;
});

afterEach(() => {
  authState.user = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function acteur(cabinet_id: string, role = "collaborateur") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

// ─── getCompletudeClient (lecteur DB) ───────────────────────────────────────────

describe("getCompletudeClient", () => {
  test("client tout neuf : pas de bloquant, recommandations présentes", async () => {
    const cli = await seedClient(sql, cabinetA.id);
    const r = await getCompletudeClient(cabinetA.id, cli.id);
    expect(r).not.toBeNull();
    expect(r?.a_bloquants).toBe(false);
    expect(r?.manquants.map((m) => m.cle)).toEqual(
      expect.arrayContaining(["contacts.au_moins_un", "adresses.au_moins_une"]),
    );
  });

  test("service TVA sans régime : recommandé (défaut effectif P0-5) ; avec régime → résolu", async () => {
    const cli = await seedClient(sql, cabinetA.id);
    // Service TVA SANS regime_tva dans parametres mais périodicité trimestrielle : le moteur
    // suppose la méthode effective par défaut (P0-5, regime-tva.ts) → signalé en RECOMMANDÉ,
    // plus en bloquant (les échéances TVA sont bien générées).
    await sql`
      INSERT INTO crm.service (id, cabinet_id, client_id, type, frequence)
      VALUES (${randomUUID()}, ${cabinetA.id}, ${cli.id}, 'tva', 'trimestrielle')
    `;
    let r = await getCompletudeClient(cabinetA.id, cli.id);
    expect(r?.a_bloquants).toBe(false);
    const item = r?.manquants.find((m) => m.cle === "service.tva.regime");
    expect(item?.severite).toBe("recommande");

    // On pose le régime → l'item disparaît.
    await sql`
      UPDATE crm.service SET parametres = ${sql.json({ regime_tva: "effective_trimestre" })}
      WHERE client_id = ${cli.id} AND type = 'tva'
    `;
    r = await getCompletudeClient(cabinetA.id, cli.id);
    expect(r?.manquants.map((m) => m.cle)).not.toContain("service.tva.regime");
  });

  test("score monte quand identité + contact + adresse(canton) sont renseignés", async () => {
    const cli = await seedClient(sql, cabinetA.id);
    const avant = await getCompletudeClient(cabinetA.id, cli.id);

    await sql`
      UPDATE crm.client SET type = 'pme', ide = 'CHE-123.456.789' WHERE id = ${cli.id}
    `;
    await seedContact(sql, cabinetA.id, cli.id); // crée un contact (sans principal)
    await sql`UPDATE crm.contact SET est_principal = true WHERE client_id = ${cli.id}`;
    await seedAdresse(sql, cabinetA.id, cli.id); // adresse avec canton 'VD'

    const apres = await getCompletudeClient(cabinetA.id, cli.id);
    expect(apres?.score ?? 0).toBeGreaterThan(avant?.score ?? 0);
  });

  test("anti-fuite : un client de B n'est pas lu via le scope de A (null)", async () => {
    const cliB = await seedClient(sql, cabinetB.id);
    const r = await getCompletudeClient(cabinetA.id, cliB.id);
    expect(r).toBeNull();
  });

  test("bouclement sans date_bouclement → bloquant ; avec date → résolu", async () => {
    const cli = await seedClient(sql, cabinetA.id);
    await sql`
      INSERT INTO crm.service (id, cabinet_id, client_id, type, frequence)
      VALUES (${randomUUID()}, ${cabinetA.id}, ${cli.id}, 'bouclement', 'annuelle')
    `;
    let r = await getCompletudeClient(cabinetA.id, cli.id);
    expect(r?.manquants.map((m) => m.cle)).toContain("service.bouclement.date");

    await seedParamComptable(sql, cabinetA.id, cli.id);
    await sql`UPDATE crm.param_comptable SET date_bouclement = '2025-12-31' WHERE client_id = ${cli.id}`;
    r = await getCompletudeClient(cabinetA.id, cli.id);
    expect(r?.manquants.map((m) => m.cle)).not.toContain("service.bouclement.date");
  });
});

// ─── createClientDepuisZefixAction ──────────────────────────────────────────────

describe("createClientDepuisZefixAction", () => {
  test("nominal : crée le client ET l'adresse du siège + audit", async () => {
    acteur(cabinetA.id);
    const res = await createClientDepuisZefixAction(
      {},
      fd({
        raison_sociale: "Zefix Prefill SA",
        ide: "CHE-987.654.321",
        type: "pme",
        forme_juridique: "SA",
        adresse_rue: "Avenue de la Gare 1",
        adresse_code_postal: "1003",
        adresse_ville: "Lausanne",
        adresse_canton: "VD",
        adresse_pays: "CH",
      }),
    );
    expect(res.success).toBe(true);
    expect(res.client_id).toBeTruthy();

    const [cli] = await sql`
      SELECT raison_sociale, ide, type, forme_juridique FROM crm.client WHERE id = ${res.client_id}`;
    expect(cli?.raison_sociale).toBe("Zefix Prefill SA");
    expect(cli?.ide).toBe("CHE-987.654.321");
    expect(cli?.type).toBe("pme");

    const [adr] = await sql`
      SELECT type, rue, ville, canton, est_principale
      FROM crm.adresse WHERE client_id = ${res.client_id}`;
    expect(adr?.type).toBe("siege");
    expect(adr?.ville).toBe("Lausanne");
    expect(adr?.canton).toBe("VD");
    expect(adr?.est_principale).toBe(true);

    const [evt] = await sql`
      SELECT ressource_type FROM crm.evenement
      WHERE client_id = ${res.client_id} AND ressource_type = 'crm.client'`;
    expect(evt?.ressource_type).toBe("crm.client");
  });

  test("non bloquant : création SANS adresse possible (aucune adresse créée)", async () => {
    acteur(cabinetA.id);
    const res = await createClientDepuisZefixAction(
      {},
      fd({ raison_sociale: "Sans Adresse Sàrl" }),
    );
    expect(res.success).toBe(true);

    const adresses = await sql`SELECT id FROM crm.adresse WHERE client_id = ${res.client_id}`;
    expect(adresses).toHaveLength(0);
  });

  test("RBAC : un lecteur ne peut pas créer", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await createClientDepuisZefixAction({}, fd({ raison_sociale: "Refusé SA" }));
    expect(res.error).toBeTruthy();
    expect(res.success).toBeUndefined();
  });

  test("raison sociale vide → erreur de validation", async () => {
    acteur(cabinetA.id);
    const res = await createClientDepuisZefixAction({}, fd({ raison_sociale: "  " }));
    expect(res.error).toBeTruthy();
  });
});
