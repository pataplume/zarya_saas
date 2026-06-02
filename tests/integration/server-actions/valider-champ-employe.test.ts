/**
 * F6c — server actions validation champ employé + finalisation (authentifiées, DB réelle).
 *
 * `@zarya/auth` mocké ; db service role réel. Vérifie : valider/modifier (champ sensible AVS
 * re-chiffré au Vault, masqué + checksum), RBAC, finalisation nominale + anti-fuite cabinet.
 * Réf : onboarding-client.md §7.6-7.8 ; ADR 0007/0013/0021 ; KICKOFF F6c.
 */
import { randomUUID } from "node:crypto";
import { vaultGetSecret } from "@zarya/db";
import { extraireEmployesDepuisFichier, type LigneEmploye } from "@zarya/extraction";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedSessionOnboarding,
  seedTwoCabinets,
  seedUploadFichier,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { validerChampEmployeAction, finaliserPropositionEmployeAction } = await import(
  "../../../apps/web/app/(app)/app/clients/employes/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let sessionA: { id: string };
let uploadA: { id: string };

const ligne: LigneEmploye = {
  prenom: { valeur: "Jean", source_cellule: "A2" },
  nom: { valeur: "Dupont", source_cellule: "B2" },
  date_naissance: { valeur: "1985-03-12", source_cellule: "C2" },
  numero_avs: { valeur: "756.1234.5678.97", source_cellule: "D2" },
  date_entree: { valeur: "2022-01-03", source_cellule: "F2" },
};

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  sessionA = await seedSessionOnboarding(sql, cabinetA.id, clientA.id);
  uploadA = await seedUploadFichier(sql, cabinetA.id, clientA.id, sessionA.id);
});

afterEach(() => {
  authState.user = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function acteur(cabinet_id: string, role = "gestionnaire_salaires") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

async function seedProposition() {
  const { proposition_ids } = await extraireEmployesDepuisFichier({
    cabinet_id: cabinetA.id,
    client_id: clientA.id,
    session_id: sessionA.id,
    upload_fichier_id: uploadA.id,
    nom_fichier: "e.csv",
    lignes: [ligne],
  });
  return proposition_ids[0] as string;
}

async function champId(propId: string, nom: string): Promise<string> {
  const [c] = await sql`
    SELECT id FROM salaire.proposition_champ
    WHERE proposition_employe_id = ${propId} AND nom_champ = ${nom}`;
  return c?.id as string;
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("validerChampEmployeAction (F6c)", () => {
  test("valide un champ non sensible (valeur_finale = valeur extraite)", async () => {
    acteur(cabinetA.id);
    const propId = await seedProposition();
    const id = await champId(propId, "prenom");
    const res = await validerChampEmployeAction(
      {},
      fd({ proposition_champ_id: id, action: "valider" }),
    );
    expect(res.success).toBe(true);
    const [c] =
      await sql`SELECT statut, valeur_finale FROM salaire.proposition_champ WHERE id = ${id}`;
    expect(c?.statut).toBe("valide");
    expect(c?.valeur_finale).toBe("Jean");
  });

  test("modifie un AVS sensible : re-chiffré au Vault, masqué, checksum exigé", async () => {
    acteur(cabinetA.id);
    const propId = await seedProposition();
    const id = await champId(propId, "numero_avs");

    // checksum invalide → refus
    const ko = await validerChampEmployeAction(
      {},
      fd({ proposition_champ_id: id, action: "modifier", nouvelle_valeur: "756.1234.5678.90" }),
    );
    expect(ko.error).toMatch(/AVS invalide/i);

    // valeur valide → masquée + vault_id récupérable = nouvelle valeur
    const ok = await validerChampEmployeAction(
      {},
      fd({ proposition_champ_id: id, action: "modifier", nouvelle_valeur: "756.0000.0000.02" }),
    );
    expect(ok.success).toBe(true);
    const [c] = await sql`
      SELECT statut, valeur_finale, valeur_proposee_normalisee->>'vault_id' AS vault_id
      FROM salaire.proposition_champ WHERE id = ${id}`;
    expect(c?.statut).toBe("modifie");
    expect(c?.valeur_finale).toBe("756.****.****.**");
    expect(await vaultGetSecret(c?.vault_id as string)).toBe("756.0000.0000.02");
  });

  test("RBAC : un lecteur ne peut pas valider", async () => {
    acteur(cabinetA.id, "lecteur");
    const propId = await seedProposition();
    const id = await champId(propId, "prenom");
    const res = await validerChampEmployeAction(
      {},
      fd({ proposition_champ_id: id, action: "valider" }),
    );
    expect(res.error).toMatch(/droits/i);
  });

  test("anti-fuite : un autre cabinet ne voit pas le champ", async () => {
    acteur(cabinetB.id);
    const propId = await seedProposition();
    const id = await champId(propId, "prenom");
    const res = await validerChampEmployeAction(
      {},
      fd({ proposition_champ_id: id, action: "valider" }),
    );
    expect(res.error).toMatch(/introuvable/i);
  });
});

describe("finaliserPropositionEmployeAction (F6c)", () => {
  test("finalise une proposition entièrement validée → employe_id", async () => {
    acteur(cabinetA.id);
    const propId = await seedProposition();
    await sql`
      UPDATE salaire.proposition_champ
      SET statut = 'valide', valeur_finale = COALESCE(valeur_finale, valeur_proposee)
      WHERE proposition_employe_id = ${propId} AND statut = 'propose'`;
    const res = await finaliserPropositionEmployeAction({}, fd({ proposition_employe_id: propId }));
    expect(res.success).toBe(true);
    expect(res.employe_id).toBeTruthy();
  });

  test("RBAC : un lecteur ne peut pas finaliser", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await finaliserPropositionEmployeAction(
      {},
      fd({ proposition_employe_id: randomUUID() }),
    );
    expect(res.error).toMatch(/droits/i);
  });
});
