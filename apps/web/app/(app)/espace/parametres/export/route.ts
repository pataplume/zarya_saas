import { getCurrentUser } from "@zarya/auth";
import { db, sql } from "@zarya/db";
import { logger } from "@zarya/logger";
import { NextResponse } from "next/server";

// C5.2 — Portabilité RGPD/nLPD (droit à la portabilité des données, art. 28 nLPD / art. 20 RGPD).
// Le contact client (`client_contact`) exporte UNIQUEMENT ses propres données, scopées
// (cabinet_id, client_id) issus de l'app_metadata du JWT — jamais de l'URL ni du corps de requête.
// Le `db` applicatif (service role) contourne la RLS : la sécurité repose donc sur le filtre
// (cabinet_id, client_id) discipliné dans chaque requête ci-dessous (ADR 0005 addendum).
//
// ANTI-FUITE champs ultra-sensibles : les employés sont lus via la VUE
// `salaire.v_dashboard_client_employe` qui n'expose AVS/IBAN que comme booléens « renseigné »
// (jamais en clair, jamais le vault_id). Aucune autre table sensible n'est exportée en clair.
//
// Téléchargement de fichier = route handler (apps/web CLAUDE.md), pas server action.

export const runtime = "nodejs";

async function rows(query: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> {
  return (await db.execute(query)) as unknown as Array<Record<string, unknown>>;
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  const role = user?.app_metadata.role as string | undefined;
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  const client_id = user?.app_metadata.client_id as string | undefined;
  if (!user || role !== "client_contact" || !cabinet_id || !client_id) {
    return NextResponse.json({ error: "Accès réservé à l'espace client." }, { status: 403 });
  }

  try {
    // Entreprise — fiche CRM, champs publics uniquement (vue dashboard client).
    const [entreprise] = await rows(sql`
      SELECT client_id, raison_sociale, ide, forme_juridique, type, statut, created_at
      FROM crm.v_dashboard_client_entreprise
      WHERE client_id = ${client_id} AND cabinet_id = ${cabinet_id}
      LIMIT 1
    `);

    // Employés — AVS/IBAN en booléens « renseigné », JAMAIS en clair (vue filtrée).
    const employes = await rows(sql`
      SELECT prenom, nom, fonction, departement, date_entree, date_sortie, taux_activite,
             type_contrat, statut, email, telephone, avs_renseigne, iban_renseigne
      FROM salaire.v_dashboard_client_employe
      WHERE client_id = ${client_id} AND cabinet_id = ${cabinet_id}
      ORDER BY nom, prenom
    `);

    // Documents transmis — métadonnées de classement (vue filtrée, pas de contenu interne).
    const documents = await rows(sql`
      SELECT type, categorie, periode, libelle, statut_classement, created_at
      FROM doc.v_dashboard_client_document
      WHERE client_id = ${client_id} AND cabinet_id = ${cabinet_id}
      ORDER BY created_at DESC
    `);

    // Périodes salaire — état du cycle mensuel (pas de montants individuels ici).
    const periodes = await rows(sql`
      SELECT annee, mois, statut, date_limite_validation::text AS date_limite_validation,
             date_validation_recue, sans_changement_declare, created_at
      FROM salaire.periode
      WHERE client_id = ${client_id} AND cabinet_id = ${cabinet_id}
      ORDER BY annee DESC, mois DESC
    `);

    const payload = {
      meta: {
        export_genere_le: new Date().toISOString(),
        client_id,
        note: "Données vous concernant détenues par votre fiduciaire. Les numéros AVS et IBAN ne sont jamais exportés en clair (indiqués comme « renseigné » ou non).",
      },
      entreprise: entreprise ?? null,
      employes,
      documents,
      periodes_salaire: periodes,
    };

    const date = new Date().toISOString().slice(0, 10);
    logger.info(
      { cabinet_id, client_id, nb_employes: employes.length, nb_documents: documents.length },
      "[espace.export] export RGPD généré",
    );
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="mes-donnees-${date}.json"`,
      },
    });
  } catch (err) {
    logger.error(
      { cabinet_id, client_id, error: err instanceof Error ? err.message : String(err) },
      "[espace.export] échec export RGPD",
    );
    return NextResponse.json({ error: "Échec de l'export." }, { status: 500 });
  }
}
