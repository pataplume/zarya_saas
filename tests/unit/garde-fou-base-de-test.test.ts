/**
 * P0-2 amendé — Résolution de la base de tests (décision founder 17.07.2026).
 *
 * Vérifie la fonction pure `resoudreBaseDeTest` :
 *  - TEST_DATABASE_URL posée (base dédiée) → plein régime ;
 *  - absente → repli DATABASE_URL (même la prod, en connaissance de cause) en mode
 *    live bridé : brides (pool 2 + concurrence réduite) + avertissement console ;
 *  - aucune URL → mode « aucune_url » (échec explicite des fichiers d'intégration).
 * Test unitaire pur : aucune connexion DB.
 */
import { describe, expect, it } from "vitest";
import {
  AVERTISSEMENT_MODE_LIVE_BRIDE,
  estCheminTestIntegration,
  MESSAGE_AUCUNE_URL_BASE_DE_TEST,
  POOL_MAX_MODE_LIVE_BRIDE,
  REF_PROJET_PROD,
  resoudreBaseDeTest,
  URL_FACTICE_TESTS_UNITAIRES,
} from "../integration/helpers/base-de-test";

const URL_TEST_VALIDE =
  "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
const URL_PROD = `postgresql://postgres:secret@db.${REF_PROJET_PROD}.supabase.co:5432/postgres`;

describe("resoudreBaseDeTest — mode dédié (TEST_DATABASE_URL posée)", () => {
  it("retourne la base dédiée en plein régime : ni bride ni avertissement", () => {
    expect(resoudreBaseDeTest({ TEST_DATABASE_URL: URL_TEST_VALIDE })).toEqual({
      mode: "dediee",
      url: URL_TEST_VALIDE,
    });
  });

  it("trim les espaces autour de TEST_DATABASE_URL", () => {
    expect(resoudreBaseDeTest({ TEST_DATABASE_URL: `  ${URL_TEST_VALIDE}  ` }).url).toBe(
      URL_TEST_VALIDE,
    );
  });

  it("prime sur DATABASE_URL quand les deux sont posées", () => {
    const resolution = resoudreBaseDeTest({
      DATABASE_URL: URL_PROD,
      TEST_DATABASE_URL: URL_TEST_VALIDE,
    });
    expect(resolution.mode).toBe("dediee");
    expect(resolution.url).toBe(URL_TEST_VALIDE);
  });
});

describe("resoudreBaseDeTest — mode live bridé (TEST_DATABASE_URL absente)", () => {
  it("replie sur DATABASE_URL avec brides + avertissement (décision founder 17.07)", () => {
    const resolution = resoudreBaseDeTest({ DATABASE_URL: URL_PROD });
    expect(resolution.mode).toBe("live_bride");
    expect(resolution.url).toBe(URL_PROD);
    expect(resolution.avertissement).toBe(AVERTISSEMENT_MODE_LIVE_BRIDE);
  });

  it("accepte la base de PROD en repli — plus de refus dur, l'avertissement remplace", () => {
    // Décision founder 17.07 : pas de base de test avant le lancement, la suite peut
    // tourner contre la prod EN CONNAISSANCE DE CAUSE (brides + warning), sans throw.
    expect(() => resoudreBaseDeTest({ DATABASE_URL: URL_PROD })).not.toThrow();
    expect(AVERTISSEMENT_MODE_LIVE_BRIDE).toContain("TEST_DATABASE_URL absent");
    expect(AVERTISSEMENT_MODE_LIVE_BRIDE).toContain("LIVE");
    expect(AVERTISSEMENT_MODE_LIVE_BRIDE).toContain("bridées");
    expect(AVERTISSEMENT_MODE_LIVE_BRIDE).toContain("décision founder 17.07");
  });

  it("TEST_DATABASE_URL vide ou blanche = absente → repli DATABASE_URL bridé", () => {
    expect(resoudreBaseDeTest({ TEST_DATABASE_URL: "", DATABASE_URL: URL_TEST_VALIDE })).toEqual({
      mode: "live_bride",
      url: URL_TEST_VALIDE,
      avertissement: AVERTISSEMENT_MODE_LIVE_BRIDE,
    });
    expect(
      resoudreBaseDeTest({ TEST_DATABASE_URL: "   ", DATABASE_URL: URL_TEST_VALIDE }).mode,
    ).toBe("live_bride");
  });

  it("TEST_DATABASE_URL pointant la PROD n'est jamais du plein régime : brides aussi", () => {
    // Y compris via le pooler (postgres.REF@aws-0-xx.pooler.supabase.com) : la ref suffit.
    for (const url of [
      URL_PROD,
      `postgresql://postgres.${REF_PROJET_PROD}:secret@aws-0-eu-central-2.pooler.supabase.com:6543/postgres`,
    ]) {
      const resolution = resoudreBaseDeTest({ TEST_DATABASE_URL: url });
      expect(resolution.mode).toBe("live_bride");
      expect(resolution.url).toBe(url);
      expect(resolution.avertissement).toBe(AVERTISSEMENT_MODE_LIVE_BRIDE);
    }
  });

  it("le plafond de pool bridé vaut 2 connexions par process", () => {
    expect(POOL_MAX_MODE_LIVE_BRIDE).toBe("2");
  });
});

describe("resoudreBaseDeTest — aucune URL", () => {
  it("sans TEST_DATABASE_URL ni DATABASE_URL : mode aucune_url, pas d'URL", () => {
    expect(resoudreBaseDeTest({})).toEqual({ mode: "aucune_url" });
    expect(MESSAGE_AUCUNE_URL_BASE_DE_TEST).toContain("DATABASE_URL");
    expect(MESSAGE_AUCUNE_URL_BASE_DE_TEST).toContain("TEST_DATABASE_URL");
  });

  it("l'URL factice des runs unitaires ne compte pas comme base live", () => {
    // tests/setup.ts substitue l'URL factice comme DATABASE_URL en mode « aucune_url » :
    // une résolution ultérieure (createServiceClient) ne doit pas la prendre pour du live.
    expect(resoudreBaseDeTest({ DATABASE_URL: URL_FACTICE_TESTS_UNITAIRES })).toEqual({
      mode: "aucune_url",
    });
  });

  it("URL factice : syntaxiquement valide (new URL passe), jamais la prod", () => {
    expect(() => new URL(URL_FACTICE_TESTS_UNITAIRES)).not.toThrow();
    expect(URL_FACTICE_TESTS_UNITAIRES).not.toContain(REF_PROJET_PROD);
  });
});

describe("estCheminTestIntegration", () => {
  it("détecte les fichiers de tests/integration/", () => {
    expect(
      estCheminTestIntegration("/Users/x/Zarya_Saas/tests/integration/crm-views/vues.test.ts"),
    ).toBe(true);
  });

  it("gère les séparateurs Windows", () => {
    expect(estCheminTestIntegration("C:\\repo\\tests\\integration\\extraction\\a.test.ts")).toBe(
      true,
    );
  });

  it("laisse passer les tests unitaires et les tests de packages", () => {
    expect(estCheminTestIntegration("/Users/x/Zarya_Saas/tests/unit/libelles.test.ts")).toBe(false);
    expect(
      estCheminTestIntegration("/Users/x/Zarya_Saas/packages/calendar/src/moteur.test.ts"),
    ).toBe(false);
    expect(estCheminTestIntegration("")).toBe(false);
  });
});
