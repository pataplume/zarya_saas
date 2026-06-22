/**
 * Lot 1 (ADR 0025) — Dossier client éditable : server actions identité / contacts / adresses.
 *
 * Teste les VRAIES server actions (apps/web) contre la base de test :
 *  - édition identité étendue (type, tags, langue, gestionnaire…) ;
 *  - CRUD contacts (avec exclusivité du contact principal) ;
 *  - CRUD adresses (avec exclusivité de l'adresse principale) ;
 *  - audit crm.evenement émis ; RBAC (lecteur = lecture seule) ; anti-fuite cross-cabinet.
 *
 * `@zarya/auth` mocké ; db service role réel (triggers crm + Zod réels).
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { updateClientAction } = await import("../../../apps/web/app/(app)/app/clients/actions");
const { createContactAction, updateContactAction, supprimerContactAction } = await import(
  "../../../apps/web/app/(app)/app/clients/contacts/actions"
);
const { createAdresseAction, updateAdresseAction, supprimerAdresseAction } = await import(
  "../../../apps/web/app/(app)/app/clients/adresses/actions"
);

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

// ─── Identité ─────────────────────────────────────────────────────────────────

describe("updateClientAction (identité étendue)", () => {
  test("nominal : met à jour les champs étendus + émet un événement", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    const res = await updateClientAction(
      {},
      fd({
        id: cli.id,
        raison_sociale: "Acme Révisée SA",
        type: "association",
        numero_tva: "CHE-123.456.789 TVA",
        forme_juridique: "Sàrl",
        langue: "de",
        responsable_id: cabinetA.membre_id,
        tags: "VIP, sensible, VIP",
        notes_commerciales: "Client clé.",
      }),
    );
    expect(res.success).toBe(true);

    const [row] = await sql`
      SELECT type, langue, forme_juridique, responsable_id, tags, notes_commerciales
      FROM crm.client WHERE id = ${cli.id}`;
    expect(row?.type).toBe("association");
    expect(row?.langue).toBe("de");
    expect(row?.forme_juridique).toBe("Sàrl");
    expect(row?.responsable_id).toBe(cabinetA.membre_id);
    expect(row?.tags).toEqual(["VIP", "sensible"]); // dédupliqué
    expect(row?.notes_commerciales).toBe("Client clé.");

    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM crm.evenement
      WHERE client_id = ${cli.id} AND ressource_type = 'crm.client'`;
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test("RBAC : un lecteur ne peut pas éditer", async () => {
    acteur(cabinetA.id, "lecteur");
    const cli = await seedClient(sql, cabinetA.id);
    const res = await updateClientAction({}, fd({ id: cli.id, langue: "it" }));
    expect(res.error).toMatch(/autoris/i);
  });

  test("anti-fuite : ne modifie pas un client d'un autre cabinet", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const res = await updateClientAction({}, fd({ id: cliB.id, langue: "it" }));
    expect(res.error).toMatch(/introuvable/i);

    const [row] = await sql`SELECT langue FROM crm.client WHERE id = ${cliB.id}`;
    expect(row?.langue).toBe("fr"); // inchangé (défaut)
  });

  test("gestionnaire d'un autre cabinet refusé", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    const res = await updateClientAction(
      {},
      fd({ id: cli.id, responsable_id: cabinetB.membre_id }),
    );
    expect(res.error).toMatch(/gestionnaire/i);
  });
});

// ─── Contacts ───────────────────────────────────────────────────────────────

describe("contacts CRUD", () => {
  test("create + exclusivité du contact principal", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    const r1 = await createContactAction(
      {},
      fd({ client_id: cli.id, nom: "Dupont", prenom: "Jean", est_principal: "on" }),
    );
    expect(r1.success).toBe(true);

    const r2 = await createContactAction(
      {},
      fd({ client_id: cli.id, nom: "Martin", est_principal: "on", est_contact_rh: "on" }),
    );
    expect(r2.success).toBe(true);

    const rows = await sql`
      SELECT nom, est_principal FROM crm.contact
      WHERE client_id = ${cli.id} AND archived_at IS NULL ORDER BY nom`;
    const principaux = rows.filter((r) => r.est_principal);
    expect(principaux).toHaveLength(1);
    expect(principaux[0]?.nom).toBe("Martin"); // le dernier prend la main
  });

  test("update modifie un contact", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    await createContactAction({}, fd({ client_id: cli.id, nom: "Brun" }));
    const [c] = await sql`SELECT id FROM crm.contact WHERE client_id = ${cli.id} LIMIT 1`;

    const res = await updateContactAction(
      {},
      fd({ id: c?.id as string, nom: "Brun", role: "Dirigeant", email: "d@ex.ch" }),
    );
    expect(res.success).toBe(true);
    const [row] = await sql`SELECT role, email FROM crm.contact WHERE id = ${c?.id}`;
    expect(row?.role).toBe("Dirigeant");
    expect(row?.email).toBe("d@ex.ch");
  });

  test("supprimer = archive (soft delete)", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    await createContactAction({}, fd({ client_id: cli.id, nom: "AArcher" }));
    const [c] = await sql`SELECT id FROM crm.contact WHERE client_id = ${cli.id} LIMIT 1`;

    const res = await supprimerContactAction({}, fd({ id: c?.id as string }));
    expect(res.success).toBe(true);
    const [row] = await sql`SELECT archived_at FROM crm.contact WHERE id = ${c?.id}`;
    expect(row?.archived_at).not.toBeNull();
  });

  test("anti-fuite : ne crée pas un contact pour un client d'un autre cabinet", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const res = await createContactAction({}, fd({ client_id: cliB.id, nom: "Intrus" }));
    expect(res.error).toMatch(/introuvable/i);
    const rows = await sql`SELECT id FROM crm.contact WHERE client_id = ${cliB.id}`;
    expect(rows).toHaveLength(0);
  });

  test("RBAC : lecteur refusé", async () => {
    acteur(cabinetA.id, "lecteur");
    const cli = await seedClient(sql, cabinetA.id);
    const res = await createContactAction({}, fd({ client_id: cli.id, nom: "Lecteur" }));
    expect(res.error).toMatch(/autoris/i);
  });
});

// ─── Adresses ───────────────────────────────────────────────────────────────

describe("adresses CRUD", () => {
  test("create + exclusivité de l'adresse principale", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    await createAdresseAction(
      {},
      fd({ client_id: cli.id, type: "siege", ville: "Lausanne", est_principale: "on" }),
    );
    await createAdresseAction(
      {},
      fd({ client_id: cli.id, type: "facturation", ville: "Genève", est_principale: "on" }),
    );

    const rows = await sql`
      SELECT ville, est_principale FROM crm.adresse
      WHERE client_id = ${cli.id} AND archived_at IS NULL`;
    const principales = rows.filter((r) => r.est_principale);
    expect(principales).toHaveLength(1);
    expect(principales[0]?.ville).toBe("Genève");
  });

  test("update + supprimer", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    await createAdresseAction({}, fd({ client_id: cli.id, type: "postale", ville: "Berne" }));
    const [a] = await sql`SELECT id FROM crm.adresse WHERE client_id = ${cli.id} LIMIT 1`;

    const rU = await updateAdresseAction(
      {},
      fd({ id: a?.id as string, type: "postale", ville: "Bienne", canton: "BE" }),
    );
    expect(rU.success).toBe(true);
    const [row] = await sql`SELECT ville, canton FROM crm.adresse WHERE id = ${a?.id}`;
    expect(row?.ville).toBe("Bienne");
    expect(row?.canton).toBe("BE");

    const rS = await supprimerAdresseAction({}, fd({ id: a?.id as string }));
    expect(rS.success).toBe(true);
    const [arch] = await sql`SELECT archived_at FROM crm.adresse WHERE id = ${a?.id}`;
    expect(arch?.archived_at).not.toBeNull();
  });

  test("anti-fuite : ne crée pas une adresse pour un client d'un autre cabinet", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const res = await createAdresseAction({}, fd({ client_id: cliB.id, type: "siege" }));
    expect(res.error).toMatch(/introuvable/i);
    const rows = await sql`SELECT id FROM crm.adresse WHERE client_id = ${cliB.id}`;
    expect(rows).toHaveLength(0);
  });
});
