/**
 * Tests authentifiés — server actions de l'écran catalogue d'échéances (RUN 7,
 * PLAN-USABILITE-MVP.md).
 *
 * calendar.template_echeance : catalogue global ZARYA (cabinet_id NULL, seedé migration
 * 0008) + overrides propres à chaque cabinet. Un cabinet ne crée et ne modifie QUE ses
 * propres templates — jamais un template global, même en RBAC responsable (sceau du
 * catalogue fédéral). RBAC restreint au rôle responsable (comme /parametres/conformite).
 * @zarya/auth mocké ; next/cache stubé (alias). Couvre : RBAC non-responsable rejeté,
 * anti-fuite cross-cabinet, sceau global (jamais touché), nominal (créer/modifier/
 * désactiver).
 *
 * Réf : tests/CLAUDE.md § server actions ; packages/db/src/schema/calendar.ts.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedTemplateEcheance,
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

const {
  creerTemplateEcheanceAction,
  modifierTemplateEcheanceAction,
  desactiverTemplateEcheanceAction,
} = await import("../../../apps/web/app/(app)/app/parametres/echeances/actions");

const sql = createServiceClient();

function fdCreer(overrides: Partial<Record<string, string>> = {}): FormData {
  const fd = new FormData();
  const champs: Record<string, string> = {
    nom: "Modèle de test TVA",
    type_echeance: "tva",
    frequence: "trimestrielle",
    delai_alerte_jours: "10",
    jours_entre_relances: "5",
    max_relances_auto: "2",
    ...overrides,
  };
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

function fdModifier(id: string, overrides: Partial<Record<string, string>> = {}): FormData {
  const fd = fdCreer(overrides);
  fd.set("id", id);
  return fd;
}

function fdId(id: string): FormData {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

/** Insère un template global ZARYA (cabinet_id NULL) — jamais via seedTemplateEcheance. */
async function seedTemplateGlobal(): Promise<{ id: string }> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.template_echeance (id, cabinet_id, nom, type_echeance, frequence)
    VALUES (${id}, NULL, ${`Global test ${id.slice(0, 8)}`}, 'tva', 'trimestrielle')
  `;
  return { id };
}

describe("Server actions catalogue d'échéances (RUN 7)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let responsable: Awaited<ReturnType<typeof createTestUser>>;
  let collaborateur: Awaited<ReturnType<typeof createTestUser>>;
  const globalTemplateIds: string[] = [];

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    responsable = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    collaborateur = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
  });

  afterEach(() => {
    authState.user = null;
  });

  afterAll(async () => {
    if (globalTemplateIds.length > 0) {
      await sql`DELETE FROM calendar.template_echeance WHERE id = ANY(${globalTemplateIds})`;
    }
    await cleanupTestUsers(sql, responsable, collaborateur);
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── creerTemplateEcheanceAction ─────────────────────────────────────────────

  test("RBAC : un collaborateur ne peut pas créer de template", async () => {
    authState.user = collaborateur.authUser;
    const res = await creerTemplateEcheanceAction({}, fdCreer());
    expect(res.error).toMatch(/responsable/i);
  });

  test("nominal : création réussie avec cabinet_id posé correctement", async () => {
    authState.user = responsable.authUser;
    const res = await creerTemplateEcheanceAction({}, fdCreer({ nom: "TVA effective — nominal" }));
    expect(res.success).toBe(true);

    const [row] = await sql<
      { cabinet_id: string; nom: string; type_echeance: string; actif: boolean }[]
    >`
      SELECT cabinet_id, nom, type_echeance, actif
      FROM calendar.template_echeance
      WHERE cabinet_id = ${cabinetA.id} AND nom = 'TVA effective — nominal'
    `;
    expect(row).toMatchObject({
      cabinet_id: cabinetA.id,
      nom: "TVA effective — nominal",
      type_echeance: "tva",
      actif: true,
    });

    const [ev] = await sql<{ type: string; ressource_type: string; metadata: unknown }[]>`
      SELECT type, ressource_type, metadata
      FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_type = 'calendar.template_echeance'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(ev).toMatchObject({
      type: "note_ajoutee",
      ressource_type: "calendar.template_echeance",
    });
    expect(ev?.metadata).toMatchObject({ contexte: "template_echeance_cree" });
  });

  test("création : champs invalides (type_echeance hors enum) → erreur, rien en base", async () => {
    authState.user = responsable.authUser;
    const before = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM calendar.template_echeance WHERE cabinet_id = ${cabinetA.id}
    `;
    const res = await creerTemplateEcheanceAction(
      {},
      fdCreer({ type_echeance: "inexistant", nom: "Ne doit pas exister" }),
    );
    expect(res.error).toBeTruthy();
    const after = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM calendar.template_echeance WHERE cabinet_id = ${cabinetA.id}
    `;
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  // ─── modifierTemplateEcheanceAction ──────────────────────────────────────────

  test("RBAC : un collaborateur ne peut pas modifier un template", async () => {
    const tpl = await seedTemplateEcheance(sql, cabinetA.id);
    authState.user = collaborateur.authUser;
    const res = await modifierTemplateEcheanceAction({}, fdModifier(tpl.id, { nom: "Hack" }));
    expect(res.error).toMatch(/responsable/i);
    const [row] = await sql<{ nom: string }[]>`
      SELECT nom FROM calendar.template_echeance WHERE id = ${tpl.id}
    `;
    expect(row?.nom).not.toBe("Hack");
  });

  test("anti-fuite : cabinet A ne peut pas modifier un template du cabinet B", async () => {
    const tplB = await seedTemplateEcheance(sql, cabinetB.id);
    authState.user = responsable.authUser;
    const res = await modifierTemplateEcheanceAction(
      {},
      fdModifier(tplB.id, { nom: "Modifié par A" }),
    );
    expect(res.error).toMatch(/introuvable/i);
    const [row] = await sql<{ nom: string }[]>`
      SELECT nom FROM calendar.template_echeance WHERE id = ${tplB.id}
    `;
    expect(row?.nom).not.toBe("Modifié par A");
  });

  test("sceau global : cabinet A ne peut pas modifier un template global (cabinet_id NULL)", async () => {
    const global = await seedTemplateGlobal();
    globalTemplateIds.push(global.id);
    authState.user = responsable.authUser;
    const res = await modifierTemplateEcheanceAction(
      {},
      fdModifier(global.id, { nom: "Modifié — ne doit jamais passer" }),
    );
    expect(res.error).toMatch(/introuvable/i);

    const [row] = await sql<{ nom: string; cabinet_id: string | null }[]>`
      SELECT nom, cabinet_id FROM calendar.template_echeance WHERE id = ${global.id}
    `;
    expect(row?.cabinet_id).toBeNull();
    expect(row?.nom).not.toBe("Modifié — ne doit jamais passer");
  });

  test("nominal : modification réussie", async () => {
    const tpl = await seedTemplateEcheance(sql, cabinetA.id);
    authState.user = responsable.authUser;
    const res = await modifierTemplateEcheanceAction(
      {},
      fdModifier(tpl.id, {
        nom: "Override TVA modifié",
        delai_alerte_jours: "20",
        jours_entre_relances: "7",
        max_relances_auto: "1",
      }),
    );
    expect(res.success).toBe(true);

    const [row] = await sql<
      { nom: string; delai_alerte_jours: number; jours_entre_relances: number }[]
    >`
      SELECT nom, delai_alerte_jours, jours_entre_relances FROM calendar.template_echeance
      WHERE id = ${tpl.id}
    `;
    expect(row).toMatchObject({
      nom: "Override TVA modifié",
      delai_alerte_jours: 20,
      jours_entre_relances: 7,
    });
  });

  // ─── desactiverTemplateEcheanceAction ────────────────────────────────────────

  test("RBAC : un collaborateur ne peut pas désactiver un template", async () => {
    const tpl = await seedTemplateEcheance(sql, cabinetA.id);
    authState.user = collaborateur.authUser;
    const res = await desactiverTemplateEcheanceAction({}, fdId(tpl.id));
    expect(res.error).toMatch(/responsable/i);
    const [row] = await sql<{ actif: boolean }[]>`
      SELECT actif FROM calendar.template_echeance WHERE id = ${tpl.id}
    `;
    expect(row?.actif).toBe(true);
  });

  test("anti-fuite : cabinet A ne peut pas désactiver un template du cabinet B", async () => {
    const tplB = await seedTemplateEcheance(sql, cabinetB.id);
    authState.user = responsable.authUser;
    const res = await desactiverTemplateEcheanceAction({}, fdId(tplB.id));
    expect(res.error).toMatch(/introuvable/i);
    const [row] = await sql<{ actif: boolean }[]>`
      SELECT actif FROM calendar.template_echeance WHERE id = ${tplB.id}
    `;
    expect(row?.actif).toBe(true);
  });

  test("sceau global : cabinet A ne peut pas désactiver un template global (cabinet_id NULL)", async () => {
    const global = await seedTemplateGlobal();
    globalTemplateIds.push(global.id);
    authState.user = responsable.authUser;
    const res = await desactiverTemplateEcheanceAction({}, fdId(global.id));
    expect(res.error).toMatch(/introuvable/i);

    const [row] = await sql<{ actif: boolean; cabinet_id: string | null }[]>`
      SELECT actif, cabinet_id FROM calendar.template_echeance WHERE id = ${global.id}
    `;
    expect(row?.cabinet_id).toBeNull();
    expect(row?.actif).toBe(true);
  });

  test("nominal : désactivation réussie (actif=false, soft state)", async () => {
    const tpl = await seedTemplateEcheance(sql, cabinetA.id);
    authState.user = responsable.authUser;
    const res = await desactiverTemplateEcheanceAction({}, fdId(tpl.id));
    expect(res.success).toBe(true);

    const [row] = await sql<{ actif: boolean }[]>`
      SELECT actif FROM calendar.template_echeance WHERE id = ${tpl.id}
    `;
    expect(row?.actif).toBe(false);

    const [ev] = await sql<{ type: string; metadata: unknown }[]>`
      SELECT type, metadata FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_id = ${tpl.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(ev).toMatchObject({ type: "note_ajoutee" });
    expect(ev?.metadata).toMatchObject({ contexte: "template_echeance_desactive" });
  });
});
