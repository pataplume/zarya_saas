/**
 * Catalogues globaux crm.standard_* (Bloc A9, migration 0017, ADR 0012 + §20).
 *
 * BLOQUANT en CI. Ces tables sont une EXCEPTION DOCUMENTÉE à la règle multi-tenant
 * (packages/db/CLAUDE.md §1, crm-schema.md §20/§22.3) : catalogues de référence
 * partagés par TOUS les cabinets, SANS cabinet_id, RLS DÉSACTIVÉE, lecture seule.
 *
 * Ce test garantit deux choses :
 *   1. Les catalogues sont seedés et lisibles via le vrai `db` applicatif.
 *   2. L'exception est bien telle que documentée — AUCUN cabinet_id, RLS désactivée —
 *      ce qui justifie leur ABSENCE de METIER_TABLES / RLS_TABLES (pas de tenant à isoler).
 */
import {
  db,
  eq,
  standardCaisseAvs,
  standardCantonCh,
  standardCategorieDocument,
  standardTypeDocument,
} from "@zarya/db";
import type postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";

const STANDARD_TABLES = [
  "standard_categorie_document",
  "standard_type_document",
  "standard_canton_ch",
  "standard_caisse_avs",
] as const;

describe("Catalogues globaux crm.standard_* (A9)", () => {
  const sql: postgres.Sql = createServiceClient();

  afterAll(async () => {
    await sql.end();
  });

  test("standard_categorie_document : 6 catégories seedées (aligné doc.categorie_document)", async () => {
    const rows = await db
      .select({ code: standardCategorieDocument.code })
      .from(standardCategorieDocument);
    const codes = rows.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "bancaire",
        "fiscal",
        "salaire",
        "commercial",
        "administratif",
        "autre",
      ]),
    );
  });

  test("standard_type_document : seedé et chaque type pointe vers une catégorie existante", async () => {
    const rows = await db
      .select({
        code: standardTypeDocument.code,
        categorie_code: standardTypeDocument.categorie_code,
      })
      .from(standardTypeDocument);
    expect(rows.length).toBeGreaterThanOrEqual(11);
    expect(rows.map((r) => r.code)).toContain("releve_bancaire");

    // Intégrité référentielle : la catégorie de chaque type existe.
    const categories = await db
      .select({ code: standardCategorieDocument.code })
      .from(standardCategorieDocument);
    const categCodes = new Set(categories.map((c) => c.code));
    for (const row of rows) {
      expect(categCodes.has(row.categorie_code)).toBe(true);
    }
  });

  test("standard_canton_ch : les 26 cantons suisses sont seedés", async () => {
    const rows = await db.select({ code: standardCantonCh.code }).from(standardCantonCh);
    expect(rows).toHaveLength(26);
    // Échantillon : Vaud présent avec ses noms multilingues.
    const [vd] = await db
      .select({ nom_fr: standardCantonCh.nom_fr, nom_de: standardCantonCh.nom_de })
      .from(standardCantonCh)
      .where(eq(standardCantonCh.code, "VD"));
    expect(vd?.nom_fr).toBe("Vaud");
    expect(vd?.nom_de).toBe("Waadt");
  });

  test("standard_caisse_avs : caisses AVS officielles keyées par numéro (cantonales + fédérales + professionnelles)", async () => {
    const rows = await db
      .select({
        code: standardCaisseAvs.code,
        type: standardCaisseAvs.type,
        canton: standardCaisseAvs.canton,
      })
      .from(standardCaisseAvs);

    // 26 cantonales + 2 fédérales + 61 professionnelles (source ahv-iv.ch).
    expect(rows.length).toBeGreaterThanOrEqual(89);

    const byCode = new Map(rows.map((r) => [r.code, r]));
    // Numéros officiels : Zurich = 1, CFC = 26.1, CSC = 27, FER CIAM = 106.1.
    expect(byCode.get("1")?.type).toBe("cantonale");
    expect(byCode.get("1")?.canton).toBe("ZH");
    expect(byCode.get("26.1")?.type).toBe("federale");
    expect(byCode.get("27")?.type).toBe("federale");
    expect(byCode.get("106.1")?.type).toBe("professionnelle");

    // Les 26 cantonales sont rattachées à un canton ; les autres non.
    const cantonales = rows.filter((r) => r.type === "cantonale");
    expect(cantonales).toHaveLength(26);
    expect(cantonales.every((r) => r.canton !== null)).toBe(true);
    expect(rows.filter((r) => r.type !== "cantonale").every((r) => r.canton === null)).toBe(true);
  });

  test("standard_caisse_avs : intégrité référentielle — chaque canton rattaché existe", async () => {
    const caisses = await db
      .select({ canton: standardCaisseAvs.canton })
      .from(standardCaisseAvs)
      .where(eq(standardCaisseAvs.type, "cantonale"));
    const cantons = await db.select({ code: standardCantonCh.code }).from(standardCantonCh);
    const cantonCodes = new Set(cantons.map((c) => c.code));
    for (const c of caisses) {
      expect(c.canton).not.toBeNull();
      expect(cantonCodes.has(c.canton as string)).toBe(true);
    }
  });

  // ─── Exception multi-tenant documentée (§20/§22.3) ──────────────────────────

  test.each(
    STANDARD_TABLES,
  )("exception documentée : crm.%s n'a PAS de colonne cabinet_id", async (table) => {
    const rows = await sql`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'crm' AND table_name = ${table} AND column_name = 'cabinet_id'
      `;
    expect(rows).toHaveLength(0);
  });

  test.each(
    STANDARD_TABLES,
  )("exception documentée : RLS désactivée sur crm.%s (lecture publique)", async (table) => {
    const [row] = await sql`
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'crm' AND c.relname = ${table}
      `;
    expect(row?.relrowsecurity).toBe(false);
  });
});
