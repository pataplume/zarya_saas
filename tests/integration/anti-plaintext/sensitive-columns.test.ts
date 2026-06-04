/**
 * Sceau anti-clair systématique (bloquant CI) — ADR 0013 addendum Phase I.
 *
 * Source de vérité : `sensitive-columns.ts` (SENSITIVE_COLUMNS + NON_SENSITIVE_ALLOWLIST).
 * Trois garde-fous structurels (information_schema + pg_description, aucun seed) :
 *   1. COMPLÉTUDE : toute colonne au nom sensible (tables de base, schémas métier) est classée
 *      au registre OU à l'allowlist — sinon échec (force la classification d'une colonne nouvelle).
 *   2. INDIRECTION VAULT : chaque entrée "vault" est un uuid ; aucune colonne sœur en clair de la
 *      donnée protégée n'existe dans la table.
 *   3. GARDE-FOU DOC : chaque colonne "clair_differe" porte un COMMENT ON COLUMN anti-oubli.
 * Plus une hygiène : chaque entrée du registre existe réellement en base.
 */

import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  NON_SENSITIVE_ALLOWLIST,
  SENSITIVE_COLUMNS,
  SENSITIVE_NAME_PATTERNS,
} from "./sensitive-columns";

const METIER_SCHEMAS = [
  "crm",
  "doc",
  "facture",
  "salaire",
  "calendar",
  "extraction",
  "search",
  "audit",
];

const key = (s: string, t: string, c: string) => `${s}.${t}.${c}`;

let sql: postgres.Sql;
type Col = { table_schema: string; table_name: string; column_name: string; data_type: string };
let matched: Col[] = [];

beforeAll(async () => {
  sql = createServiceClient();
  matched = (await sql`
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = ANY(${METIER_SCHEMAS})
      AND c.column_name ILIKE ANY(${SENSITIVE_NAME_PATTERNS})
    ORDER BY c.table_schema, c.table_name, c.column_name
  `) as unknown as Col[];
}, 30_000);

afterAll(async () => {
  await sql.end();
});

describe("Sceau anti-clair — registre SENSITIVE_COLUMNS (ADR 0013 addendum Phase I)", () => {
  test("COMPLÉTUDE : toute colonne au nom sensible est classée (registre ou allowlist)", () => {
    const classified = new Set<string>([
      ...SENSITIVE_COLUMNS.map((c) => key(c.schema, c.table, c.column)),
      ...NON_SENSITIVE_ALLOWLIST.map((c) => key(c.schema, c.table, c.column)),
    ]);
    const unclassified = matched
      .map((c) => key(c.table_schema, c.table_name, c.column_name))
      .filter((k) => !classified.has(k));
    // Si ça casse : une nouvelle colonne sensible a été ajoutée sans classification.
    // → l'inscrire dans SENSITIVE_COLUMNS (avec son mécanisme) ou NON_SENSITIVE_ALLOWLIST.
    expect(unclassified).toEqual([]);
  });

  test("INDIRECTION VAULT : chaque entrée 'vault' est un uuid sans colonne sœur en clair", async () => {
    const vaultCols = SENSITIVE_COLUMNS.filter((c) => c.mechanism === "vault");
    for (const v of vaultCols) {
      const row = matched.find(
        (m) =>
          m.table_schema === v.schema && m.table_name === v.table && m.column_name === v.column,
      );
      expect(
        row,
        `colonne vault absente en base : ${key(v.schema, v.table, v.column)}`,
      ).toBeTruthy();
      expect(row?.data_type).toBe("uuid");

      const tableCols = (await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = ${v.schema} AND table_name = ${v.table}
      `) as unknown as { column_name: string }[];
      const names = new Set(tableCols.map((r) => r.column_name));
      for (const forbidden of v.forbiddenPlaintextColumns ?? []) {
        expect(
          names.has(forbidden),
          `colonne en clair interdite ${forbidden} présente dans ${v.schema}.${v.table}`,
        ).toBe(false);
      }
    }
  });

  test("GARDE-FOU DOC : chaque colonne 'clair_differe' porte un COMMENT anti-oubli", async () => {
    const clairCols = SENSITIVE_COLUMNS.filter((c) => c.mechanism === "clair_differe");
    for (const c of clairCols) {
      const [row] = (await sql`
        SELECT col_description(
                 format('%I.%I', ${c.schema}::text, ${c.table}::text)::regclass::oid,
                 (SELECT ordinal_position FROM information_schema.columns
                   WHERE table_schema = ${c.schema} AND table_name = ${c.table}
                     AND column_name = ${c.column})
               ) AS comment
      `) as unknown as { comment: string | null }[];
      expect(
        row?.comment,
        `COMMENT anti-oubli manquant sur ${key(c.schema, c.table, c.column)}`,
      ).toBeTruthy();
    }
  });

  test("HYGIÈNE : chaque entrée du registre existe réellement en base", async () => {
    const all = [...SENSITIVE_COLUMNS, ...NON_SENSITIVE_ALLOWLIST];
    for (const c of all) {
      const [row] = (await sql`
        SELECT 1 AS ok FROM information_schema.columns
        WHERE table_schema = ${c.schema} AND table_name = ${c.table} AND column_name = ${c.column}
      `) as unknown as { ok: number }[];
      expect(
        row?.ok,
        `entrée registre inexistante en base : ${key(c.schema, c.table, c.column)}`,
      ).toBe(1);
    }
  });
});
