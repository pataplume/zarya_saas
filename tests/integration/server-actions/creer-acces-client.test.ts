/**
 * F1 — Server action de création d'accès contact RH client (authentifiée).
 *
 * Teste la VRAIE server action (apps/web) contre la base de test :
 *  - le cabinet crée un accès → salaire.acces_client + contact.est_contact_rh=true ;
 *  - Supabase Auth (inviteUserByEmail + app_metadata) est MOCKÉ (pas d'email réel en CI) ;
 *  - AUTH + SCOPE cabinet + RBAC + anti-fuite + idempotence (accès déjà existant).
 *
 * Harness : `@zarya/auth` mocké (requireAuth + createSupabaseAdminClient factice),
 * `next/cache` stubé via alias ; db service role réel.
 *
 * Références : KICKOFF § BLOC F / F1 ; onboarding-client §auth ; tests/CLAUDE.md.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
// Capture la dernière app_metadata posée par updateUserById (pour assertions sécurité).
const adminCalls = vi.hoisted(() => ({ lastAppMetadata: null as Record<string, unknown> | null }));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: async () => ({ data: { user: { id: randomUUID() } }, error: null }),
        updateUserById: async (_id: string, attrs: { app_metadata?: Record<string, unknown> }) => {
          adminCalls.lastAppMetadata = attrs.app_metadata ?? null;
          return { error: null };
        },
      },
    },
  }),
}));

const { creerAccesClientAction } = await import(
  "../../../apps/web/app/(app)/app/clients/acces-client/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;

beforeAll(async () => {
  const s = await seedTwoCabinets(sql);
  cabinetA = s.cabinetA;
  cabinetB = s.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
});

afterEach(() => {
  authState.user = null;
  adminCalls.lastAppMetadata = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

/** Crée un contact AVEC email pour un client (l'action exige l'email). */
async function seedContactEmail(cabinet_id: string, client_id: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.contact (id, cabinet_id, client_id, nom, role, email)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'RH Test', 'Comptable', ${`rh-${id.slice(0, 8)}@test.ch`})
  `;
  return id;
}

function fd(client_id: string, contact_id: string): FormData {
  const f = new FormData();
  f.set("client_id", client_id);
  f.set("contact_id", contact_id);
  f.set("role", "rh");
  return f;
}

describe("creerAccesClientAction (F1)", () => {
  test("nominal : crée acces_client + est_contact_rh ; app_metadata sécurisé (client_contact + client_id)", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const contactId = await seedContactEmail(cabinetA.id, clientA.id);

    const res = await creerAccesClientAction({}, fd(clientA.id, contactId));
    expect(res.success).toBe(true);

    // app_metadata posé côté serveur (sécurité) : role client_contact + scope client.
    expect(adminCalls.lastAppMetadata).toMatchObject({
      role: "client_contact",
      client_id: clientA.id,
      cabinet_id: cabinetA.id,
    });

    const [acces] = await sql`
      SELECT cabinet_id, client_id, contact_id, role, auth_user_id
        FROM salaire.acces_client WHERE contact_id = ${contactId}
    `;
    expect(acces?.cabinet_id).toBe(cabinetA.id);
    expect(acces?.client_id).toBe(clientA.id);
    expect(acces?.role).toBe("rh");
    expect(acces?.auth_user_id).toMatch(/^[0-9a-f-]{36}$/);

    const [ct] = await sql`SELECT est_contact_rh FROM crm.contact WHERE id = ${contactId}`;
    expect(ct?.est_contact_rh).toBe(true);

    await cleanupTestUsers(sql, user);
  });

  test("RBAC : un lecteur ne peut pas créer d'accès", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;
    const contactId = await seedContactEmail(cabinetA.id, clientA.id);

    const res = await creerAccesClientAction({}, fd(clientA.id, contactId));
    expect(res.error).toMatch(/droits/i);

    const rows = await sql`SELECT id FROM salaire.acces_client WHERE contact_id = ${contactId}`;
    expect(rows).toHaveLength(0);
    await cleanupTestUsers(sql, user);
  });

  test("anti-fuite : ne crée pas d'accès pour un client d'un autre cabinet", async () => {
    const userA = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = userA.authUser;
    const clientB = await seedClient(sql, cabinetB.id);
    const contactB = await seedContactEmail(cabinetB.id, clientB.id);

    const res = await creerAccesClientAction({}, fd(clientB.id, contactB));
    expect(res.error).toMatch(/introuvable/i);

    const rows = await sql`SELECT id FROM salaire.acces_client WHERE contact_id = ${contactB}`;
    expect(rows).toHaveLength(0);
    await cleanupTestUsers(sql, userA);
  });

  test("idempotence : un 2e accès pour le même contact est refusé", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;
    const contactId = await seedContactEmail(cabinetA.id, clientA.id);

    const r1 = await creerAccesClientAction({}, fd(clientA.id, contactId));
    expect(r1.success).toBe(true);
    const r2 = await creerAccesClientAction({}, fd(clientA.id, contactId));
    expect(r2.error).toMatch(/déjà/i);

    await cleanupTestUsers(sql, user);
  });
});
