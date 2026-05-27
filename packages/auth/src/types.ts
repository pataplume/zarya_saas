import type { User } from "@supabase/supabase-js";

// ─── Rôles ZARYA ─────────────────────────────────────────────────────────────

export type Role =
  | "responsable"
  | "gestionnaire_salaires"
  | "collaborateur"
  | "lecteur"
  | "client_contact";

// Rôles côté cabinet (excluant client_contact)
export type CabinetRole = Exclude<Role, "client_contact">;

// ─── Sessions typées ──────────────────────────────────────────────────────────

export type CabinetMemberSession = {
  user: User;
  cabinet_id: string;
  role: CabinetRole;
};

export type ClientContactSession = {
  user: User;
  client_id: string;
};

// ─── Re-export Supabase User pour usage externe ───────────────────────────────
export type { User } from "@supabase/supabase-js";
