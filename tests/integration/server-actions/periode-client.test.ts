/**
 * G3a — server actions client : compléter & valider la période (authentifiées, DB réelle).
 *
 * `@zarya/auth` mocké (requireClientContact). Vérifie : saisie élément (upsert + source
 * client_dashboard + traçage dernier acteur), validation 1-clic (statut validee + salaire.validation
 * + événement), garde période non éditable, anti-fuite (autre client). Réf : salaire.md §7.4 ; KICKOFF G3.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEmploye,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
  client_id: null as null | string,
}));
vi.mock("@zarya/auth", () => ({
  requireClientContact: async () => {
    if (!authState.user || !authState.client_id) throw new Error("ForbiddenError");
    return { user: authState.user, client_id: authState.client_id };
  },
}));

const { saisirElementPaieAction, validerPeriodeClientAction } = await import(
  "../../../apps/web/app/(app)/espace/validations/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let employeA: { id: string };
let periodeId: string;
let typeId: string;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  employeA = await seedEmploye(sql, cabinetA.id, clientA.id);
  // seedEmploye crée l'employé en statut 'propose' (défaut DB) → absent de la matrice
  // (getPeriodeDetailClient filtre statut='actif'). On l'active pour que la période ne soit
  // pas une matrice vide, sinon le garde-fou de validation la refuse (à juste titre).
  await sql`UPDATE salaire.employe SET statut = 'actif' WHERE id = ${employeA.id}`;
  const p = await seedPeriode(sql, cabinetA.id, clientA.id);
  periodeId = p.id;
  const [t] =
    await sql`SELECT id FROM salaire.type_element_paie WHERE cabinet_id IS NULL AND code = 'HEURES_NORMALES'`;
  typeId = t?.id as string;
});

afterEach(() => {
  authState.user = null;
  authState.client_id = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function actorClient(cabinet_id: string, client_id: string) {
  authState.user = {
    id: randomUUID(),
    app_metadata: { cabinet_id, role: "client_contact", client_id },
  };
  authState.client_id = client_id;
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("saisirElementPaieAction (G3a)", () => {
  test("upsert élément + source client_dashboard + traçage dernier acteur", async () => {
    actorClient(cabinetA.id, clientA.id);
    const res = await saisirElementPaieAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "168",
      }),
    );
    expect(res.success).toBe(true);

    const [el] = await sql`
      SELECT valeur_numerique, source FROM salaire.element_paie
      WHERE periode_id = ${periodeId} AND employe_id = ${employeA.id} AND type_element_id = ${typeId}`;
    expect(el?.source).toBe("client_dashboard");
    expect(Number(el?.valeur_numerique)).toBe(168);

    // 2e saisie = upsert (pas de doublon, valeur mise à jour).
    await saisirElementPaieAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "180",
      }),
    );
    const rows = await sql`
      SELECT valeur_numerique FROM salaire.element_paie
      WHERE periode_id = ${periodeId} AND employe_id = ${employeA.id} AND type_element_id = ${typeId}`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.valeur_numerique)).toBe(180);

    const [p] = await sql`
      SELECT derniere_modification_par FROM salaire.periode WHERE id = ${periodeId}`;
    expect(p?.derniere_modification_par).toBe("client");
  });

  test("anti-fuite : la période d'un autre client est introuvable", async () => {
    const clientB = await seedClient(sql, cabinetB.id);
    actorClient(cabinetB.id, clientB.id);
    const res = await saisirElementPaieAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "10",
      }),
    );
    expect(res.error).toMatch(/introuvable/i);
  });
});

describe("validerPeriodeClientAction (G3a)", () => {
  test("valide la période → statut validee + salaire.validation + refus si déjà validée", async () => {
    const pId = randomUUID();
    await sql`
      INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation)
      VALUES (${pId}, ${cabinetA.id}, ${clientA.id}, 2026, 7, '2026-07-25')`;
    actorClient(cabinetA.id, clientA.id);

    const res = await validerPeriodeClientAction(
      {},
      fd({ periode_id: pId, sans_changement: "true" }),
    );
    expect(res.success).toBe(true);

    const [per] =
      await sql`SELECT statut, sans_changement_declare FROM salaire.periode WHERE id = ${pId}`;
    expect(per?.statut).toBe("validee");
    expect(per?.sans_changement_declare).toBe(true);
    const [val] =
      await sql`SELECT valide_par_type, methode FROM salaire.validation WHERE periode_id = ${pId}`;
    expect(val?.valide_par_type).toBe("client");
    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${pId} AND type = 'validation_recue_client'`;
    expect(ev).toHaveLength(1);

    // 2e validation refusée (période plus éditable).
    const res2 = await validerPeriodeClientAction({}, fd({ periode_id: pId }));
    expect(res2.error).toMatch(/validée|clôturée/i);
  });
});
