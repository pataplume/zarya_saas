/**
 * G6a — génération de l'export salaire (intégration DB réelle).
 *
 * Vérifie : CSV pur (échappement), assemblage matrice employés×éléments, enregistrement
 * salaire.export + période→exportee + événement, garde « période prête » (validee + revue).
 * Réf : salaire.md §6 ; flow E §7-10 ; KICKOFF G6.
 */
import { randomUUID } from "node:crypto";
import { assemblerLignesExport, genererExportPeriode, toCsvSalaire } from "@zarya/extraction";
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
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let client: TestClient;
let employe: { id: string };
let periodePrete: string;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  // L'employé doit être 'actif' pour figurer dans l'export.
  employe = await seedEmploye(sql, cabinet.id, client.id);
  await sql`UPDATE salaire.employe SET statut = 'actif' WHERE id = ${employe.id}`;
  const p = await seedPeriode(sql, cabinet.id, client.id);
  periodePrete = p.id;
  await seedElementPaie(sql, cabinet.id, client.id, periodePrete, employe.id); // HEURES_NORMALES = 168
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("toCsvSalaire (PUR)", () => {
  test("échappe les champs contenant séparateur/guillemets/retour", () => {
    const csv = toCsvSalaire(["A", "B"], [["x;y", 'a"b']]);
    expect(csv).toContain('"x;y"');
    expect(csv).toContain('"a""b"');
  });
});

describe("genererExportPeriode (G6a)", () => {
  test("refuse une période non prête (ni validée ni revue)", async () => {
    await expect(
      genererExportPeriode({
        cabinet_id: cabinet.id,
        periode_id: periodePrete,
        format_code: "csv_generique",
        genere_par: randomUUID(),
      }),
    ).rejects.toThrow(/non prête/i);
  });

  test("CSV : période prête → export enregistré + période exportee + matrice", async () => {
    // Rendre la période prête : validee + revue fiduciaire.
    await sql`UPDATE salaire.periode SET statut = 'validee', revue_fiduciaire_at = now() WHERE id = ${periodePrete}`;

    const lignes = await assemblerLignesExport(cabinet.id, periodePrete);
    expect(lignes.nb_employes).toBe(1);
    expect(lignes.headers.slice(0, 2)).toEqual(["Nom", "Prénom"]);

    const res = await genererExportPeriode({
      cabinet_id: cabinet.id,
      periode_id: periodePrete,
      format_code: "csv_generique",
      genere_par: randomUUID(),
    });
    expect(res.nom_fichier).toMatch(/\.csv$/);
    expect(res.contenu_csv).toContain("168");

    const [exp] =
      await sql`SELECT statut, nb_employes_inclus FROM salaire.export WHERE id = ${res.export_id}`;
    expect(exp?.statut).toBe("genere");
    expect(exp?.nb_employes_inclus).toBe(1);

    const [p] =
      await sql`SELECT statut, date_export_genere FROM salaire.periode WHERE id = ${periodePrete}`;
    expect(p?.statut).toBe("exportee");
    expect(p?.date_export_genere).not.toBeNull();

    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${periodePrete} AND type = 'export_genere'`;
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  test("scope : période d'un autre cabinet introuvable", async () => {
    await expect(
      genererExportPeriode({
        cabinet_id: cabinetB.id,
        periode_id: periodePrete,
        format_code: "csv_generique",
        genere_par: randomUUID(),
      }),
    ).rejects.toThrow(/introuvable/i);
  });
});
