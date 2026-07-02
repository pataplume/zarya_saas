import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type PaginationProps = {
  /** Page courante (1-indexée). */
  page: number;
  /** Nombre total d'items (pour calculer le nombre de pages). */
  total: number;
  /** Taille de page. */
  parPage: number;
  /**
   * Construit l'URL d'une page en préservant les autres searchParams.
   * Ex. (p) => `/app/documents?tab=emails&page=${p}`
   */
  hrefPour: (page: number) => string;
};

/**
 * Pagination serveur ZARYA : liens (pas de JS) pilotés par `?page=` —
 * l'état survit au refresh et au partage d'URL.
 */
export function Pagination({ page, total, parPage, hrefPour }: PaginationProps) {
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  if (nbPages <= 1) return null;

  const precedent = Math.max(1, page - 1);
  const suivant = Math.min(nbPages, page + 1);
  const lienDesactive = "pointer-events-none opacity-40";

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <span className="tabular-nums">
        Page {page} sur {nbPages} · {total} élément{total > 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-1">
        <Link
          href={hrefPour(precedent)}
          aria-disabled={page <= 1}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary",
            page <= 1 && lienDesactive,
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Précédent
        </Link>
        <Link
          href={hrefPour(suivant)}
          aria-disabled={page >= nbPages}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary",
            page >= nbPages && lienDesactive,
          )}
        >
          Suivant
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
