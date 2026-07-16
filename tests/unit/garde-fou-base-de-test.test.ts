/**
 * P0-2 — Garde-fou base de tests (AUDIT-MVP.md § 8).
 *
 * Vérifie la fonction pure `resoudreUrlBaseDeTest` : les tests d'intégration lisent
 * EXCLUSIVEMENT TEST_DATABASE_URL, jamais DATABASE_URL, et toute URL pointant la base
 * de PRODUCTION (ref projet xkwbtwikecihypjxundl) est refusée immédiatement.
 * Test unitaire pur : aucune connexion DB.
 */
import { describe, expect, it } from "vitest";
import {
  estCheminTestIntegration,
  MESSAGE_TEST_DATABASE_URL_MANQUANTE,
  MESSAGE_TEST_DATABASE_URL_PROD,
  REF_PROJET_PROD,
  resoudreUrlBaseDeTest,
  URL_FACTICE_TESTS_UNITAIRES,
} from "../integration/helpers/base-de-test";

const URL_TEST_VALIDE =
  "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
const URL_PROD = `postgresql://postgres:secret@db.${REF_PROJET_PROD}.supabase.co:5432/postgres`;

describe("resoudreUrlBaseDeTest — garde-fou P0-2", () => {
  it("retourne TEST_DATABASE_URL quand elle est valide", () => {
    expect(resoudreUrlBaseDeTest({ TEST_DATABASE_URL: URL_TEST_VALIDE })).toBe(URL_TEST_VALIDE);
  });

  it("trim les espaces autour de TEST_DATABASE_URL", () => {
    expect(resoudreUrlBaseDeTest({ TEST_DATABASE_URL: `  ${URL_TEST_VALIDE}  ` })).toBe(
      URL_TEST_VALIDE,
    );
  });

  it("ignore DATABASE_URL : seule TEST_DATABASE_URL est lue", () => {
    // DATABASE_URL (même prod) présente n'est jamais utilisée comme repli.
    expect(() => resoudreUrlBaseDeTest({ DATABASE_URL: URL_PROD })).toThrowError(
      MESSAGE_TEST_DATABASE_URL_MANQUANTE,
    );
    // Et n'influence pas la résolution quand TEST_DATABASE_URL est posée.
    expect(
      resoudreUrlBaseDeTest({ DATABASE_URL: URL_PROD, TEST_DATABASE_URL: URL_TEST_VALIDE }),
    ).toBe(URL_TEST_VALIDE);
  });

  it("jette avec la marche à suivre si TEST_DATABASE_URL est absente", () => {
    expect(() => resoudreUrlBaseDeTest({})).toThrowError(MESSAGE_TEST_DATABASE_URL_MANQUANTE);
    expect(MESSAGE_TEST_DATABASE_URL_MANQUANTE).toContain("TEST_DATABASE_URL");
    expect(MESSAGE_TEST_DATABASE_URL_MANQUANTE).toContain("Supabase");
  });

  it("jette si TEST_DATABASE_URL est vide ou blanche", () => {
    expect(() => resoudreUrlBaseDeTest({ TEST_DATABASE_URL: "" })).toThrowError(
      MESSAGE_TEST_DATABASE_URL_MANQUANTE,
    );
    expect(() => resoudreUrlBaseDeTest({ TEST_DATABASE_URL: "   " })).toThrowError(
      MESSAGE_TEST_DATABASE_URL_MANQUANTE,
    );
  });

  it("jette immédiatement si TEST_DATABASE_URL contient la ref du projet de PROD", () => {
    expect(() => resoudreUrlBaseDeTest({ TEST_DATABASE_URL: URL_PROD })).toThrowError(
      MESSAGE_TEST_DATABASE_URL_PROD,
    );
    expect(MESSAGE_TEST_DATABASE_URL_PROD).toContain("PROD");
    // Même via le pooler (aws-0-xx.pooler.supabase.com/user postgres.REF) : la ref suffit.
    expect(() =>
      resoudreUrlBaseDeTest({
        TEST_DATABASE_URL: `postgresql://postgres.${REF_PROJET_PROD}:secret@aws-0-eu-central-2.pooler.supabase.com:6543/postgres`,
      }),
    ).toThrowError(MESSAGE_TEST_DATABASE_URL_PROD);
  });

  it("URL factice unitaire : syntaxiquement valide (new URL passe), jamais la prod", () => {
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
