import { getCurrentUser } from "@zarya/auth";
import {
  accesClient,
  and,
  client as clientTable,
  db,
  eq,
  isNull,
  lte,
  periode as periodeTable,
  relanceSalaire,
  sql,
} from "@zarya/db";
import { buildRelanceTemplate } from "@zarya/extraction";
import { asc, inArray, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { type RelanceSalaireItem, RelancesSalaireFile } from "./relances-salaire-client";

// Run F1 — file de validation des relances salaire (mode A, backend G5b).
// Le cron génère des BROUILLONS (relance_salaire.valide_par_humain=false, sans sujet/corps) ;
// l'humain valide puis envoie (UX §1). On reconstruit l'aperçu via buildRelanceTemplate.
// Scopé cabinet_id (frontière de sécurité réelle sur le chemin service-role — ADR 0005).

export default async function RelancesSalairePage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutEnvoyer = role !== "lecteur";

  // Brouillons (non encore envoyés) du cabinet + contexte période/client.
  const rows = await db
    .select({
      relance_id: relanceSalaire.id,
      client_id: relanceSalaire.client_id,
      numero: relanceSalaire.numero,
      raison_sociale: clientTable.raison_sociale,
      annee: periodeTable.annee,
      mois: periodeTable.mois,
      date_limite: periodeTable.date_limite_validation,
    })
    .from(relanceSalaire)
    .innerJoin(periodeTable, eq(periodeTable.id, relanceSalaire.periode_id))
    .innerJoin(clientTable, eq(clientTable.id, relanceSalaire.client_id))
    .where(
      and(
        eq(relanceSalaire.cabinet_id, cabinet_id),
        eq(relanceSalaire.valide_par_humain, false),
        or(isNull(relanceSalaire.snoozed_until), lte(relanceSalaire.snoozed_until, sql`now()`)),
      ),
    )
    .orderBy(asc(periodeTable.date_limite_validation))
    .limit(200);

  // Destinataires (accès client actif) résolus en un seul appel, indexés par client_id.
  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const destinataires = new Map<string, string>();
  if (clientIds.length > 0) {
    const acces = await db
      .select({ client_id: accesClient.client_id, email: accesClient.email })
      .from(accesClient)
      .where(and(inArray(accesClient.client_id, clientIds), eq(accesClient.actif, true)));
    for (const a of acces) {
      if (!destinataires.has(a.client_id)) destinataires.set(a.client_id, a.email);
    }
  }

  const relances: RelanceSalaireItem[] = rows.map((r) => {
    const date_limite = r.date_limite ? String(r.date_limite) : "";
    const tpl = buildRelanceTemplate({
      raison_sociale: r.raison_sociale ?? "votre entreprise",
      mois: r.mois,
      annee: r.annee,
      date_limite,
    });
    return {
      relance_id: r.relance_id,
      client_nom: r.raison_sociale,
      periode_libelle: `${String(r.mois).padStart(2, "0")}/${r.annee}`,
      date_limite: date_limite || null,
      destinataire_email: destinataires.get(r.client_id) ?? null,
      sujet: tpl.sujet,
      corps: tpl.corps,
      numero: r.numero,
    };
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Relances salaire à valider</h1>
      <p className="mb-6 text-sm text-slate-500">
        {relances.length} relance{relances.length > 1 ? "s" : ""} en attente de validation
      </p>
      <RelancesSalaireFile relances={relances} peutEnvoyer={peutEnvoyer} />
    </main>
  );
}
