// C1.2 — Données du dossier client (page unique /app/clients/[id]).
// Helper de lecture testable, scopé STRICTEMENT par (cabinet_id, client_id).
//
// Sécurité (CRITIQUE) : le `db` applicatif se connecte en service role et BYPASSE
// la RLS (ADR 0005 addendum). La frontière de sécurité réelle sur le chemin app
// repose donc ENTIÈREMENT sur le filtre `cabinet_id` (+ `client_id`) discipliné
// dans CHAQUE requête — jamais une valeur issue d'URL/body sans contrôle. Si la
// requête d'identité (crm.client scopé cabinet) ne renvoie rien, on retourne null :
// la page rend alors un 404 indistinct, sans fuite d'existence cross-tenant.
//
// Aucune colonne ultra-sensible (IBAN/AVS/tokens) n'est projetée ici.

import { client, db, echeance, service, sql } from "@zarya/db";
import { and, eq } from "drizzle-orm";

// ─── Types exposés ────────────────────────────────────────────────────────────

export interface DossierClientIdentite {
  id: string;
  raison_sociale: string;
  ide: string | null;
  type: string;
  statut: string;
  forme_juridique: string | null;
  langue: string;
  responsable_id: string | null;
  responsable_nom: string | null;
}

export interface DossierClientAgregats {
  risque_score: number | null;
  risque_niveau: string | null;
  prochaine_echeance: string | null;
  nb_documents_manquants: number;
  derniere_activite: string | null;
}

export interface DossierClientService {
  id: string;
  type: string;
  frequence: string | null;
}

export interface DossierClientEcheance {
  id: string;
  type: string;
  libelle: string;
  date_echeance: string;
  statut: string;
  en_retard: boolean;
}

export interface DossierClientPeriodeSalaire {
  id: string;
  annee: number;
  mois: number;
  statut: string;
}

export interface DossierClient {
  identite: DossierClientIdentite;
  agregats: DossierClientAgregats;
  services_actifs: DossierClientService[];
  nb_factures_a_valider: number;
  periode_salaire_courante: DossierClientPeriodeSalaire | null;
  echeances: DossierClientEcheance[];
}

// Statuts d'échéance considérés « ouverts » (à traiter) — exclut traitée/annulée.
const STATUTS_ECHEANCE_OUVERTS = ["a_venir", "imminente", "en_retard", "reportee"] as const;

/**
 * Charge le dossier complet d'un client, scopé (cabinet_id, client_id).
 *
 * Retourne `null` si le client n'existe pas OU n'appartient pas au cabinet —
 * la page appelante doit alors rendre `notFound()` (404 indistinct).
 */
