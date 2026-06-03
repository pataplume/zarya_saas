/**
 * Tests d'isolation multi-tenant — search.* (Bloc H1, migration 0041). BLOQUANTS en CI.
 *
 * Vérifient la RLS Postgres (chemin DB) sur search.document_chunk et search.requete, dont
 * l'exigence explicite du KICKOFF H1 : l'isolation tient AU NIVEAU DES EMBEDDINGS — une
 * recherche cosinus exécutée dans le contexte du cabinet A ne retourne JAMAIS un chunk du
 * cabinet B, même si l'embedding de B est le plus proche de la requête.
 *
 * Le chemin applicatif (db service role) est couvert par cross-tenant-leak/generic-leak.test.ts.
 * Réf : docs/modules/search.md §6 (sécurité) ; ADR 0005 + addendum ; ADR 0022.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedDocumentChunk,
  seedFichierPhysique,
  seedSearchRequete,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

/** Littéral halfvec(3584) unitaire orienté sur `dir` (mêmes conventions que le seed). */
function halfvec(dir: number): string {
  const v = new Array(3584).fill(0);
  v[((dir % 3584) + 3584) % 3584] = 1;
  return `[${v.join(",")}]`;
}

describe("Multi-tenant isolation — search.* (H1)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let chunkA: { id: string };
  let chunkB: { id: string };

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    const clientA = await seedClient(sql, cabinetA.id);
    const clientB = await seedClient(sql, cabinetB.id);
    const fpA = await seedFichierPhysique(sql, cabinetA.id);
    const fpB = await seedFichierPhysique(sql, cabinetB.id);
    const docA = await seedDocument(sql, cabinetA.id, clientA.id, fpA.id);
    const docB = await seedDocument(sql, cabinetB.id, clientB.id, fpB.id);
    // Les DEUX chunks ont le même embedding (direction 5) → équidistants d'une requête en
    // direction 5. Seule la RLS doit empêcher A de voir celui de B.
    chunkA = await seedDocumentChunk(sql, cabinetA.id, clientA.id, docA.id, { embeddingDir: 5 });
    chunkB = await seedDocumentChunk(sql, cabinetB.id, clientB.id, docB.id, { embeddingDir: 5 });
    await seedSearchRequete(sql, cabinetA.id, cabinetA.user_id);
    await seedSearchRequete(sql, cabinetB.id, cabinetB.user_id);
  }, 120_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("document_chunk : A ne voit que ses propres chunks (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (t) => t`SELECT id, cabinet_id FROM search.document_chunk`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === chunkB.id)).toBe(false);
  });

  test("ISOLATION EMBEDDINGS : la recherche cosinus de A ne retourne jamais un chunk de B", async () => {
    const q = halfvec(5); // requête équidistante des deux chunks
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (t) =>
        t`SELECT id, cabinet_id FROM search.document_chunk
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${q}::halfvec
          LIMIT 5`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === chunkB.id)).toBe(false);
    expect(rows.some((r) => r.id === chunkA.id)).toBe(true);
  });

  test("honnêteté du modèle : le service role (sans contexte) voit les 2 cabinets", async () => {
    const rows =
      await sql`SELECT cabinet_id FROM search.document_chunk WHERE cabinet_id IN (${cabinetA.id}, ${cabinetB.id})`;
    const cabinets = new Set(rows.map((r) => r.cabinet_id));
    expect(cabinets.has(cabinetA.id)).toBe(true);
    expect(cabinets.has(cabinetB.id)).toBe(true);
  });

  test("document_chunk : UPDATE de A ciblant une ligne de B n'affecte rien", async () => {
    const affected = await queryAsTenant(
      sql,
      cabinetA.id,
      (t) =>
        t`UPDATE search.document_chunk SET chunk_index = 99 WHERE id = ${chunkB.id} RETURNING id`,
    );
    expect(affected.length).toBe(0);
  });

  test("document_chunk : DELETE de A ciblant une ligne de B n'affecte rien", async () => {
    const affected = await queryAsTenant(
      sql,
      cabinetA.id,
      (t) => t`DELETE FROM search.document_chunk WHERE id = ${chunkB.id} RETURNING id`,
    );
    expect(affected.length).toBe(0);
  });

  test("requete : A ne voit que ses propres recherches (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (t) => t`SELECT id, cabinet_id FROM search.requete`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });
});
