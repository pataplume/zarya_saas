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

import {
  accesClient,
  client,
  contact,
  db,
  document,
  echeance,
  facture,
  fournisseur,
  paramComptable,
  propositionFacture,
  salaireConfig,
  service,
  sql,
} from "@zarya/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

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

// ─── C1.3 — Documents ──────────────────────────────────────────────────────────

export interface DossierDocument {
  id: string;
  type: string;
  categorie: string;
  periode: string | null;
  libelle: string;
  statut_classement: string;
  date_reception: string;
  fichier_physique_id: string;
}

// ─── C1.4 — Factures ───────────────────────────────────────────────────────────

export interface DossierFacture {
  id: string;
  fournisseur_nom: string;
  numero_facture: string;
  date_emission: string;
  total_ttc: string;
  devise: string;
  statut: string;
}

export interface DossierPropositionFacture {
  id: string;
  fournisseur_nom: string | null;
  numero_facture: string | null;
  date_emission: string | null;
  total_ttc: string | null;
  devise: string;
  statut: string;
}

export interface DossierFactures {
  validees: DossierFacture[];
  a_valider: DossierPropositionFacture[];
}

// ─── C1.5 — Salaires ───────────────────────────────────────────────────────────

export interface DossierPeriodeSalaire {
  id: string;
  annee: number;
  mois: number;
  statut: string;
  nb_employes: number;
}

// ─── C1.5 — Coordonnées & paramètres ─────────────────────────────────────────────

export interface DossierContact {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  fonction: string | null;
  est_principal: boolean;
  a_acces_portail: boolean;
}

export interface DossierParamComptable {
  logiciel_comptable: string | null;
  logiciel_paie_cible: string | null;
  mode_transmission: string | null;
}

