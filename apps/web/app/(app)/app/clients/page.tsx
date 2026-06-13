import { getCurrentUser } from "@zarya/auth";
import { client, db, sql } from "@zarya/db";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClientsClient } from "./clients-client";

const ROLES_ECRITURE = ["responsable", "gestionnaire_salaires", "collaborateur"];

// Une ligne enrichie = agrégats de la vue crm.v_client_dashboard + les champs
// éditables (ide, email_contact, statut, archived_at) que la vue n'expose pas et
// dont le formulaire d'édition inline a besoin. On joint par id côté serveur.
export type ClientRow = {
  id: string;
  raison_sociale: string;
  type: string | null;
  statut: string;
  risque_score: number | null;
  risque_niveau: string | null;
  prochaine_echeance: string | null;
  nb_documents_manquants: number;
  derniere_activite: string | null;
  // Champs éditables (table crm.client, hors vue).
  ide: string | null;
  email_contact: string | null;
  archived_at: string | null;
};

export default async function ClientsPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutEcrire = ROLES_ECRITURE.includes(role);
  const isResponsable = role === "responsable";

  // Agrégats : vue dénormalisée scopée cabinet_id (clients actifs/visibles).
  // Tri par défaut : risque décroissant (NULLS LAST) puis raison sociale.
  const vueRows = (await db.execute(sql`
    SELECT id, raison_sociale, type, statut, risque_score, risque_niveau,
           prochaine_echeance, nb_documents_manquants, derniere_activite
    FROM crm.v_client_dashboard
    WHERE cabinet_id = ${cabinet_id}
    ORDER BY risque_score DESC NULLS LAST, raison_sociale ASC
  `)) as unknown as Array<Record<string, unknown>>;

  // Champs éditables (hors vue) — tous les clients du cabinet, y compris archivés.
  const editables = await db
    .select({
      id: client.id,
      raison_sociale: client.raison_sociale,
      type: client.type,
      statut: client.statut,
      ide: client.ide,
      email_contact: client.email_contact,
      archived_at: client.archived_at,
    })
    .from(client)
    .where(eq(client.cabinet_id, cabinet_id))
    .orderBy(desc(client.archived_at));

  const editablesById = new Map(editables.map((e) => [e.id, e]));

  // Lignes actives : issues de la vue, enrichies des champs éditables.
  const idsDansVue = new Set<string>();
  const clients: ClientRow[] = vueRows
    .filter((r) => r.id != null)
    .map((r) => {
      const id = r.id as string;
      idsDansVue.add(id);
      const e = editablesById.get(id);
      return {
        id,
        raison_sociale: (r.raison_sociale as string | null) ?? e?.raison_sociale ?? "",
        type: (r.type as string | null) ?? e?.type ?? null,
        statut: (r.statut as string | null) ?? e?.statut ?? "actif",
        risque_score: r.risque_score != null ? Number(r.risque_score) : null,
        risque_niveau: (r.risque_niveau as string | null) ?? null,
        prochaine_echeance: r.prochaine_echeance != null ? String(r.prochaine_echeance) : null,
        nb_documents_manquants:
          r.nb_documents_manquants != null ? Number(r.nb_documents_manquants) : 0,
        derniere_activite: r.derniere_activite != null ? String(r.derniere_activite) : null,
        ide: e?.ide ?? null,
        email_contact: e?.email_contact ?? null,
        archived_at: e?.archived_at != null ? String(e.archived_at) : null,
      };
    });

  // Clients archivés (ou absents de la vue) — depuis la table, pour conserver la
  // section « Archivés » de l'écran actuel sans dépendre de la vue.
  const archives: ClientRow[] = editables
    .filter((e) => e.archived_at != null || !idsDansVue.has(e.id))
    .map((e) => ({
      id: e.id,
      raison_sociale: e.raison_sociale,
      type: e.type ?? null,
      statut: e.statut,
      risque_score: null,
      risque_niveau: null,
      prochaine_echeance: null,
      nb_documents_manquants: 0,
      derniere_activite: null,
      ide: e.ide ?? null,
      email_contact: e.email_contact ?? null,
      archived_at: e.archived_at != null ? String(e.archived_at) : null,
    }));

  return (
    <ClientsClient
      clients={clients}
      archives={archives}
      peutEcrire={peutEcrire}
      isResponsable={isResponsable}
    />
  );
}
