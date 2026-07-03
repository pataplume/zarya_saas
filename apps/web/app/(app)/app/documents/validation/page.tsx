import { getCurrentUser } from "@zarya/auth";
import { client, db, vInboxAValider } from "@zarya/db";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { type InboxItem, ValidationInbox } from "./validation-client";

// File de validation — module Doc (doc.md § 5 & § 7, Bloc B7). L'IA propose,
// l'humain valide (UX principle § 1). La page lit la vue dénormalisée
// doc.v_inbox_a_valider (migration 0022) scopée cabinet_id (frontière de
// sécurité réelle sur le chemin service-role — ADR 0005 addendum).

// Pagination serveur (?page=) : taille de page de la file de validation. Au-delà,
// le backlog reste accessible page par page (état dans l'URL, partageable).
const PAR_PAGE = 25;

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutValider = role !== "lecteur";

  // Total des propositions à valider (mêmes WHERE que la requête paginée : scope cabinet).
  // Sert au compteur d'en-tête ET au nombre de pages.
  const [enAttente] = await db
    .select({ n: count() })
    .from(vInboxAValider)
    .where(eq(vInboxAValider.cabinet_id, cabinet_id));
  const total = enAttente?.n ?? 0;

  const nbPages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const sp = await searchParams;
  const pageDemandee = z.coerce.number().int().positive().catch(1).parse(sp.page);
  const page = Math.min(pageDemandee, nbPages);

  const [rows, clients] = await Promise.all([
    db
      .select({
        proposition_id: vInboxAValider.proposition_id,
        type_propose: vInboxAValider.type_propose,
        categorie_proposee: vInboxAValider.categorie_proposee,
        periode_proposee: vInboxAValider.periode_proposee,
        libelle_propose: vInboxAValider.libelle_propose,
        client_id_propose: vInboxAValider.client_id_propose,
        client_nom: vInboxAValider.client_nom,
        confiance_globale: vInboxAValider.confiance_globale,
        anomalies: vInboxAValider.anomalies_detectees,
        nom_fichier: vInboxAValider.nom_fichier_original,
        // Aperçu du document : identifiant du fichier physique servi par
        // /api/documents/[fichierId]/apercu (qui re-vérifie session + cabinet) + type MIME.
        // Aucune donnée sensible supplémentaire (pas de chemin storage, pas d'IBAN).
        fichier_id: vInboxAValider.fichier_physique_id,
        type_mime: vInboxAValider.type_mime,
      })
      .from(vInboxAValider)
      .where(eq(vInboxAValider.cabinet_id, cabinet_id))
      .limit(PAR_PAGE)
      .offset((page - 1) * PAR_PAGE),
    db
      .select({ id: client.id, raison_sociale: client.raison_sociale })
      .from(client)
      .where(and(eq(client.cabinet_id, cabinet_id), isNull(client.archived_at)))
      .orderBy(asc(client.raison_sociale)),
  ]);

  const propositions: InboxItem[] = rows.map((r) => ({
    proposition_id: r.proposition_id,
    type_propose: r.type_propose,
    categorie_proposee: r.categorie_proposee,
    periode_proposee: r.periode_proposee,
    libelle_propose: r.libelle_propose,
    client_id_propose: r.client_id_propose,
    client_nom: r.client_nom,
    confiance_globale: r.confiance_globale,
    anomalies: r.anomalies ?? [],
    nom_fichier: r.nom_fichier,
    fichier_id: r.fichier_id,
    type_mime: r.type_mime,
  }));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={`À valider${total > 0 ? ` (${total})` : ""}`}
        description="ZARYA propose un classement pour chaque document. Vérifiez, corrigez si besoin, puis validez."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/documents">← Documents</Link>
          </Button>
        }
      />

      {!peutValider ? (
        <div className="rounded-lg border border-border bg-secondary p-4 text-sm text-muted-foreground">
          Votre rôle (lecteur) ne permet pas de valider des documents.
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Rien à valider"
          hint="Les documents déposés apparaîtront ici une fois classés."
        />
      ) : (
        <>
          {clients.length === 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Aucun client n'existe encore pour ce cabinet. La validation attribue un document à un
              client :{" "}
              <Link href="/app/clients" className="font-medium underline hover:text-amber-900">
                créez d'abord un client
              </Link>{" "}
              pour pouvoir valider.
            </div>
          )}
          <ValidationInbox propositions={propositions} clients={clients} />
          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            hrefPour={(p) => `/app/documents/validation?page=${p}`}
          />
        </>
      )}
    </div>
  );
}
