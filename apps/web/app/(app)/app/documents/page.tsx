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
import Link from "next/link";
import { redirect } from "next/navigation";
import { DocumentsUploader } from "./documents-client";
import { type HubTab, HubTabs, LienOngletDocuments, ReclasserButton } from "./hub-client";
import { type InboxItem, ValidationInbox } from "./validation/validation-client";

// Hub Documents — page unique : file de validation intégrée (l'action d'abord,
// ux-principles § 6), zone d'upload, puis onglets « Documents reçus » /
// « Emails reçus » (?tab=). Toutes les queries sont scopées cabinet_id
// (frontière de sécurité réelle sur le chemin service-role — ADR 0005 addendum).

// ─── Libellés & styles de statut ───────────────────────────────────────────────

const STATUT_DOC: Record<string, { label: string; style: string }> = {
  recu: {
    label: "Classification en attente",
    style: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  en_classification: {
    label: "En classification",
    style: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  a_valider: { label: "À valider", style: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  valide: { label: "Validé", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  rejete: { label: "Rejeté", style: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  doublon: { label: "Doublon", style: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  erreur: { label: "Échec", style: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

const STATUT_DOC_DEFAUT = {
  label: "Inconnu",
  style: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const SOURCE_LABEL: Record<string, string> = {
  email_microsoft: "Email",
  email_autre: "Email",
  nas: "NAS",
  upload_fiduciaire: "Upload",
  upload_client: "Client",
  api: "API",
  import_manuel: "Import",
};

const STATUT_EMAIL_LABEL: Record<string, string> = {
  recu: "En attente",
  traite: "Traité",
  ignore: "Sans pièce utile",
  erreur: "Erreur",
};

const STATUT_EMAIL_STYLE: Record<string, string> = {
  recu: "bg-blue-50 text-blue-700 ring-blue-600/20",
  traite: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ignore: "bg-slate-100 text-slate-600 ring-slate-500/20",
  erreur: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

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

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500";

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
  return SOURCE_LABEL[u.source] ?? u.source;
}

function DocumentsTable({ uploads, peutAgir }: { uploads: UploadRow[]; peutAgir: boolean }) {
  if (uploads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
        <svg
          className="mx-auto h-8 w-8 text-slate-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-600">Aucun document pour l'instant</p>
        <p className="mt-1 text-xs text-slate-400">
          Déposez un document ci-dessus, ou connectez votre boîte email : les pièces jointes
          arrivent ici automatiquement.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Fichier</th>
            <th className={`hidden sm:table-cell ${TH}`}>Source</th>
            <th className={`hidden md:table-cell ${TH}`}>Taille</th>
            <th className={`hidden lg:table-cell ${TH}`}>Reçu le</th>
            <th className={TH}>Statut</th>
            <th className={`${TH} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {uploads.map((u) => {
            const statut = STATUT_DOC[u.statut] ?? STATUT_DOC_DEFAUT;
            const badge = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statut.style}`;
            const reclassable = peutAgir && (u.statut === "recu" || u.statut === "erreur");
            return (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="max-w-xs px-4 py-3">
                  {/* C2.2 — libellé cliquable vers la fiche quand l'upload est validé */}
                  {u.document_id ? (
                    <Link
                      href={`/app/documents/${u.document_id}`}
                      className="block truncate text-sm font-medium text-slate-800 hover:text-blue-700"
                      title={u.nom}
                    >
                      {u.nom}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium text-slate-800" title={u.nom}>
                      {u.nom}
                    </p>
                  )}
                  {/* C2.1 — résumé extrait (facture → fournisseur + montant) si dispo */}
                  {u.resume && (
                    <p className="truncate text-xs text-slate-500" title={u.resume}>
                      {u.resume}
                    </p>
                  )}
                  <p className="truncate text-xs text-slate-400 sm:hidden">
                    {sourceUpload(u)} · {formatTaille(u.taille)}
                  </p>
                </td>
                <td className="hidden max-w-[14rem] px-4 py-3 text-sm text-slate-500 sm:table-cell">
                  <span className="block truncate" title={sourceUpload(u)}>
                    {sourceUpload(u)}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                  {formatTaille(u.taille)}
                </td>
                <td className="hidden px-4 py-3 text-sm text-slate-500 lg:table-cell">
                  {formatDate(u.date_upload)}
                </td>
                <td className="px-4 py-3">
                  {u.statut === "a_valider" ? (
                    <a
                      href="#file-validation"
                      title="Aller à la file de validation en haut de page"
                      className={`${badge} hover:bg-amber-100`}
                    >
                      À valider ↑
                    </a>
                  ) : (
                    <span className={badge}>{statut.label}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    {reclassable && <ReclasserButton uploadBrutId={u.id} />}
                    {/* C2.2 — lien fiche pour les documents validés (doc.document présent) */}
                    {u.document_id && (
                      <Link
                        href={`/app/documents/${u.document_id}`}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Fiche
                      </Link>
                    )}
                    {u.fichier_physique_id && (
                      <a
                        href={`/api/documents/${u.fichier_physique_id}/apercu`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Ouvrir
                      </a>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
        <svg
          className="mx-auto h-8 w-8 text-slate-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-600">Aucun email capté pour l'instant</p>
        <p className="mt-1 text-xs text-slate-400">
          Les emails entrants de votre boîte Microsoft connectée apparaîtront ici, et leurs pièces
          jointes seront classées automatiquement.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Objet</th>
            <th className={`hidden sm:table-cell ${TH}`}>Expéditeur</th>
            <th className={`hidden md:table-cell ${TH}`}>Documents</th>
            <th className={`hidden lg:table-cell ${TH}`}>Reçu le</th>
            <th className={TH}>Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {emails.map((e) => {
            const n = docsParEmail.get(e.id) ?? 0;
            return (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="max-w-xs px-4 py-3">
                  <p
                    className="truncate text-sm font-medium text-slate-800"
                    title={e.subject ?? ""}
                  >
                    {e.subject ?? "(sans objet)"}
                  </p>
                  <p className="truncate text-xs text-slate-400 sm:hidden">
                    {e.from_address ?? "—"}
                  </p>
                </td>
                <td className="hidden max-w-xs px-4 py-3 text-sm text-slate-500 sm:table-cell">
                  <span className="block truncate" title={e.from_address ?? ""}>
                    {e.from_address ?? "—"}
                  </span>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {n > 0 ? (
                    <LienOngletDocuments className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                      → {n} document{n > 1 ? "s" : ""}
                    </LienOngletDocuments>
                  ) : e.has_attachments && e.statut === "traite" ? (
                    <span className="text-sm text-slate-500">0 retenu</span>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-sm text-slate-500 lg:table-cell">
                  {formatDate(e.received_at)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      STATUT_EMAIL_STYLE[e.statut] ??
                      "bg-slate-100 text-slate-600 ring-slate-500/20"
                    }`}
                  >
                    {STATUT_EMAIL_LABEL[e.statut] ?? e.statut}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab: HubTab = tabParam === "emails" ? "emails" : "documents";

  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutAgir = role !== "lecteur";

  const [uploadsRaw, inboxRows, clients, emails, docsParEmailRows, facturesRows, propositionsRows] =
    await Promise.all([
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
          ),
        )
        .leftJoin(emailBrut, eq(emailBrut.id, uploadBrut.email_brut_id))
        .where(eq(uploadBrut.cabinet_id, cabinet_id))
        .orderBy(desc(uploadBrut.date_upload))
        .limit(100),
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
        .limit(200),
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
  }));

  const docsParEmail = new Map<string, number>();
  for (const r of docsParEmailRows) {
    if (r.email_brut_id) docsParEmail.set(r.email_brut_id, r.n);
  }

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tout passe par ici : vos dépôts, les emails captés et leur classement. ZARYA propose, vous
          validez en un clic.
        </p>
      </div>

      {/* File de validation intégrée — l'action d'abord (ux-principles § 6) */}
      {peutAgir && propositions.length > 0 && (
        <section id="file-validation" className="mb-8">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">
            À valider ({propositions.length})
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            ZARYA propose un classement pour chaque document. Vérifiez, corrigez si besoin, puis
            validez.
          </p>
          {clients.length === 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
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
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Votre rôle (lecteur) ne permet pas d'ajouter des documents.
        </div>
      )}

      {/* Onglets Documents / Emails */}
      <div className="mt-8">
        <HubTabs
          initialTab={initialTab}
          nbDocuments={uploads.length}
          nbEmails={emails.length}
          documentsPanel={<DocumentsTable uploads={uploads} peutAgir={peutAgir} />}
          emailsPanel={<EmailsTable emails={emails} docsParEmail={docsParEmail} />}
        />
      </div>
    </div>
  );
}
