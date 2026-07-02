import { type FamilleBadge, styleFamille } from "@/lib/libelles";
import { cn } from "@/lib/utils";

type BadgeProps = React.ComponentProps<"span"> & {
  /** Famille sémantique de `lib/libelles` — source unique des couleurs de statut. */
  famille?: FamilleBadge;
};

/**
 * Badge de statut ZARYA. La couleur vient TOUJOURS d'une famille (`lib/libelles`),
 * jamais d'une palette locale — et jamais couleur seule (passer symbole + texte en enfant).
 */
function Badge({ famille = "neutre", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styleFamille(famille),
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
