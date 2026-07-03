/**
 * RUN 6 — Server action « Renvoyer une invitation » (parametres/equipe).
 *
 * Teste la VRAIE server action (apps/web) contre la base de test : RBAC (responsable
 * seul), anti-fuite cross-cabinet, et le nominal (nouveau token + expires_at prolongée +
 * ré-envoi via Supabase inviteUserByEmail mocké — pas d'email réel en CI).
 *
 * Harness : `@zarya/auth` mocké (requireAuth + createSupabaseAdminClient factice),
 * `next/cache` stubé via alias ; db service role réel.
 *
 * Références : PLAN-USABILITE-MVP.md (RUN 6, « Renvoyer une invitation équipe ») ;
 * tests/CLAUDE.md § server actions.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedInvitation,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
// Capture le dernier appel inviteUserByEmail (pour vérifier le ré-envoi réel).
const adminCalls = vi.hoisted(() => ({ inviteCount: 0, lastEmail: null as string | null }));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: async (email: string) => {
          adminCalls.inviteCount++;
          adminCalls.lastEmail = email;
          return { data: { user: { id: randomUUID() } }, error: null };
        },
        updateUserById: async () => ({ error: null }),
      },
    },
  }),
}));

const { renvoyerInvitationAction } = await import(
  "../../../apps/web/app/(app)/app/parametres/equipe/actions"
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
  adminCalls.inviteCount = 0;
  adminCalls.lastEmail = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

async function getInvitationRow(id: string) {
  const [row] = await sql<
    {
      token: string;
      token_expire_at: Date;
      statut: string;
      date_envoi: Date;
    }[]
  >`
    SELECT token, token_expire_at, statut, date_envoi
    FROM crm.invitation_membre WHERE id = ${id}
  `;
  return row;
}

/** Force une invitation en statut/expiration donnés (simule un token expiré). */
async function expireInvitation(id: string) {
  await sql`
    UPDATE crm.invitation_membre
    SET token_expire_at = now() - interval '1 day'
    WHERE id = ${id}
  `;
}

describe("renvoyerInvitationAction (RUN 6)", () => {
  test("RBAC : un collaborateur ne peut pas renvoyer une invitation", async () => {
    const invitation = await seedInvitation(sql, cabinetA.id);
    const before = await getInvitationRow(invitation.id);

    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;

    const res = await renvoyerInvitationAction(invitation.id);
    expect(res.error).toMatch(/responsable/i);
    expect(adminCalls.inviteCount).toBe(0);

    const after = await getInvitationRow(invitation.id);
    expect(after?.token).toBe(before?.token);
    expect(new Date(after?.token_expire_at ?? 0).getTime()).toBe(
      new Date(before?.token_expire_at ?? 0).getTime(),
    );

    await cleanupTestUsers(sql, user);
  });

  test("RBAC : un lecteur ne peut pas renvoyer une invitation", async () => {
    const invitation = await seedInvitation(sql, cabinetA.id);

    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;

    const res = await renvoyerInvitationAction(invitation.id);
    expect(res.error).toMatch(/responsable/i);
    expect(adminCalls.inviteCount).toBe(0);

    await cleanupTestUsers(sql, user);
  });

  test("anti-fuite : un responsable ne peut pas renvoyer l'invitation d'un autre cabinet", async () => {
    const invitationB = await seedInvitation(sql, cabinetB.id);
    const before = await getInvitationRow(invitationB.id);

    const userA = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = userA.authUser;

    const res = await renvoyerInvitationAction(invitationB.id);
    expect(res.error).toMatch(/introuvable/i);
    expect(adminCalls.inviteCount).toBe(0);

    const after = await getInvitationRow(invitationB.id);
    expect(after?.token).toBe(before?.token);

    await cleanupTestUsers(sql, userA);
  });

  test("invitation inexistante → erreur, aucun envoi", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;

    const res = await renvoyerInvitationAction(randomUUID());
    expect(res.error).toMatch(/introuvable/i);
    expect(adminCalls.inviteCount).toBe(0);

    await cleanupTestUsers(sql, user);
  });

  test("invitation déjà acceptée → erreur, pas de renvoi", async () => {
    const invitation = await seedInvitation(sql, cabinetA.id);
    await sql`UPDATE crm.invitation_membre SET statut = 'acceptee' WHERE id = ${invitation.id}`;

    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;

    const res = await renvoyerInvitationAction(invitation.id);
    expect(res.error).toBeTruthy();
    expect(adminCalls.inviteCount).toBe(0);

    const after = await getInvitationRow(invitation.id);
    expect(after?.statut).toBe("acceptee");

    await cleanupTestUsers(sql, user);
  });

  test("nominal : invitation expirée → nouveau token, expires_at prolongée, statut relancé, email renvoyé", async () => {
    const invitation = await seedInvitation(sql, cabinetA.id);
    await expireInvitation(invitation.id);
    const before = await getInvitationRow(invitation.id);
    expect(new Date(before?.token_expire_at ?? 0).getTime()).toBeLessThan(Date.now());

    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;

    const res = await renvoyerInvitationAction(invitation.id);
    expect(res.success).toBe(true);
    expect(adminCalls.inviteCount).toBe(1);

    const after = await getInvitationRow(invitation.id);
    expect(after?.token).not.toBe(before?.token);
    expect(new Date(after?.token_expire_at ?? 0).getTime()).toBeGreaterThan(Date.now());
    expect(after?.statut).toBe("envoyee");

    // Événement d'audit posé (crm.evenement, append-only)
    const [evt] = await sql<{ type: string; ressource_id: string }[]>`
      SELECT type, ressource_id FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_type = 'crm.invitation_membre'
        AND ressource_id = ${invitation.id}
    `;
    expect(evt?.type).toBe("note_ajoutee");

    await cleanupTestUsers(sql, user);
  });

  test("nominal : invitation non-expirée (en attente) peut aussi être renvoyée", async () => {
    const invitation = await seedInvitation(sql, cabinetA.id);
    const before = await getInvitationRow(invitation.id);

    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;

    const res = await renvoyerInvitationAction(invitation.id);
    expect(res.success).toBe(true);
    expect(adminCalls.inviteCount).toBe(1);

    const after = await getInvitationRow(invitation.id);
    expect(after?.token).not.toBe(before?.token);

    await cleanupTestUsers(sql, user);
  });
});
