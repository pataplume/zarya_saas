import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* Fil d'Ariane */}
      <Skeleton className="mb-4 h-4 w-48 max-w-full" />

      {/* En-tête dossier */}
      <header className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-8 w-1/3 max-w-full" />
            <Skeleton className="h-4 w-2/3 max-w-full bg-slate-100" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["s1", "s2", "s3"].map((id) => (
            <Skeleton key={id} className="h-6 w-20 rounded-md bg-slate-100" />
          ))}
        </div>
      </header>

      {/* Barre d'ancres */}
      <nav className="mb-6 flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
        {["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((id) => (
          <Skeleton key={id} className="h-8 w-20 rounded-lg bg-slate-100" />
        ))}
      </nav>

      {/* Vue d'ensemble — métriques */}
      <section>
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["m1", "m2", "m3", "m4"].map((id) => (
            <div key={id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <Skeleton className="h-3 w-28 max-w-full bg-slate-100" />
              <Skeleton className="mt-2 h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-24 max-w-full bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-3 w-24 bg-slate-100" />
          <Skeleton className="mt-2 h-7 w-16" />
        </div>
      </section>

      {/* Sections suivantes (dossier, documents…) */}
      <Skeleton className="mt-10 h-64 w-full rounded-xl bg-slate-100" />
      <Skeleton className="mt-8 h-48 w-full rounded-xl bg-slate-100" />
    </div>
  );
}
