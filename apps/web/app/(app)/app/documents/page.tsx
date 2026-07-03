import { getCurrentUser } from "@zarya/auth";
import {
  client,
  db,
  document,
  emailBrut,
  facture,
  fichierPhysique,
  fournisseur,
  propositionFacture,
  uploadBrut,
  vInboxAValider,
} from "@zarya/db";
import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { FileText, Mail } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { helpAttrs } from "@/lib/help-attrs";
import { badgeStatutEmail, badgeStatutUpload, libelleSourceIngestion } from "@/lib/libelles";
import { DocumentsUploader } from "./documents-client";
import { type HubTab, HubTabs, LienOngletDocuments, ReclasserButton } from "./hub-client";
import { type InboxItem, ValidationInbox } from "./validation/validation-client";

// Hub Documents — page unique : file de validation intégrée (l'action d'abord,
// ux-principles § 6), zone d'upload, puis onglets « Documents reçus » /
// « Emails reçus » (?tab=), paginés côté serveur (?page=, 25/page — le param
// s'applique à l'onglet actif). Toutes les queries sont scopées cabinet_id
// (frontière de sécurité réelle sur le chemin service-role — ADR 0005 addendum).

// ─── Libellés & styles de statut (centralisés dans `@/lib/libelles`, C4.1) ───────

function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// C2.1 — formatage montant + devise pour le résumé facture (null si non interprétable).
function formatMontant(montant: string | null, devise: string | null): string | null {
  if (montant == null) return null;
  const n = Number(montant);
  if (Number.isNaN(n)) return null;
  return `${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise ?? "CHF"}`;
}

// C2.1 — nom du fournisseur d'une proposition : référentiel sinon raison sociale extraite.
function resumeFournisseurPropose(prop: {
  fournisseur_nom: string | null;
  fournisseur_propose_data: unknown;
}): string | null {
  if (prop.fournisseur_nom) return prop.fournisseur_nom;
  const data = prop.fournisseur_propose_data;
  if (data && typeof data === "object" && "raison_sociale" in data) {
    const rs = (data as { raison_sociale?: unknown }).raison_sociale;
    return typeof rs === "string" && rs.length > 0 ? rs : null;
  }
  return null;
}

// Pagination serveur (?page=) : taille de page commune aux deux onglets.
const PAR_PAGE = 25;

// ─── Onglet « Documents reçus » (rendu serveur) ────────────────────────────────

type UploadRow = {
  id: string;
  nom: string;
  taille: number;
  source: string;
  statut: string;
  date_upload: Date;
  email_brut_id: string | null;
  email_from: string | null;
  fichier_physique_id: string | null;
  // C2.2 — présent quand l'upload a été validé en doc.document (→ lien fiche).
  document_id: string | null;
  // C2.1 — résumé extrait (facture → fournisseur + montant), null sinon.
  resume: string | null;
};

function sourceUpload(u: UploadRow): string {
  if (u.email_brut_id) return `Email · de ${u.email_from ?? "expéditeur inconnu"}`;
  return libelleSourceIngestion(u.source);
}

