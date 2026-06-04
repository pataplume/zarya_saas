// H3b — Agrégation par TEMPLATES PARAMÉTRÉS (arbitré founder : pas de SQL libre généré par le LLM).
// Le LLM choisit un id de template + des paramètres TYPÉS ; ZARYA exécute une requête paramétrée
// dont le `cabinet_id` est TOUJOURS imposé par l'appelant (jamais par le LLM). Surface d'injection
// = les paramètres, neutralisés par (1) validation EXPLICITE (uuid/entier/clés connues) AVANT toute
// requête + (2) liaison comme paramètres SQL (jamais de concaténation). SELECT-only par construction.
// Validation manuelle (pas de dépendance) → logique de sécurité auditable. Réf : search.md §6.2 ; KICKOFF H3.

import { db, sql } from "@zarya/db";

export class AggregationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AggregationError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ValidationResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

interface AggregationTemplate {
  id: string;
  /** Description en langage naturel — proposée au LLM pour la sélection. */
  description: string;
  /** Valide STRICTEMENT les paramètres (clés connues + types). Rejette tout le reste. */
  validate: (params: unknown) => ValidationResult;
  /** Construit une requête PARAMÉTRÉE. cabinet_id imposé ; jamais de concaténation de valeurs. */
  build: (cabinetId: string, params: Record<string, unknown>) => ReturnType<typeof sql>;
}

/** Valide un sous-ensemble {client_id?: uuid, annee?: entier 2000-2100} avec clés strictes. */
function validateClientAnnee(params: unknown): ValidationResult {
  const p = (params ?? {}) as Record<string, unknown>;
  if (typeof p !== "object" || p === null || Array.isArray(p)) {
    return { ok: false, error: "paramètres : objet attendu" };
  }
  for (const key of Object.keys(p)) {
    if (key !== "client_id" && key !== "annee") {
      return { ok: false, error: `paramètre inconnu : "${key}"` };
    }
  }
  const value: Record<string, unknown> = {};
  if (p.client_id !== undefined) {
    if (typeof p.client_id !== "string" || !UUID_RE.test(p.client_id)) {
      return { ok: false, error: "client_id doit être un uuid" };
    }
    value.client_id = p.client_id;
  }
  if (p.annee !== undefined) {
    if (
      typeof p.annee !== "number" ||
      !Number.isInteger(p.annee) ||
      p.annee < 2000 ||
      p.annee > 2100
    ) {
      return { ok: false, error: "annee doit être un entier (2000-2100)" };
    }
    value.annee = p.annee;
  }
  return { ok: true, value };
}

// ── Registre des templates (whitelist) ───────────────────────────────────────
const COMPTER_DOCUMENTS: AggregationTemplate = {
  id: "compter_documents_par_type",
  description:
    "Compte le nombre de documents par type pour le cabinet. Filtres optionnels : client (id), année.",
  validate: validateClientAnnee,
  build: (cabinetId, p) => sql`
    SELECT type, count(*)::int AS n
    FROM doc.document
    WHERE cabinet_id = ${cabinetId}
      ${p.client_id ? sql`AND client_id = ${p.client_id as string}` : sql``}
      ${p.annee ? sql`AND EXTRACT(year FROM created_at) = ${p.annee as number}` : sql``}
    GROUP BY type
    ORDER BY n DESC`,
};

export const AGGREGATION_TEMPLATES: readonly AggregationTemplate[] = [COMPTER_DOCUMENTS];

/** Catalogue (id + description) proposé au LLM pour choisir un template. */
export function aggregationCatalog(): Array<{ id: string; description: string }> {
  return AGGREGATION_TEMPLATES.map((t) => ({ id: t.id, description: t.description }));
}

export interface RunAggregationInput {
  cabinet_id: string;
  template_id: string;
  params?: unknown;
}

/**
 * Exécute un template d'agrégation. Rejette (AggregationError) tout template inconnu ou tout
 * paramètre non conforme. cabinet_id imposé par l'appelant (sécurité multi-tenant), jamais par le LLM.
 */
export async function runAggregation(
  input: RunAggregationInput,
): Promise<{ template_id: string; rows: Array<Record<string, unknown>> }> {
  const template = AGGREGATION_TEMPLATES.find((t) => t.id === input.template_id);
  if (!template) {
    throw new AggregationError(`Template d'agrégation inconnu : "${input.template_id}".`);
  }
  const validated = template.validate(input.params);
  if (!validated.ok) {
    throw new AggregationError(`Paramètres d'agrégation invalides : ${validated.error}.`);
  }
  const rows = (await db.execute(
    template.build(input.cabinet_id, validated.value),
  )) as unknown as Array<Record<string, unknown>>;
  return { template_id: template.id, rows };
}
