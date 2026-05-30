/**
 * Tests du moteur de transitions de statut — module Calendar, Run 3
 *
 * Couvre la fonction système calendar.fn_transition_statuts_echeances() :
 * progression du statut des crm.echeance selon les dates (ADR 0011 §1,
 * calendar.md §4). Transitions UNIQUEMENT — la génération automatique est
 * différée (dépend d'attributs client absents, extension CRM hors Phase 4.0).
 *
 * Règles testées :
 *  - a_venir → imminente   : date_alerte atteinte, échéance non dépassée ;
 *  - a_venir|imminente → en_retard : date_echeance dépassée (même sans alerte) ;
 *  - états terminaux (traitee, reportee, annulee) jamais touchés ;
 *  - idempotence (2e passage ne re-déplace rien) ;
 *  - fonction cross-cabinet (job système global) ;
 *  - hors surface tenant : authenticated ne peut PAS l'exécuter (REVOKE PUBLIC).
 *
 * Note d'isolation inter-suites : les autres suites seedent des échéances à
 * now+14j, statut a_venir, sans date_alerte → la fonction globale les laisse
 * intactes. Chaque test ici n'asserte que ses propres lignes (par id).
 *
 * Références :
 * - packages/db/migrations/0007_calendar_transition_statuts.sql
 * - docs/architecture/decisions/0011-calendar-mvp-scope.md (§1)
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEcheanceForTransition,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Moteur de transitions de statut — module Calendar (Run 3)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  /** Exécute le job de maintenance (service role). */
  async function runTransitions(): Promise<void> {
    await sql`SELECT * FROM calendar.fn_transition_statuts_echeances()`;
  }

  /** Statut courant d'une échéance par id. */
  async function statutOf(id: string): Promise<string | undefined> {
    const [r] = await sql`SELECT statut FROM crm.echeance WHERE id = ${id}`;
    return r?.statut as string | undefined;
  }

  test("a_venir → imminente quand la date d'alerte est atteinte (échéance future)", async () => {
    const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: 10,
      dateAlerteOffsetDays: -1,
      statut: "a_venir",
    });
    await runTransitions();
    expect(await statutOf(e.id)).toBe("imminente");
  });

  test("a_venir sans date_alerte reste a_venir tant que l'échéance n'est pas dépassée", async () => {
    const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: 10,
      dateAlerteOffsetDays: null,
      statut: "a_venir",
    });
    await runTransitions();
    expect(await statutOf(e.id)).toBe("a_venir");
  });

  test("a_venir → en_retard quand l'échéance est dépassée (même sans date_alerte)", async () => {
    const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: -1,
      dateAlerteOffsetDays: null,
      statut: "a_venir",
    });
    await runTransitions();
    expect(await statutOf(e.id)).toBe("en_retard");
  });

  test("imminente → en_retard quand l'échéance est dépassée", async () => {
    const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: -1,
      dateAlerteOffsetDays: -5,
      statut: "imminente",
    });
    await runTransitions();
    expect(await statutOf(e.id)).toBe("en_retard");
  });

  test("échéance due aujourd'hui avec alerte atteinte → imminente (pas en_retard)", async () => {
    const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: 0,
      dateAlerteOffsetDays: -2,
      statut: "a_venir",
    });
    await runTransitions();
    expect(await statutOf(e.id)).toBe("imminente");
  });

  test("les états terminaux/manuels ne sont jamais touchés, même échéance dépassée", async () => {
    for (const statut of ["traitee", "reportee", "annulee"] as const) {
      const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
        dateEcheanceOffsetDays: -5,
        dateAlerteOffsetDays: -10,
        statut,
      });
      await runTransitions();
      expect(await statutOf(e.id), `${statut} ne doit pas changer`).toBe(statut);
    }
  });

  test("idempotence : un 2e passage ne re-déplace pas une échéance déjà transitionnée", async () => {
    const e = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: 10,
      dateAlerteOffsetDays: -1,
      statut: "a_venir",
    });
    await runTransitions();
    expect(await statutOf(e.id)).toBe("imminente");
    await runTransitions();
    expect(await statutOf(e.id)).toBe("imminente");
  });

  test("fonction système cross-cabinet : transitionne les échéances des 2 cabinets", async () => {
    const eA = await seedEcheanceForTransition(sql, cabinetA.id, clientA.id, {
      dateEcheanceOffsetDays: -1,
      dateAlerteOffsetDays: null,
      statut: "a_venir",
    });
    const eB = await seedEcheanceForTransition(sql, cabinetB.id, clientB.id, {
      dateEcheanceOffsetDays: -1,
      dateAlerteOffsetDays: null,
      statut: "a_venir",
    });
    await runTransitions();
    expect(await statutOf(eA.id)).toBe("en_retard");
    expect(await statutOf(eB.id)).toBe("en_retard");
  });

  test("hors surface tenant : authenticated ne peut PAS exécuter la fonction", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) => tsql`SELECT * FROM calendar.fn_transition_statuts_echeances()`,
      ),
    ).rejects.toThrow();
  });
});