function DocumentsTable({ uploads, peutAgir }: { uploads: UploadRow[]; peutAgir: boolean }) {
  if (uploads.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucun document pour l'instant"
        hint="Déposez un document ci-dessus, ou connectez votre boîte email : les pièces jointes arrivent ici automatiquement."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Fichier</TableHead>
          <TableHead className="hidden sm:table-cell">Source</TableHead>
          <TableHead className="hidden md:table-cell">Taille</TableHead>
          <TableHead className="hidden lg:table-cell">Reçu le</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {uploads.map((u) => {
          const statut = badgeStatutUpload(u.statut);
          const reclassable = peutAgir && (u.statut === "recu" || u.statut === "erreur");
          return (
            <TableRow key={u.id}>
              <TableCell className="max-w-xs">
                {/* C2.2 — libellé cliquable vers la fiche quand l'upload est validé */}
                {u.document_id ? (
                  <Link
                    href={`/app/documents/${u.document_id}`}
                    className="block truncate text-[13px] font-medium text-foreground hover:text-primary"
                    title={u.nom}
                  >
                    {u.nom}
                  </Link>
                ) : (
                  <p className="truncate text-[13px] font-medium text-foreground" title={u.nom}>
                    {u.nom}
                  </p>
                )}
                {/* C2.1 — résumé extrait (facture → fournisseur + montant) si dispo */}
                {u.resume && (
                  <p className="truncate text-xs text-muted-foreground" title={u.resume}>
                    {u.resume}
                  </p>
                )}
                <p className="truncate text-xs text-muted-foreground sm:hidden">
                  {sourceUpload(u)} · {formatTaille(u.taille)}
                </p>
              </TableCell>
              <TableCell className="hidden max-w-[14rem] text-muted-foreground sm:table-cell">
                <span className="block truncate" title={sourceUpload(u)}>
                  {sourceUpload(u)}
                </span>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatTaille(u.taille)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {formatDate(u.date_upload)}
              </TableCell>
              <TableCell>
                {u.statut === "a_valider" ? (
                  <a
                    href="#file-validation"
                    title="Aller à la file de validation en haut de page"
                    {...helpAttrs(
                      "Document à valider",
                      "ZARYA a proposé un classement en attente de votre accord. Cliquez pour remonter à la file de validation en haut de page.",
                    )}
                  >
                    <Badge famille={statut.famille} className="hover:bg-amber-100">
                      À valider ↑
                    </Badge>
                  </a>
                ) : (
                  <Badge famille={statut.famille}>{statut.label}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span className="inline-flex items-center justify-end gap-2">
                  {reclassable && <ReclasserButton uploadBrutId={u.id} />}
                  {/* C2.2 — lien fiche pour les documents validés (doc.document présent) */}
                  {u.document_id && (
                    <Button
                      asChild
                      variant="secondary"
                      size="sm"
                      {...helpAttrs(
                        "Ouvrir la fiche",
                        "Affiche le détail du document classé : type, client, période et données extraites, avec les liens vers la facture ou l'échéance liée.",
                      )}
                    >
                      <Link href={`/app/documents/${u.document_id}`}>Fiche</Link>
                    </Button>
                  )}
                  {u.fichier_physique_id && (
                    <>
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        {...helpAttrs(
                          "Ouvrir le document",
                          "Ouvre le fichier d'origine dans un nouvel onglet pour le consulter.",
                        )}
                      >
                        <a
                          href={`/api/documents/${u.fichier_physique_id}/apercu`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ouvrir
                        </a>
                      </Button>
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        {...helpAttrs(
                          "Télécharger le document",
                          "Télécharge le fichier d'origine sur votre appareil.",
                        )}
                      >
                        <a href={`/api/documents/${u.fichier_physique_id}/apercu?download=1`}>
                          Télécharger
                        </a>
                      </Button>
                    </>
                  )}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Onglet « Emails reçus » (rendu serveur) ───────────────────────────────────

type EmailRow = {
  id: string;
  subject: string | null;
  from_address: string | null;
  received_at: Date | null;
  has_attachments: boolean;
  statut: string;
};

function EmailsTable({
  emails,
  docsParEmail,
}: {
  emails: EmailRow[];
  docsParEmail: ReadonlyMap<string, number>;
}) {
  if (emails.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="Aucun email capté pour l'instant"
        hint="Les emails entrants de votre boîte Microsoft connectée apparaîtront ici, et leurs pièces jointes seront classées automatiquement."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Objet</TableHead>
          <TableHead className="hidden sm:table-cell">Expéditeur</TableHead>
          <TableHead className="hidden md:table-cell">Documents</TableHead>
          <TableHead className="hidden lg:table-cell">Reçu le</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {emails.map((e) => {
          const n = docsParEmail.get(e.id) ?? 0;
          const badge = badgeStatutEmail(e.statut);
          return (
            <TableRow key={e.id}>
              <TableCell className="max-w-xs">
                <p
                  className="truncate text-[13px] font-medium text-foreground"
                  title={e.subject ?? ""}
                >
                  {e.subject ?? "(sans objet)"}
                </p>
                <p className="truncate text-xs text-muted-foreground sm:hidden">
                  {e.from_address ?? "—"}
                </p>
              </TableCell>
              <TableCell className="hidden max-w-xs text-muted-foreground sm:table-cell">
                <span className="block truncate" title={e.from_address ?? ""}>
                  {e.from_address ?? "—"}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {n > 0 ? (
                  <LienOngletDocuments className="text-[13px] font-medium text-primary hover:text-primary-hover hover:underline">
                    → {n} document{n > 1 ? "s" : ""}
                  </LienOngletDocuments>
                ) : e.has_attachments && e.statut === "traite" ? (
                  <span className="text-[13px] text-muted-foreground">0 retenu</span>
                ) : (
                  <span className="text-[13px] text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {formatDate(e.received_at)}
              </TableCell>
              <TableCell>
                <Badge famille={badge.famille}>{badge.label}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

// URL d'une page d'onglet : préserve ?tab= et omet les valeurs par défaut
// (tab=documents, page=1) pour garder des URLs canoniques.
function hrefPage(tab: HubTab, page: number): string {
  const params = new URLSearchParams();
  if (tab === "emails") params.set("tab", "emails");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/app/documents?${qs}` : "/app/documents";
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; page?: string | string[] }>;
}) {
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab: HubTab = tabParam === "emails" ? "emails" : "documents";

  // ?page= s'applique à l'onglet actif ; l'onglet inactif est rendu en page 1
  // (les liens d'onglet remettent page=1 — cf. hub-client.tsx).
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const pageActive = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const pageDocuments = initialTab === "documents" ? pageActive : 1;
  const pageEmails = initialTab === "emails" ? pageActive : 1;

  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutAgir = role !== "lecteur";

  const [
    uploadsRaw,
    totalUploadsRows,
    inboxRows,
    clients,
    emails,
    totalEmailsRows,
    docsParEmailRows,
    facturesRows,
    propositionsRows,
  ] = await Promise.all([
    // C2.2 — on joint doc.document (via fichier_physique) pour relier un upload validé
    // à sa fiche, et facture_id pour le résumé. Toutes les jointures restent scopées
    // cabinet_id (frontière de sécurité sur le chemin service-role — ADR 0005 addendum).
    db
      .select({
        id: uploadBrut.id,
        nom: uploadBrut.nom_fichier_original,
        taille: uploadBrut.taille_octets,
        source: uploadBrut.source,
        statut: uploadBrut.statut,
        date_upload: uploadBrut.date_upload,
        email_brut_id: uploadBrut.email_brut_id,
        email_from: emailBrut.from_address,
        fichier_physique_id: fichierPhysique.id,
        document_id: document.id,
        document_facture_id: document.facture_id,
      })
      .from(uploadBrut)
      .leftJoin(fichierPhysique, eq(fichierPhysique.upload_brut_id, uploadBrut.id))
      .leftJoin(
        document,
        and(
          eq(document.fichier_physique_id, fichierPhysique.id),
          eq(document.cabinet_id, cabinet_id),
          // RUN 3 — un document archivé (mal classé / doublon) ne relie plus l'upload à sa fiche.
          isNull(document.archived_at),
        ),
      )
      .leftJoin(emailBrut, eq(emailBrut.id, uploadBrut.email_brut_id))
      .where(eq(uploadBrut.cabinet_id, cabinet_id))
      .orderBy(desc(uploadBrut.date_upload))
      .limit(PAR_PAGE)
      .offset((pageDocuments - 1) * PAR_PAGE),
    // Count total (même WHERE scopé cabinet_id) pour la pagination.
    db.select({ n: count() }).from(uploadBrut).where(eq(uploadBrut.cabinet_id, cabinet_id)),
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
        // Aperçu du document (servi par /api/documents/[fichierId]/apercu, qui re-vérifie
        // session + cabinet) : identifiant du fichier physique + type MIME.
        fichier_id: vInboxAValider.fichier_physique_id,
        type_mime: vInboxAValider.type_mime,
      })
      .from(vInboxAValider)
      .where(eq(vInboxAValider.cabinet_id, cabinet_id))
      .limit(100),
    db
      .select({ id: client.id, raison_sociale: client.raison_sociale })
      .from(client)
      .where(and(eq(client.cabinet_id, cabinet_id), isNull(client.archived_at)))
      .orderBy(asc(client.raison_sociale)),
    db
      .select({
        id: emailBrut.id,
        subject: emailBrut.subject,
        from_address: emailBrut.from_address,
        received_at: emailBrut.received_at,
        has_attachments: emailBrut.has_attachments,
        statut: emailBrut.statut,
      })
      .from(emailBrut)
      .where(eq(emailBrut.cabinet_id, cabinet_id))
      .orderBy(desc(emailBrut.received_at))
      .limit(PAR_PAGE)
      .offset((pageEmails - 1) * PAR_PAGE),
    // Count total (même WHERE scopé cabinet_id) pour la pagination.
    db.select({ n: count() }).from(emailBrut).where(eq(emailBrut.cabinet_id, cabinet_id)),
    db
      .select({ email_brut_id: uploadBrut.email_brut_id, n: count() })
      .from(uploadBrut)
      .where(and(eq(uploadBrut.cabinet_id, cabinet_id), isNotNull(uploadBrut.email_brut_id)))
      .groupBy(uploadBrut.email_brut_id),
    // C2.1 — résumés facture (clé = doc.document.id), scopés cabinet_id : entité finale.
    db
      .select({
        document_id: facture.document_id,
        fournisseur_nom: fournisseur.raison_sociale,
        total_ttc: facture.total_ttc,
        devise: facture.devise,
      })
      .from(facture)
      .innerJoin(fournisseur, eq(fournisseur.id, facture.fournisseur_id))
      .where(eq(facture.cabinet_id, cabinet_id)),
    // C2.1 — résumés facture (clé = doc.document.id), scopés cabinet_id : proposition (fallback).
    db
      .select({
        document_id: propositionFacture.document_id,
        fournisseur_nom: fournisseur.raison_sociale,
        fournisseur_propose_data: propositionFacture.fournisseur_propose_data,
        total_ttc: propositionFacture.total_ttc_propose,
        devise: propositionFacture.devise_proposee,
      })
      .from(propositionFacture)
      .leftJoin(fournisseur, eq(fournisseur.id, propositionFacture.fournisseur_existant_id))
      .where(eq(propositionFacture.cabinet_id, cabinet_id)),
  ]);

  // C2.1/C2.2 — assemble le résumé facture par doc.document (entité finale prioritaire).
  const factureParDoc = new Map(facturesRows.map((f) => [f.document_id, f]));
  const propositionParDoc = new Map(propositionsRows.map((p) => [p.document_id, p]));

  const uploads: UploadRow[] = uploadsRaw.map((u) => {
    let resume: string | null = null;
    if (u.document_id) {
      const fact = factureParDoc.get(u.document_id);
      if (fact) {
        resume =
          [fact.fournisseur_nom, formatMontant(fact.total_ttc, fact.devise)]
            .filter(Boolean)
            .join(" · ") || null;
      } else {
        const prop = propositionParDoc.get(u.document_id);
        if (prop) {
          resume =
            [resumeFournisseurPropose(prop), formatMontant(prop.total_ttc, prop.devise)]
              .filter(Boolean)
              .join(" · ") || null;
        }
      }
    }
    return {
      id: u.id,
      nom: u.nom,
      taille: u.taille,
      source: u.source,
      statut: u.statut,
      date_upload: u.date_upload,
      email_brut_id: u.email_brut_id,
      email_from: u.email_from,
      fichier_physique_id: u.fichier_physique_id,
      document_id: u.document_id,
      resume,
    };
  });

  const propositions: InboxItem[] = inboxRows.map((r) => ({
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

  const docsParEmail = new Map<string, number>();
  for (const r of docsParEmailRows) {
    if (r.email_brut_id) docsParEmail.set(r.email_brut_id, r.n);
  }

  const totalUploads = totalUploadsRows[0]?.n ?? 0;
  const totalEmails = totalEmailsRows[0]?.n ?? 0;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Documents"
        description="Tout passe par ici : vos dépôts, les emails captés et leur classement. ZARYA propose, vous validez en un clic."
      />

      {/* File de validation intégrée — l'action d'abord (ux-principles § 6) */}
      {peutAgir && propositions.length > 0 && (
        <section id="file-validation" className="mb-8">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            À valider ({propositions.length})
          </h2>
          <p className="mb-3 text-[13px] text-muted-foreground">
            ZARYA propose un classement pour chaque document. Vérifiez, corrigez si besoin, puis
            validez.
          </p>
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
        </section>
      )}

      {/* Zone d'upload */}
      {peutAgir ? (
        <DocumentsUploader />
      ) : (
        <div className="mb-6 rounded-lg border border-border bg-secondary p-4 text-sm text-muted-foreground">
          Votre rôle (lecteur) ne permet pas d'ajouter des documents.
        </div>
      )}

      {/* Onglets Documents / Emails */}
      <div className="mt-8">
        <HubTabs
          initialTab={initialTab}
          nbDocuments={totalUploads}
          nbEmails={totalEmails}
          documentsPanel={
            <>
              <DocumentsTable uploads={uploads} peutAgir={peutAgir} />
              <Pagination
                page={pageDocuments}
                total={totalUploads}
                parPage={PAR_PAGE}
                hrefPour={(p) => hrefPage("documents", p)}
              />
            </>
          }
          emailsPanel={
            <>
              <EmailsTable emails={emails} docsParEmail={docsParEmail} />
              <Pagination
                page={pageEmails}
                total={totalEmails}
                parPage={PAR_PAGE}
                hrefPour={(p) => hrefPage("emails", p)}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
