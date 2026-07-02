import { cn } from "@/lib/utils";

/**
 * Primitives de table ZARYA. `dense` réduit le padding vertical (files de travail
 * type Linear) ; les montants utilisent `tabular-nums` pour l'alignement des chiffres.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-slate-50", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-slate-100", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-slate-50", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  dense,
  ...props
}: React.ComponentProps<"td"> & { dense?: boolean }) {
  return (
    <td
      className={cn("px-4 text-sm text-foreground", dense ? "py-1.5" : "py-3", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
