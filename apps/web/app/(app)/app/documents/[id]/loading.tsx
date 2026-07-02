import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* Fil d'Ariane */}
      <Skeleton className="mb-4 h-4 w-56 max-w-full" />

      {/* En-tête fiche document */}
      <header className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-8 w-1/2 max-w-full" />
            <Skeleton className="h-4 w-2/3 max-w-full bg-slate-100" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-8 w-40 rounded-lg" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {["meta1", "meta2", "meta3"].map((id) => (
            <div key={id} className="space-y-1.5">
              <Skeleton className="h-3 w-24 max-w-full bg-slate-100" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </header>

      {/* Grille des champs extraits */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="mt-2 h-3 w-2/3 max-w-full bg-slate-100" />
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => (
            <div
              key={id}
              className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"
            >
              <Skeleton className="h-4 w-28 max-w-full bg-slate-100" />
              <Skeleton className="h-4 w-24 max-w-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Liens transverses */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Skeleton className="h-8 w-40 rounded-lg bg-slate-100" />
        <Skeleton className="h-8 w-36 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
