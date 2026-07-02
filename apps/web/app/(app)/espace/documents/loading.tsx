import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl">
      {/* Titre + sous-titre */}
      <Skeleton className="h-6 w-48 max-w-full" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-full bg-slate-100" />

      {/* Zone de dépôt */}
      <div className="mt-6 rounded-lg border-2 border-dashed border-input bg-card p-8">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-48 max-w-full bg-slate-100" />
        </div>
      </div>

      {/* Liste des documents transmis */}
      <Skeleton className="mt-8 h-5 w-44" />
      <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-card shadow-card">
        {["d1", "d2", "d3", "d4"].map((id) => (
          <div key={id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2 max-w-full" />
              <Skeleton className="h-3 w-1/3 max-w-full bg-slate-100" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0 rounded-md bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
