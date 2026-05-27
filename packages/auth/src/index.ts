// @zarya/auth — Helpers auth + RBAC pour ZARYA
// Tous les helpers serveur nécessitent Next.js (next/headers, next/server)

// Admin (service role — server-only)
export { createSupabaseAdminClient } from "./admin";

// Clients Supabase
export { createSupabaseBrowserClient } from "./browser";

// Erreurs
export { ForbiddenError, UnauthorizedError } from "./errors";
// Middleware Next.js
export { updateSupabaseSession } from "./middleware";
// RBAC (serveur uniquement)
export {
  getCurrentUser,
  requireAuth,
  requireCabinetMember,
  requireClientContact,
  requireRole,
} from "./rbac";
export { createSupabaseServerClient } from "./server";
// Types
export type {
  CabinetMemberSession,
  CabinetRole,
  ClientContactSession,
  Role,
  User,
} from "./types";
