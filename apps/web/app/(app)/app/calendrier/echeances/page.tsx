import { getCurrentUser } from "@zarya/auth";
import { client, db, echeance } from "@zarya/db";
import { and, asc, count, eq, gte, ilike, isNull, lte } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  dernierJourMois,
  formatMoisParam,
  parseMoisParam,
  premierJourMois,
} from "@/lib/calendrier-grille";
import { helpAttrs } from "@/lib/help-attrs";
import { cn } from "@/lib/utils";
import { type EcheanceRow, EcheancesListe } from "./echeances-client";
import { GrilleMois } from "./grille-mois";

// Vues échéances — module Calendar (calendar.md §6.2, Bloc C3b). Interroge crm.echeance
// directement (la vue v_echeances_a_venir est trop étroite : a_venir/imminente ≤30j).
// Scopée cabinet_id (frontière de sécurité — ADR 0005 addendum).
//
// Deux vues au choix (`?vue=liste|grille`, défaut liste — RUN 7 usabilité) :
//  - liste : pagination serveur `?page=` (50/page), requête et logique INCHANGÉES
//    depuis C3b (ne pas toucher) ;
//  - grille : requête SÉPARÉE bornée sur le mois piloté par `?mois=AAAA-MM` (défaut mois
//    courant), sans pagination (un mois est naturellement borné ; limite de sécurité
//    500 lignes). Groupement par jour fait dans `grille-mois.tsx`.
// Les deux vues partagent les mêmes filtres statut/type/client/q, préservés dans l'URL
// lors du basculement (même pattern hrefPour/hrefSansClient que la pagination liste).

const STATUTS = ["a_venir", "imminente", "en_retard", "traitee", "reportee", "annulee"] as const;
const TYPES = [
  "fiscale",
  "tva",
  "bouclement",
  "salaire",
  "relance_documents",
  "personnalisee",
] as const;

const PAR_PAGE = 50;
const LIMITE_GRILLE = 500;
const ECHEANCES_PATH = "/app/calendrier/echeances";
const VUES = ["liste", "grille"] as const;

type Statut = (typeof STATUTS)[number];
type TypeEch = (typeof TYPES)[number];
type Vue = (typeof VUES)[number];

