import { getCurrentUser } from "@zarya/auth";
import { client, db, facture, fournisseur } from "@zarya/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Archive } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
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
import { badgeStatutFacture } from "@/lib/libelles";

// Historique des factures validées/exportées — module Facture (PLAN-USABILITE-MVP Run 6).
// Écran de CONSULTATION seul : liste paginée des factures déjà `validee`/`exportee`/`payee`
// du cabinet (le compteur + le bouton d'export global restent sur /app/factures/validation).
// Scopée cabinet_id (frontière de sécurité réelle sur le chemin service-role — ADR 0005
// addendum). Pas de ré-export ciblé : /api/factures/export exporte TOUJOURS l'intégralité
// des factures `validee` du cabinet en un lot (aucun filtre ?ids= disponible) — ajouter un
// tel filtre est hors périmètre de ce lot (cf. résumé de la tâche).

const STATUTS_HISTORIQUE = ["validee", "exportee", "payee"] as const;
type StatutHistorique = (typeof STATUTS_HISTORIQUE)[number];

const PAR_PAGE = 25;
const HISTORIQUE_PATH = "/app/factures/historique";

function n(v: string | null): number | null {
  return v === null ? null : Number(v);
}

export default async function FacturesHistoriquePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const sp = await searchParams;
  const statutFiltre = STATUTS_HISTORIQUE.includes(sp.statut as StatutHistorique)
    ? (sp.statut as StatutHistorique)
    : undefined;

  const conditions = [
    eq(facture.cabinet_id, cabinet_id),
    statutFiltre ? eq(facture.statut, statutFiltre) : inArray(facture.statut, STATUTS_HISTORIQUE),
  ];

  const pageDemandee = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageDemandee) && pageDemandee >= 1 ? pageDemandee : 1;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ id: facture.id })
      .from(facture)
      .where(and(...conditions))
      .then((r) => r.length),
    db
      .select({
        id: facture.id,
        client_id: facture.client_id,
        client_nom: client.raison_sociale,
        fournisseur_nom: fournisseur.raison_sociale,
        numero_facture: facture.numero_facture,
        total_ttc: facture.total_ttc,
        devise: facture.devise,
        date_emission: facture.date_emission,
        statut: facture.statut,
        updated_at: facture.updated_at,
      })
      .from(facture)
      .leftJoin(client, eq(facture.client_id, client.id))
      .leftJoin(fournisseur, eq(facture.fournisseur_id, fournisseur.id))
      .where(and(...conditions))
      .orderBy(desc(facture.date_emission))
      .limit(PAR_PAGE)
      .offset((page - 1) * PAR_PAGE),
  ]);
  const total = totalRow;

  function hrefPour(p: number): string {
    const params = new URLSearchParams();
    if (statutFiltre) params.set("statut", statutFiltre);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${HISTORIQUE_PATH}?${qs}` : HISTORIQUE_PATH;
  }

  function hrefFiltre(s?: StatutHistorique): string {
    const params = new URLSearchParams();
    if (s) params.set("statut", s);
    const qs = params.toString();
    return qs ? `${HISTORIQUE_PATH}?${qs}` : HISTORIQUE_PATH;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Historique des factures"
        description={`${total} facture${total > 1 ? "s" : ""} validée${total > 1 ? "s" : ""}, exportée${total > 1 ? "s" : ""} ou payée${total > 1 ? "s" : ""}`}
        actions={
          <Link
            href="/app/factures/validation"
            className="text-[13px] font-medium text-primary hover:underline"
            {...helpAttrs(
              "File de validation",
              "Retourne à la file des factures en attente de validation.",
            )}
          >
            ← File de validation
          </Link>
        }
      />

      {/* Filtre par statut (?statut=) : liens simples, pas de JS — l'état survit au partage
          d'URL et au rafraîchissement, comme les autres listes serveur du dashboard. */}
      <div
        className="mb-4 flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Filtrer par statut"
      >
        <Link
          href={hrefFiltre(undefined)}
          className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${
            !statutFiltre
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          Tous
        </Link>
        {STATUTS_HISTORIQUE.map((s) => {
          const { label } = badgeStatutFacture(s);
          return (
            <Link
              key={s}
              href={hrefFiltre(s)}
              className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${
                statutFiltre === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Aucune facture dans l'historique"
          hint="Les factures validées, exportées ou payées apparaîtront ici."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead>N° facture</TableHead>
              <TableHead>Montant TTC</TableHead>
              <TableHead>Date d'émission</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date d'export</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const { label, famille } = badgeStatutFacture(r.statut);
              const ttc = n(r.total_ttc);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.client_id ? (
                      <Link
                        href={`/app/clients/${r.client_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.client_nom ?? "—"}
                      </Link>
                    ) : (
                      (r.client_nom ?? "—")
                    )}
                  </TableCell>
                  <TableCell>{r.fournisseur_nom ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{r.numero_facture}</TableCell>
                  <TableCell className="tabular-nums">
                    {ttc !== null ? `${ttc.toFixed(2)} ${r.devise}` : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.date_emission}</TableCell>
                  <TableCell>
                    <Badge famille={famille}>{label}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.statut === "exportee" || r.statut === "payee"
                      ? new Date(r.updated_at).toISOString().slice(0, 10)
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Pagination page={page} total={total} parPage={PAR_PAGE} hrefPour={hrefPour} />
    </main>
  );
}