export interface DossierCoordonnees {
  contacts: DossierContact[];
  services_actifs: DossierClientService[];
  param_comptable: DossierParamComptable | null;
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

// ─── C1.3 — Documents du client (scopé cabinet_id + client_id) ──────────────────

/**
 * Documents validés (doc.document) du client, non archivés, scopés
 * STRICTEMENT (cabinet_id, client_id). Triés par période puis date de réception
 * décroissantes — le regroupement par période/type est fait côté UI.
 */
export async function getDossierDocuments(
  cabinet_id: string,
  client_id: string,
): Promise<DossierDocument[]> {
  const rows = await db
    .select({
      id: document.id,
      type: document.type,
      categorie: document.categorie,
      periode: document.periode,
      libelle: document.libelle,
      statut_classement: document.statut_classement,
      date_reception: document.date_reception,
      fichier_physique_id: document.fichier_physique_id,
    })
    .from(document)
    .where(
      and(
        eq(document.cabinet_id, cabinet_id),
        eq(document.client_id, client_id),
        isNull(document.archived_at),
      ),
    )
    .orderBy(desc(document.periode), desc(document.date_reception));

  return rows.map((d) => ({
    id: d.id,
    type: d.type,
    categorie: d.categorie,
    periode: d.periode ?? null,
    libelle: d.libelle,
    statut_classement: d.statut_classement,
    date_reception: String(d.date_reception),
    fichier_physique_id: d.fichier_physique_id,
  }));
}

// ─── C1.4 — Factures du client (scopé cabinet_id + client_id) ───────────────────

/**
 * Factures validées/exportées (facture.facture, non archivées) + propositions en
 * attente (facture.proposition_facture statut 'a_valider'), scopées STRICTEMENT
 * (cabinet_id, client_id). Le nom du fournisseur vient de facture.fournisseur
 * (LEFT JOIN). AUCUN IBAN n'est projeté (stocké au Vault — *_vault_id ignoré).
 */
export async function getDossierFactures(
  cabinet_id: string,
  client_id: string,
): Promise<DossierFactures> {
  const [valideesRows, aValiderRows] = await Promise.all([
    db
      .select({
        id: facture.id,
        fournisseur_nom: fournisseur.raison_sociale,
        numero_facture: facture.numero_facture,
        date_emission: facture.date_emission,
        total_ttc: facture.total_ttc,
        devise: facture.devise,
        statut: facture.statut,
      })
      .from(facture)
      .innerJoin(fournisseur, eq(fournisseur.id, facture.fournisseur_id))
      .where(
        and(
          eq(facture.cabinet_id, cabinet_id),
          eq(facture.client_id, client_id),
          isNull(facture.archived_at),
        ),
      )
      .orderBy(desc(facture.date_emission)),
    db
      .select({
        id: propositionFacture.id,
        fournisseur_nom: fournisseur.raison_sociale,
        fournisseur_propose_data: propositionFacture.fournisseur_propose_data,
        numero_facture: propositionFacture.numero_facture_propose,
        date_emission: propositionFacture.date_emission_proposee,
        total_ttc: propositionFacture.total_ttc_propose,
        devise: propositionFacture.devise_proposee,
        statut: propositionFacture.statut,
      })
      .from(propositionFacture)
      .leftJoin(fournisseur, eq(fournisseur.id, propositionFacture.fournisseur_existant_id))
      .where(
        and(
          eq(propositionFacture.cabinet_id, cabinet_id),
          eq(propositionFacture.client_id, client_id),
          eq(propositionFacture.statut, "a_valider"),
        ),
      )
      .orderBy(desc(propositionFacture.created_at)),
  ]);

  return {
    validees: valideesRows.map((f) => ({
      id: f.id,
      fournisseur_nom: f.fournisseur_nom,
      numero_facture: f.numero_facture,
      date_emission: String(f.date_emission),
      total_ttc: f.total_ttc ?? "0",
      devise: f.devise,
      statut: f.statut,
    })),
    a_valider: aValiderRows.map((p) => {
      // Le fournisseur peut n'être que proposé (pas encore créé en référentiel) :
      // on retombe sur la raison sociale extraite si présente.
      const proposeNom =
        p.fournisseur_propose_data &&
        typeof p.fournisseur_propose_data === "object" &&
        "raison_sociale" in p.fournisseur_propose_data
          ? ((p.fournisseur_propose_data as { raison_sociale?: unknown }).raison_sociale ?? null)
          : null;
      return {
        id: p.id,
        fournisseur_nom: p.fournisseur_nom ?? (typeof proposeNom === "string" ? proposeNom : null),
        numero_facture: p.numero_facture ?? null,
        date_emission: p.date_emission != null ? String(p.date_emission) : null,
        total_ttc: p.total_ttc ?? null,
        devise: p.devise,
        statut: p.statut,
      };
    }),
  };
}

// ─── C1.5 — Salaires du client (scopé cabinet_id + client_id) ───────────────────

/**
 * Périodes salaire du client via la vue salaire.v_periode_fiduciaire (qui porte
 * nb_employes_concernes), scopées STRICTEMENT (cabinet_id, client_id), triées
 * année/mois décroissantes. Aucun champ ultra-sensible (AVS/IBAN) projeté.
 */
export async function getDossierSalaires(
  cabinet_id: string,
  client_id: string,
): Promise<DossierPeriodeSalaire[]> {
  const rows = (await db.execute(sql`
    SELECT id, annee, mois, statut::text AS statut, nb_employes_concernes
    FROM salaire.v_periode_fiduciaire
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    ORDER BY annee DESC, mois DESC
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as string,
    annee: Number(r.annee),
    mois: Number(r.mois),
    statut: r.statut as string,
    nb_employes: r.nb_employes_concernes != null ? Number(r.nb_employes_concernes) : 0,
  }));
}

// ─── C1.5 — Coordonnées, services & paramètres (scopé cabinet_id + client_id) ────

/**
 * Contacts (crm.contact non archivés), services actifs et paramètres comptables
 * (crm.param_comptable + logiciel de paie de crm.salaire_config), scopés
 * STRICTEMENT (cabinet_id, client_id). Indique si un contact a un accès portail
 * (salaire.acces_client actif lié au contact). AUCUN champ ultra-sensible projeté
 * (acces_logiciel_externe, iban_facturation, caisses ignorés).
 */
export async function getDossierCoordonnees(
  cabinet_id: string,
  client_id: string,
): Promise<DossierCoordonnees> {
  const [contactsRows, servicesRows, paramRows, paieRows, accesRows] = await Promise.all([
    db
      .select({
        id: contact.id,
        prenom: contact.prenom,
        nom: contact.nom,
        email: contact.email,
        telephone: contact.telephone,
        fonction: contact.role,
        est_principal: contact.est_principal,
      })
      .from(contact)
      .where(
        and(
          eq(contact.cabinet_id, cabinet_id),
          eq(contact.client_id, client_id),
          isNull(contact.archived_at),
        ),
      )
      .orderBy(desc(contact.est_principal), asc(contact.nom)),
    db
      .select({ id: service.id, type: service.type, frequence: service.frequence })
      .from(service)
      .where(
        and(
          eq(service.cabinet_id, cabinet_id),
          eq(service.client_id, client_id),
          eq(service.actif, true),
        ),
      ),
    db
      .select({
        logiciel_comptable: paramComptable.logiciel,
        mode_transmission: paramComptable.mode_transmission,
      })
      .from(paramComptable)
      .where(
        and(eq(paramComptable.cabinet_id, cabinet_id), eq(paramComptable.client_id, client_id)),
      )
      .limit(1),
    db
      .select({ logiciel_paie: salaireConfig.logiciel_paie })
      .from(salaireConfig)
      .where(and(eq(salaireConfig.cabinet_id, cabinet_id), eq(salaireConfig.client_id, client_id)))
      .limit(1),
    // Comptes portail actifs du client → set des contact_id ayant un accès.
    db
      .select({ contact_id: accesClient.contact_id })
      .from(accesClient)
      .where(
        and(
          eq(accesClient.cabinet_id, cabinet_id),
          eq(accesClient.client_id, client_id),
          eq(accesClient.actif, true),
        ),
      ),
  ]);

  const contactsAvecAcces = new Set(accesRows.map((a) => a.contact_id));

  const param = paramRows[0];
  const logicielPaie = paieRows[0]?.logiciel_paie ?? null;
  const param_comptable: DossierParamComptable | null =
    param || logicielPaie
      ? {
          logiciel_comptable: param?.logiciel_comptable ?? null,
          logiciel_paie_cible: logicielPaie,
          mode_transmission: param?.mode_transmission ?? null,
        }
      : null;

  return {
    contacts: contactsRows.map((c) => ({
      id: c.id,
      prenom: c.prenom ?? null,
      nom: c.nom,
      email: c.email ?? null,
      telephone: c.telephone ?? null,
      fonction: c.fonction ?? null,
      est_principal: c.est_principal,
      a_acces_portail: contactsAvecAcces.has(c.id),
    })),
    services_actifs: servicesRows
      .filter((s) => s.id != null)
      .map((s) => ({
        id: s.id,
        type: s.type,
        frequence: s.frequence ?? null,
      })),
    param_comptable,
  };
}
