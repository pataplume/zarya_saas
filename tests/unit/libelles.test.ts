/**
 * C4.1 — Libellés anti-jargon : chaque helper traduit un slug connu et retombe sur le
 * slug brut (sans jamais lever) pour un slug inconnu. Garantit qu'aucun slug ne casse
 * l'affichage côté fiduciaire `/app`.
 */
import { describe, expect, it } from "vitest";
import {
  ANOMALIE_LABEL,
  badgeRisque,
  badgeStatutClient,
  badgeStatutEcheance,
  badgeStatutFacture,
  badgeStatutUpload,
  type FamilleBadge,
  libelleAnomalie,
  libelleCategorieDocument,
  libelleLogicielComptable,
  libelleLogicielPaie,
  libelleModeTransmission,
  libelleRisque,
  libelleService,
  libelleSourceIngestion,
  libelleStatutClassement,
  libelleStatutClient,
  libelleStatutDemandeRgpd,
  libelleStatutEcheance,
  libelleStatutEmail,
  libelleStatutEmploye,
  libelleStatutFacture,
  libelleStatutPeriode,
  libelleStatutProposition,
  libelleStatutUpload,
  libelleTypeClient,
  libelleTypeDocument,
  libelleTypeEcheance,
  STYLE_FAMILLE,
  styleFamille,
} from "../../apps/web/lib/libelles";

const SLUG_INCONNU = "slug_qui_nexiste_pas";

// (helper, slug connu, libellé attendu)
const CAS_LIBELLE: [(s: string) => string, string, string][] = [
  [libelleStatutUpload, "a_valider", "À valider"],
  [libelleStatutUpload, "releve_bancaire" /* slug d'un autre enum */, "releve_bancaire"],
  [libelleStatutClassement, "valide_humain", "Validé"],
  [libelleStatutEmail, "traite", "Traité"],
  [libelleCategorieDocument, "bancaire", "Bancaire"],
  [libelleTypeDocument, "facture_standard", "Facture"],
  [libelleTypeDocument, "releve_bancaire", "Relevé bancaire"],
  [libelleSourceIngestion, "email_microsoft", "Email"],
  [libelleStatutEcheance, "en_retard", "En retard"],
  [libelleTypeEcheance, "tva", "TVA"],
  [libelleStatutFacture, "en_attente_validation", "À valider"],
  [libelleStatutProposition, "rejetee", "Rejetée"],
  [libelleAnomalie, "iban_invalide", "IBAN invalide"],
  [libelleStatutPeriode, "validee", "Validée client"],
  [libelleStatutEmploye, "sorti", "Sorti"],
  [libelleStatutClient, "actif", "Actif"],
  [libelleTypeClient, "pme", "PME"],
  [libelleService, "comptabilite", "Comptabilité"],
  [libelleRisque, "critique", "Critique"],
  [libelleLogicielComptable, "cresus", "Crésus"],
  [libelleLogicielPaie, "bexio_payroll", "Bexio Payroll"],
  [libelleModeTransmission, "nas_partage", "Partage NAS"],
  [libelleStatutDemandeRgpd, "en_cours", "En cours"],
];

describe("libellés — slug connu → libellé FR", () => {
  for (const [fn, slug, attendu] of CAS_LIBELLE) {
    it(`${fn.name}("${slug}") = "${attendu}"`, () => {
      expect(fn(slug)).toBe(attendu);
    });
  }
});

describe("libellés — slug inconnu → fallback = slug (jamais d'exception)", () => {
  const helpers: ((s: string) => string)[] = [
    libelleStatutUpload,
    libelleStatutClassement,
    libelleStatutEmail,
    libelleCategorieDocument,
    libelleTypeDocument,
    libelleSourceIngestion,
    libelleStatutEcheance,
    libelleTypeEcheance,
    libelleStatutFacture,
    libelleStatutProposition,
    libelleAnomalie,
    libelleStatutPeriode,
    libelleStatutEmploye,
    libelleStatutClient,
    libelleTypeClient,
    libelleService,
    libelleRisque,
    libelleLogicielComptable,
    libelleLogicielPaie,
    libelleModeTransmission,
    libelleStatutDemandeRgpd,
  ];
  for (const fn of helpers) {
    it(`${fn.name}("${SLUG_INCONNU}") = "${SLUG_INCONNU}"`, () => {
      expect(() => fn(SLUG_INCONNU)).not.toThrow();
      expect(fn(SLUG_INCONNU)).toBe(SLUG_INCONNU);
    });
  }
});

describe("badges — { label, famille } valides + fallback neutre", () => {
  const FAMILLES = new Set<FamilleBadge>(Object.keys(STYLE_FAMILLE) as FamilleBadge[]);

  it("slug connu → label traduit + famille connue", () => {
    const b = badgeStatutEcheance("en_retard");
    expect(b.label).toBe("En retard");
    expect(FAMILLES.has(b.famille)).toBe(true);
  });

  it("slug inconnu → label = slug, famille neutre, sans throw", () => {
    for (const fn of [
      badgeStatutUpload,
      badgeStatutEcheance,
      badgeStatutFacture,
      badgeStatutClient,
    ]) {
      const b = fn(SLUG_INCONNU);
      expect(b.label).toBe(SLUG_INCONNU);
      expect(b.famille).toBe("neutre");
    }
  });

  it("badgeRisque expose un symbole (pas de couleur seule), fallback « • »", () => {
    expect(badgeRisque("faible").symbole).toBe("●");
    expect(badgeRisque(SLUG_INCONNU)).toEqual({
      label: SLUG_INCONNU,
      famille: "neutre",
      symbole: "•",
    });
  });

  it("styleFamille renvoie des classes Tailwind pour chaque famille", () => {
    for (const famille of FAMILLES) {
      expect(styleFamille(famille)).toBe(STYLE_FAMILLE[famille]);
      expect(styleFamille(famille).length).toBeGreaterThan(0);
    }
  });
});

describe("ANOMALIE_LABEL reste exporté (compat factures-client)", () => {
  it("contient les clés historiques", () => {
    expect(ANOMALIE_LABEL.iban_invalide).toBe("IBAN invalide");
    expect(ANOMALIE_LABEL.incoherence_qr_ia_iban).toContain("fraude possible");
  });
});
