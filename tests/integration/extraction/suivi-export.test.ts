/**
 * G6b — suivi post-export du cycle salaire (intégration DB réelle).
 *
 * Vérifie : marquage téléchargé (genere→telecharge, idempotent), confirmation d'import
 * (export→importe + AUTO-clôture période exportee→cloturee + événements), garde « période
 * exportée requise », scope cross-cabinet. Réf : salaire.md §6.1 ; flow E §10-11 ; KICKOFF G6.
 */
import { randomUUID } from "node:crypto";
import {
  confirmerImportExport,
  genererExportPeriode,
  marquerExportTelecharge,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedElementPaie,
  seedEmploye,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;

/** Crée une période prête, l'exporte (statut période→exportee), renvoie {periode_id, export_id}. */
async function seedPeriodeExportee(): Promise<{ periode_id: string; export_id: string }> {
  const c = await seedClient(sql, cabinet.id);
  const e = await seedEmploye(sql, cabinet.id, c.id);
  await sql`UPDATE salaire.employe SET statut = 'actif' WHERE id = ${e.id}`;
  const p = await seedPeriode(sql, cabinet.id, c.id);
  await seedElementPaie(sql, cabinet.id, c.id, p.id, e.id);
  await sql`UPDATE salaire.periode SET statut = 'validee', revue_fiduciaire_at = now() WHERE id = ${p.id}`;
  const res = await genererExportPeriode({
    cabinet_id: cabinet.id,
    periode_id: p.id,
    format_code: "csv_generique",
    genere_par: randomUUID(),
  });
  return { periode_id: p.id, export_id: res.export_id };
}

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("marquerExportTelecharge (G6b)", () => {
  test("genere → telecharge + événement, idempotent", async () => {
    const { periode_id, export_id } = await seedPeriodeExportee();

    const r1 = await marquerExportTelecharge({
      cabinet_id: cabinet.id,
      export_id,
      acteur_id: randomUUID(),
    });
    expect(r1.marque).toBe(true);

    const [exp] =
      await sql`SELECT statut, telecharge_le FROM salaire.export WHERE id = ${export_id}`;
    expect(exp?.statut).toBe("telecharge");
    expect(exp?.telecharge_le).not.toBeNull();

    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${periode_id} AND type = 'export_telecharge'`;
    expect(ev.length).toBeGreaterThanOrEqual(1);

    // 2e appel : ne régresse pas (déjà telecharge ≠ genere).
    const r2 = await marquerExportTelecharge({
      cabinet_id: cabinet.id,
      export_id,
      acteur_id: randomUUID(),
    });
    expect(r2.marque).toBe(false);
  });
});

describe("confirmerImportExport (G6b)", () => {
  test("export → importe + AUTO-clôture période + événements", async () => {
    const { periode_id, export_id } = await seedPeriodeExportee();
    const import_par = randomUUID();

    const res = await confirmerImportExport({
      cabinet_id: cabinet.id,
      export_id,
      import_par,
      notes: "Importé dans Crésus",
    });
    expect(res.statut_periode).toBe("cloturee");

    const [exp] =
      await sql`SELECT statut, import_confirme, import_confirme_par, import_notes FROM salaire.export WHERE id = ${export_id}`;
    expect(exp?.statut).toBe("importe");
    expect(exp?.import_confirme).toBe(true);
    expect(exp?.import_confirme_par).toBe(import_par);
    expect(exp?.import_notes).toBe("Importé dans Crésus");

    const [p] =
      await sql`SELECT statut, date_import_confirme, date_cloture FROM salaire.periode WHERE id = ${periode_id}`;
    expect(p?.statut).toBe("cloturee");
    expect(p?.date_cloture).not.toBeNull();

    const evs =
      await sql`SELECT type FROM salaire.evenement WHERE periode_id = ${periode_id} AND type IN ('import_confirme','periode_clotturee')`;
    expect(evs.length).toBe(2);

    // Idempotence : reconfirmer une période déjà clôturée est refusé.
    await expect(
      confirmerImportExport({ cabinet_id: cabinet.id, export_id, import_par }),
    ).rejects.toThrow(/déjà clôturée/i);
  });

  test("refuse si la période n'est pas exportée", async () => {
    // Période validée mais jamais exportée → pas d'export ; on fabrique l'incohérence en
    // ré-ouvrant la période après création de l'export.
    const { periode_id, export_id } = await seedPeriodeExportee();
    await sql`UPDATE salaire.periode SET statut = 'validee' WHERE id = ${periode_id}`;
    await expect(
      confirmerImportExport({ cabinet_id: cabinet.id, export_id, import_par: randomUUID() }),
    ).rejects.toThrow(/exportée/i);
  });

  test("scope : export d'un autre cabinet introuvable", async () => {
    const { export_id } = await seedPeriodeExportee();
    await expect(
      confirmerImportExport({ cabinet_id: cabinetB.id, export_id, import_par: randomUUID() }),
    ).rejects.toThrow(/introuvable/i);
  });
});
