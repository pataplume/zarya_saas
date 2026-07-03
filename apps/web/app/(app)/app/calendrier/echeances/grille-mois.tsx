import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  type EcheanceGroupable,
  enTetesJoursSemaine,
  joursGrilleMois,
  libelleMois,
  moisAdjacent,
  regrouperParJour,
} from "@/lib/calendrier-grille";
import { helpAttrs } from "@/lib/help-attrs";
import { badgeStatutEcheance, libelleTypeEcheance } from "@/lib/libelles";
import { cn } from "@/lib/utils";
import type { EcheanceRow } from "./echeances-client";

// Vue grille-mois du calendrier (RUN 7 usabilité). Server Component pur : aucune
// interaction ne nécessite du JS client (navigation mois précédent/suivant et « +N de
// plus » sont de simples liens `<Link>` qui rechargent la page avec un `searchParams`
// différent — cohérent avec la pagination liste existante, cf. `components/ui/
// pagination.tsx`). Chaque chip colore par STATUT (pas de badge-par-type existant dans
// `lib/libelles.ts` — réutiliser le système de badge existant plutôt qu'en inventer un
// nouveau), avec le libellé du TYPE en texte : jamais couleur seule.
//
// Choix documenté : cliquer un jour (ou son « +N de plus ») navigue vers la vue liste
// (mêmes filtres statut/type/client/q, triée par date) plutôt que d'ouvrir un Dialog —
// plus simple à implémenter proprement (pas de nouvel état client, pas de nouvelle
// requête pour peupler un dialog) et cohérent avec le pattern "liens serveur" déjà en
// place sur cette page. La liste n'a volontairement PAS de filtre par jour exact : la
// requête liste reste strictement inchangée (consigne RUN 7) — ajouter un filtre jour
// demanderait d'y toucher. Le jour cliqué reste trivialement repérable dans la liste
// triée par date.

const CHIPS_VISIBLES_PAR_JOUR = 3;

export function GrilleMois({
  echeances,
  annee,
  mois,
  hrefMois,
  hrefListe,
}: {
  echeances: EcheanceRow[];
  annee: number;
  mois: number;
  /** Construit l'URL de navigation vers un autre mois (préserve les filtres actifs). */
  hrefMois: (annee: number, mois: number) => string;
  /**
   * URL « voir en liste » (préserve les filtres statut/type/client/q actifs). Pas de
   * filtre par jour exact — même URL pour tous les jours, cf. commentaire d'en-tête.
   */
  hrefListe: string;
}) {
  const jours = joursGrilleMois(annee, mois);
  const parJour = regrouperParJour<EcheanceRow & EcheanceGroupable>(echeances);
  const precedent = moisAdjacent(annee, mois, -1);
  const suivant = moisAdjacent(annee, mois, 1);
  const nbTotal = echeances.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={hrefMois(precedent.annee, precedent.mois)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary"
            {...helpAttrs("Mois précédent", "Affiche la grille du mois précédent.")}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span
            id="grille-mois-titre"
            className="w-40 text-center text-sm font-semibold text-foreground"
          >
            {libelleMois(annee, mois)}
          </span>
          <Link
            href={hrefMois(suivant.annee, suivant.mois)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary"
            {...helpAttrs("Mois suivant", "Affiche la grille du mois suivant.")}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        <span className="text-sm text-muted-foreground">
          {nbTotal} échéance{nbTotal > 1 ? "s" : ""} ce mois
        </span>
      </div>

      {nbTotal === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucune échéance ce mois"
          hint="Changez de mois, ou modifiez les filtres actifs."
        />
      ) : null}

      {/* Grille masquée sur mobile (< 640px) : 7 colonnes deviennent illisibles sur un
          petit écran, et cette vue est desktop-first (staff fiduciaire, cf. apps/web/
          CLAUDE.md). On bascule vers un message qui renvoie à la vue liste. */}
      <div className="sm:hidden">
        <EmptyState
          icon={CalendarDays}
          title="Grille non disponible sur mobile"
          hint="La vue grille-mois est optimisée pour un écran large. Utilisez la vue liste sur mobile."
          action={
            <Link href={hrefListe} className="text-sm font-medium text-primary hover:underline">
              Voir la liste
            </Link>
          }
        />
      </div>

      <div className="hidden sm:block">
        <section
          className="grid grid-cols-7 overflow-hidden rounded-lg border border-border"
          aria-labelledby="grille-mois-titre"
        >
          {enTetesJoursSemaine().map((label) => (
            <div
              key={label}
              className="border-b border-border bg-secondary px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
          {jours.map((jour) => {
            const echeancesDuJour = parJour[jour.iso] ?? [];
            const visibles = echeancesDuJour.slice(0, CHIPS_VISIBLES_PAR_JOUR);
            const reste = echeancesDuJour.length - visibles.length;

            return (
              <div
                key={jour.iso}
                className={cn(
                  "min-h-24 border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                  !jour.dansLeMois && "bg-secondary/40",
                )}
              >
                <Link
                  href={hrefListe}
                  className={cn(
                    "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium hover:bg-secondary",
                    jour.dansLeMois ? "text-foreground" : "text-muted-foreground/50",
                    jour.aujourdhui && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  {...helpAttrs(
                    `Jour ${jour.iso}`,
                    "Affiche les échéances de ce jour dans la vue liste.",
                  )}
                >
                  {jour.jour}
                </Link>
                <div className="space-y-1">
                  {visibles.map((e) => {
                    const badge = badgeStatutEcheance(e.statut);
                    return (
                      <Link
                        key={e.id}
                        href={`/app/clients/${e.client_id}`}
                        className="block truncate"
                        {...helpAttrs(
                          `${libelleTypeEcheance(e.type)} — ${e.client_nom ?? ""}`,
                          `${e.libelle} · Statut : ${badge.label}. Ouvre le dossier client.`,
                        )}
                      >
                        <Badge famille={badge.famille} className="w-full justify-start truncate">
                          {libelleTypeEcheance(e.type)}
                        </Badge>
                      </Link>
                    );
                  })}
                  {reste > 0 && (
                    <Link
                      href={hrefListe}
                      className="block truncate text-[11px] font-medium text-primary hover:underline"
                      {...helpAttrs(
                        `${reste} échéance(s) de plus le ${jour.iso}`,
                        "Affiche toutes les échéances de ce jour dans la vue liste.",
                      )}
                    >
                      +{reste} de plus
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
