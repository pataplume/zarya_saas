import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: React.ReactNode;
  /** Sous-titre optionnel (une phrase, pas un paragraphe). */
  description?: React.ReactNode;
  /** Zone d'actions à droite (boutons, filtres compacts). */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * En-tête de page unifié du dashboard — titre tendu + description + actions,
 * séparé du contenu par une hairline. Server-safe.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border pb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
