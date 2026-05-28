import { getCurrentUser } from "@zarya/auth";
import { client, db, fichierPhysique, propositionClassement, uploadBrut } from "@zarya/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PropositionCard } from "./validation-client";

// File de validation — module Doc (doc.md § 5 & § 7). L'IA propose, l'humain
// valide (UX principle § 1). Chaque proposition 'a_valider' devient un
// doc.document après validation, ou est rejetée.

export default async function ValidationPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutValider = role !== "lecteur";

  const [propositions, clients] = await Promise.all([
    db
      .select({
        id: propositionClassement.id,
        type_propose: propositionClassement.type_propose,
        categorie_proposee: propositionClassement.categorie_proposee,
        periode_proposee: propositionClassement.periode_proposee,
        libelle_propose: propositionClassement.libelle_propose,
        client_id_propose: propositionClassement.client_id_propose,
        confiance_globale: propositionClassement.confiance_globale,
        anomalies: propositionClassement.anomalies_detectees,
        created_at: propositionClassement.created_at,
        nom_fichier: uploadBrut.nom_fichier_original,
      })
      .from(propositionClassement)
      .innerJoin(fichierPhysique, eq(fichierPhysique.id, propositionClassement.fichier_physique_id))
      .leftJoin(uploadBrut, eq(uploadBrut.id, fichierPhysique.upload_brut_id))
      .where(
        and(
          eq(propositionClassement.cabinet_id, cabinet_id),
          eq(propositionClassement.statut, "a_valider"),
        ),
      )
      .orderBy(asc(propositionClassement.created_at))
      .limit(100),
    db
      .select({ id: client.id, raison_sociale: client.raison_sociale })
      .from(client)
      .where(and(eq(client.cabinet_id, cabinet_id), isNull(client.archived_at)))
      .orderBy(asc(client.raison_sociale)),
  ]);

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">À valider</h1>
          <p className="mt-1 text-sm text-slate-500">
            ZARYA propose un classement pour chaque document. Vérifiez, corrigez si besoin, puis
            validez.
          </p>
        </div>
        <Link
          href="/app/documents"
          className="shrink-0 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          ← Documents
        </Link>
      </div>

      {!peutValider ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Votre rôle (lecteur) ne permet pas de valider des documents.
        </div>
      ) : propositions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-slate-600">Rien à valider</p>
          <p className="mt-1 text-xs text-slate-400">
            Les documents déposés apparaîtront ici une fois classés.
          </p>
        </div>
      ) : (
        <>
          {clients.length === 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Aucun client n'existe encore pour ce cabinet. La validation attribue un document à un
              client : créez d'abord un client (module CRM, à venir) pour pouvoir valider.
            </div>
          )}
          <ul className="space-y-3">
            {propositions.map((p) => (
              <li key={p.id}>
                <PropositionCard
                  proposition={{
                    id: p.id,
                    type_propose: p.type_propose,
                    categorie_proposee: p.categorie_proposee,
                    periode_proposee: p.periode_proposee,
                    libelle_propose: p.libelle_propose,
                    client_id_propose: p.client_id_propose,
                    confiance_globale: p.confiance_globale,
                    anomalies: p.anomalies ?? [],
                    nom_fichier: p.nom_fichier,
                  }}
                  clients={clients}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
