import { type FamilleBadge, styleFamille } from "@/lib/libelles";
import { cn } from "@/lib/utils";

type BadgeProps = React.ComponentProps<"span"> & {
  /** Famille sémantique de `lib/libelles` — source unique des couleurs de statut. */
  famille?: FamilleBadge;
};

/**
 * Badge de statut ZARYA — rectangle net (pas de pilule), symbole + texte,
 * jamais couleur seule. La couleur vient TOUJOURS d'une famille (`lib/libelles`).
 */
function Badge({ famille = "neutre", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset",
        styleFamille(famille),
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
