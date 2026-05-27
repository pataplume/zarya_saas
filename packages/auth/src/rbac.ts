import { ForbiddenError, UnauthorizedError } from "./errors";
import { createSupabaseServerClient } from "./server";
import type { CabinetMemberSession, CabinetRole, ClientContactSession, Role } from "./types";

// ─── getCurrentUser ───────────────────────────────────────────────────────────
// Retourne l'utilisateur authentifié ou null. Ne throw pas.
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Retourne l'utilisateur ou throw UnauthorizedError.
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// ─── requireCabinetMember ────────────────────────────────────────────────────
// Vérifie que l'utilisateur est membre d'un cabinet.
// Lit cabinet_id et role depuis app_metadata (injecté par le service role au provisioning).
export async function requireCabinetMember(): Promise<CabinetMemberSession> {
  const user = await requireAuth();

  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  const role = user.app_metadata.role as Role | undefined;

  if (!cabinet_id || !role || role === "client_contact") {
    throw new ForbiddenError("Not a cabinet member");
  }

  return { user, cabinet_id, role: role as CabinetRole };
}

// ─── requireRole ─────────────────────────────────────────────────────────────
// Vérifie que l'utilisateur a un des rôles autorisés.
export async function requireRole(
  roles: CabinetRole | CabinetRole[],
): Promise<CabinetMemberSession> {
  const session = await requireCabinetMember();
  const allowed = Array.isArray(roles) ? roles : [roles];

  if (!allowed.includes(session.role)) {
    throw new ForbiddenError(
      `Role '${session.role}' is not authorized. Required: ${allowed.join(" | ")}`,
    );
  }

  return session;
}

// ─── requireClientContact ────────────────────────────────────────────────────
// Pour les routes du dashboard client uniquement.
export async function requireClientContact(): Promise<ClientContactSession> {
  const user = await requireAuth();

  const role = user.app_metadata.role as Role | undefined;
  const client_id = user.app_metadata.client_id as string | undefined;

  if (role !== "client_contact" || !client_id) {
    throw new ForbiddenError("Not a client contact");
  }

  return { user, client_id };
}