export async function getDossierClient(
  cabinet_id: string,
  client_id: string,
): Promise<DossierClient | null> {
  // 1) Identité — porte de sécurité. Scope (cabinet_id, client_id) ; null → 404.
  const identiteRows = await db
    .select({
      id: client.id,
      raison_sociale: client.raison_sociale,
      ide: client.ide,
      type: client.type,
      statut: client.statut,
      forme_juridique: client.forme_juridique,
      langue: client.langue,
      responsable_id: client.responsable_id,
    })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);

  const ident = identiteRows[0];
  if (!ident) return null;

  // Nom du gestionnaire référent (membre du cabinet), scopé cabinet_id.
  let responsable_nom: string | null = null;
  if (ident.responsable_id) {
    const membreRows = (await db.execute(sql`
      SELECT prenom, nom
      FROM crm.cabinet_membre
      WHERE id = ${ident.responsable_id} AND cabinet_id = ${cabinet_id}
      LIMIT 1
    `)) as unknown as Array<{ prenom: string | null; nom: string | null }>;
    const m = membreRows[0];
    if (m) {
      const nomComplet = [m.prenom, m.nom].filter(Boolean).join(" ").trim();
      responsable_nom = nomComplet.length > 0 ? nomComplet : null;
    }
  }

  // 2) Agrégats — vue dénormalisée crm.v_client_dashboard, scopée (cabinet, client).
  const agregatRows = (await db.execute(sql`
    SELECT risque_score, risque_niveau, prochaine_echeance,
           nb_documents_manquants, derniere_activite
    FROM crm.v_client_dashboard
    WHERE cabinet_id = ${cabinet_id} AND id = ${client_id}
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  const a = agregatRows[0];
  const agregats: DossierClientAgregats = {
    risque_score: a?.risque_score != null ? Number(a.risque_score) : null,
    risque_niveau: (a?.risque_niveau as string | null) ?? null,
    prochaine_echeance: a?.prochaine_echeance != null ? String(a.prochaine_echeance) : null,
    nb_documents_manquants:
      a?.nb_documents_manquants != null ? Number(a.nb_documents_manquants) : 0,
    derniere_activite: a?.derniere_activite != null ? String(a.derniere_activite) : null,
  };

  // 3) Services actifs du client (scopé cabinet + client, non archivés, actif=true).
  const servicesRows = await db
    .select({ id: service.id, type: service.type, frequence: service.frequence })
    .from(service)
    .where(
      and(
        eq(service.cabinet_id, cabinet_id),
        eq(service.client_id, client_id),
        eq(service.actif, true),
      ),
    );
  const services_actifs: DossierClientService[] = servicesRows
    .filter((s) => s.id != null)
    .map((s) => ({
      id: s.id as string,
      type: s.type as string,
      frequence: (s.frequence as string | null) ?? null,
    }));

  // 4) Factures à valider — count des propositions statut 'a_valider' (scopé).
  const facturesRows = (await db.execute(sql`
    SELECT count(*)::int AS n
    FROM facture.proposition_facture
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id} AND statut = 'a_valider'
  `)) as unknown as Array<{ n: number }>;
  const nb_factures_a_valider = facturesRows[0]?.n ?? 0;

  // 5) Période salaire courante — la plus récente (année/mois desc), scopée.
  const periodeRows = (await db.execute(sql`
    SELECT id, annee, mois, statut::text AS statut
    FROM salaire.periode
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    ORDER BY annee DESC, mois DESC
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  const p = periodeRows[0];
  const periode_salaire_courante: DossierClientPeriodeSalaire | null = p
    ? {
        id: p.id as string,
        annee: Number(p.annee),
        mois: Number(p.mois),
        statut: p.statut as string,
      }
    : null;

  // 6) Échéances ouvertes (à venir / en retard), scopées, triées par date.
  const echeanceRows = await db
    .select({
      id: echeance.id,
      type: echeance.type,
      libelle: echeance.libelle,
      date_echeance: echeance.date_echeance,
      statut: echeance.statut,
    })
    .from(echeance)
    .where(and(eq(echeance.cabinet_id, cabinet_id), eq(echeance.client_id, client_id)));
  const echeances: DossierClientEcheance[] = echeanceRows
    .filter((e) =>
      STATUTS_ECHEANCE_OUVERTS.includes(e.statut as (typeof STATUTS_ECHEANCE_OUVERTS)[number]),
    )
    .map((e) => ({
      id: e.id as string,
      type: e.type as string,
      libelle: e.libelle as string,
      date_echeance: String(e.date_echeance),
      statut: e.statut as string,
      en_retard: e.statut === "en_retard",
    }))
    .sort((x, y) => x.date_echeance.localeCompare(y.date_echeance));

  return {
    identite: {
      id: ident.id as string,
      raison_sociale: ident.raison_sociale as string,
      ide: (ident.ide as string | null) ?? null,
      type: ident.type as string,
      statut: ident.statut as string,
      forme_juridique: (ident.forme_juridique as string | null) ?? null,
      langue: ident.langue as string,
      responsable_id: (ident.responsable_id as string | null) ?? null,
      responsable_nom,
    },
    agregats,
    services_actifs,
    nb_factures_a_valider,
    periode_salaire_courante,
    echeances,
  };
}
