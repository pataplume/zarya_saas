import { getCurrentUser } from "@zarya/auth";
import { db, templateEcheance } from "@zarya/db";
import { asc, eq, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { EcheancesClient, type TemplateEcheanceRow } from "./echeances-client";

// Écran /parametres/echeances — catalogue calendar.template_echeance (RUN 7,
// PLAN-USABILITE-MVP.md). Le pipeline de génération (packages/calendar/src/
// echeance/generer.ts) consomme déjà cette table via un JOIN
// (t.cabinet_id = c.cabinet_id OR t.cabinet_id IS NULL) — écran pur CRUD, rien
// à câbler côté génération. Templates globaux (cabinet_id NULL, catalogue
// fédéral seedé migration 0008) affichés en lecture seule ; seuls les
// templates propres au cabinet sont modifiables/désactivables, réservé au
// rôle responsable (RBAC cf. actions.ts, cohérent avec /parametres/conformite
// et /parametres/integrations).

export default async function EcheancesPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "collaborateur";
  const isResponsable = role === "responsable";

  const templates = await db
    .select({
      id: templateEcheance.id,
      cabinet_id: templateEcheance.cabinet_id,
      nom: templateEcheance.nom,
      type_echeance: templateEcheance.type_echeance,
      frequence: templateEcheance.frequence,
      service_requis: templateEcheance.service_requis,
      canton_specifique: templateEcheance.canton_specifique,
      regime_tva: templateEcheance.regime_tva,
      jour_du_mois: templateEcheance.jour_du_mois,
      mois_dans_annee: templateEcheance.mois_dans_annee,
      date_specifique: templateEcheance.date_specifique,
      delai_alerte_jours: templateEcheance.delai_alerte_jours,
      jours_entre_relances: templateEcheance.jours_entre_relances,
      max_relances_auto: templateEcheance.max_relances_auto,
      documents_requis_types: templateEcheance.documents_requis_types,
      description: templateEcheance.description,
      actif: templateEcheance.actif,
    })
    .from(templateEcheance)
    .where(or(eq(templateEcheance.cabinet_id, cabinet_id), isNull(templateEcheance.cabinet_id)))
    .orderBy(asc(templateEcheance.type_echeance), asc(templateEcheance.nom));

  const rows: TemplateEcheanceRow[] = templates.map((t) => ({
    ...t,
    isGlobal: t.cabinet_id === null,
  }));

  return (
    <section className="max-w-6xl">
      <h1 className="text-xl font-semibold text-slate-900">Catalogue des échéances</h1>
      <p className="mt-1 text-sm text-slate-500">
        Règles de génération récurrente des échéances (fiscales, TVA, bouclement, salaire, relances
        documents). Le catalogue fédéral ZARYA est en lecture seule ; vous pouvez ajouter vos
        propres modèles pour ce cabinet.
      </p>

      <EcheancesClient templates={rows} isResponsable={isResponsable} />
    </section>
  );
}