export default async function EcheancesPage({
  searchParams,
}: {
  searchParams: Promise<{
    statut?: string;
    type?: string;
    q?: string;
    page?: string;
    client?: string;
    vue?: string;
    mois?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutAgir = role !== "lecteur";

  const sp = await searchParams;
  const statut = STATUTS.includes(sp.statut as Statut) ? (sp.statut as Statut) : undefined;
  const type = TYPES.includes(sp.type as TypeEch) ? (sp.type as TypeEch) : undefined;
  const q = sp.q?.trim() || undefined;
  // Filtre « dossier client » (?client=<uuid>) : validé uuid (param invalide ⇒ ignoré, pas
  // d'erreur). Le filtre s'AJOUTE au scope cabinet — un client d'un autre cabinet ne matche
  // aucune ligne (frontière de sécurité ADR 0005 addendum : le WHERE reste scopé cabinet_id).
  const clientFiltre = z.string().uuid().safeParse(sp.client).data;
  const pageParsee = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageParsee) && pageParsee >= 1 ? pageParsee : 1;
  const vue: Vue = VUES.includes(sp.vue as Vue) ? (sp.vue as Vue) : "liste";
  const { annee, mois } = parseMoisParam(sp.mois);

  const conditions = [eq(echeance.cabinet_id, cabinet_id), isNull(echeance.archived_at)];
  if (statut) conditions.push(eq(echeance.statut, statut));
  if (type) conditions.push(eq(echeance.type, type));
  if (q) conditions.push(ilike(client.raison_sociale, `%${q}%`));
  if (clientFiltre) conditions.push(eq(echeance.client_id, clientFiltre));

  const [totalRow, rows, echeancesMoisRows, clientsActifs] = await Promise.all([
    db
      .select({ n: count() })
      .from(echeance)
      .innerJoin(client, eq(client.id, echeance.client_id))
      .where(and(...conditions))
      .then((r) => r[0]),
    db
      .select({
        id: echeance.id,
        client_id: echeance.client_id,
        client_nom: client.raison_sociale,
        type: echeance.type,
        libelle: echeance.libelle,
        date_echeance: echeance.date_echeance,
        statut: echeance.statut,
        reporte_a: echeance.reporte_a,
        motif_report: echeance.motif_report,
      })
      .from(echeance)
      .innerJoin(client, eq(client.id, echeance.client_id))
      .where(and(...conditions))
      .orderBy(asc(echeance.date_echeance))
      .limit(PAR_PAGE)
      .offset((page - 1) * PAR_PAGE),
    // Requête SÉPARÉE pour la vue grille (RUN 7 usabilité) — mêmes filtres, bornée sur
    // le mois affiché, pas de pagination (limite de sécurité 500, sans impact en usage
    // normal : un cabinet ne génère pas 500 échéances/mois). N'affecte jamais la requête
    // liste ci-dessus (indépendante).
    vue === "grille"
      ? db
          .select({
            id: echeance.id,
            client_id: echeance.client_id,
            client_nom: client.raison_sociale,
            type: echeance.type,
            libelle: echeance.libelle,
            date_echeance: echeance.date_echeance,
            statut: echeance.statut,
            reporte_a: echeance.reporte_a,
            motif_report: echeance.motif_report,
          })
          .from(echeance)
          .innerJoin(client, eq(client.id, echeance.client_id))
          .where(
            and(
              ...conditions,
              gte(echeance.date_echeance, premierJourMois(annee, mois)),
              lte(echeance.date_echeance, dernierJourMois(annee, mois)),
            ),
          )
          .orderBy(asc(echeance.date_echeance))
          .limit(LIMITE_GRILLE)
      : Promise.resolve([]),
    // Liste des clients actifs (non archivés) du cabinet — sert au Select du dialog
    // « + Échéance » (création manuelle, RUN4 usabilité).
    db
      .select({ id: client.id, raison_sociale: client.raison_sociale })
      .from(client)
      .where(and(eq(client.cabinet_id, cabinet_id), isNull(client.archived_at)))
      .orderBy(asc(client.raison_sociale)),
  ]);
  const total = totalRow?.n ?? 0;

  function versEcheanceRow(r: (typeof rows)[number]): EcheanceRow {
    return {
      id: r.id,
      client_id: r.client_id,
      client_nom: r.client_nom,
      type: r.type,
      libelle: r.libelle,
      date_echeance: r.date_echeance ? new Date(r.date_echeance).toISOString().slice(0, 10) : null,
      statut: r.statut,
      reporte_a: r.reporte_a ? new Date(r.reporte_a).toISOString().slice(0, 10) : null,
      motif_report: r.motif_report,
    };
  }

  const echeances: EcheanceRow[] = rows.map(versEcheanceRow);
  const echeancesMois: EcheanceRow[] = echeancesMoisRows.map(versEcheanceRow);

  // Bandeau « Filtré sur [raison sociale] » : on lit la raison sociale du client filtré,
  // scopée cabinet_id (un id d'un autre cabinet ⇒ aucune ligne, donc pas de bandeau).
  let clientNomFiltre: string | null = null;
  if (clientFiltre) {
    const [c] = await db
      .select({ raison_sociale: client.raison_sociale })
      .from(client)
      .where(and(eq(client.id, clientFiltre), eq(client.cabinet_id, cabinet_id)))
      .limit(1);
    clientNomFiltre = c?.raison_sociale ?? null;
  }

  // Paramètres communs aux deux vues (statut/type/q/client) — factorisé pour que le
  // toggle de vue et la navigation grille (mois) les préservent à l'identique.
  function paramsFiltres(): URLSearchParams {
    const params = new URLSearchParams();
    if (statut) params.set("statut", statut);
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    if (clientFiltre) params.set("client", clientFiltre);
    return params;
  }

  // Construit l'URL d'une page en préservant les filtres actifs (statut/type/q/client).
  // Vue liste uniquement — logique INCHANGÉE depuis C3b.
  function hrefPour(p: number): string {
    const params = paramsFiltres();
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${ECHEANCES_PATH}?${qs}` : ECHEANCES_PATH;
  }

  // Lien « tout voir » du bandeau : retire ?client mais garde les autres filtres (+ vue).
  const hrefSansClient = (() => {
    const params = new URLSearchParams();
    if (statut) params.set("statut", statut);
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    if (vue !== "liste") params.set("vue", vue);
    if (vue === "grille") params.set("mois", formatMoisParam(annee, mois));
    const qs = params.toString();
    return qs ? `${ECHEANCES_PATH}?${qs}` : ECHEANCES_PATH;
  })();

  // Toggle liste/grille : préserve tous les filtres actifs (statut/type/q/client). Le
  // mois n'est conservé que pour la vue grille (pas de sens en liste).
  function hrefVue(v: Vue): string {
    const params = paramsFiltres();
    if (v !== "liste") params.set("vue", v);
    if (v === "grille") params.set("mois", formatMoisParam(annee, mois));
    const qs = params.toString();
    return qs ? `${ECHEANCES_PATH}?${qs}` : ECHEANCES_PATH;
  }

  // Navigation mois précédent/suivant de la grille : préserve les filtres + reste en vue grille.
  function hrefMois(a: number, m: number): string {
    const params = paramsFiltres();
    params.set("vue", "grille");
    params.set("mois", formatMoisParam(a, m));
    return `${ECHEANCES_PATH}?${params.toString()}`;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Échéances" description={`${total} échéance(s)`} />

      <div
        className="mb-4 flex items-center gap-1"
        role="tablist"
        aria-label="Choisir la vue des échéances"
      >
        <Link
          href={hrefVue("liste")}
          role="tab"
          aria-selected={vue === "liste"}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
            vue === "liste"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
          {...helpAttrs("Vue liste", "Affiche les échéances en liste paginée triée par date.")}
        >
          Liste
        </Link>
        <Link
          href={hrefVue("grille")}
          role="tab"
          aria-selected={vue === "grille"}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
            vue === "grille"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
          {...helpAttrs(
            "Vue grille",
            "Affiche les échéances du mois sous forme de calendrier (une case par jour).",
          )}
        >
          Grille
        </Link>
      </div>

      {vue === "grille" ? (
        <GrilleMois
          echeances={echeancesMois}
          annee={annee}
          mois={mois}
          hrefMois={hrefMois}
          hrefListe={hrefVue("liste")}
        />
      ) : (
        <>
          <EcheancesListe
            echeances={echeances}
            statuts={[...STATUTS]}
            types={[...TYPES]}
            filtres={{ statut: statut ?? "", type: type ?? "", q: q ?? "" }}
            peutAgir={peutAgir}
            clientsActifs={clientsActifs}
            {...(clientFiltre && clientNomFiltre
              ? {
                  filtreClient: {
                    id: clientFiltre,
                    nom: clientNomFiltre,
                    hrefTout: hrefSansClient,
                  },
                }
              : {})}
          />
          <Pagination page={page} total={total} parPage={PAR_PAGE} hrefPour={hrefPour} />
        </>
      )}
    </main>
  );
}
