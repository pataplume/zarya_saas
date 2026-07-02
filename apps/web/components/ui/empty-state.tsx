import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** Une phrase d'aide : quoi faire pour que cet écran se remplisse. */
  hint?: string;
  /** Action optionnelle (bouton/lien). */
  action?: React.ReactNode;
  className?: string;
};

/** État vide dessiné : icône dans une pastille douce + titre + piste d'action. */
export function EmptyState({ icon: Icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-input bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
