import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête salutation */}
      <div className="mb-8">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full bg-slate-100" />
      </div>

      {/* Carte cabinet */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-6 w-1/3 max-w-full" />
            <Skeleton className="h-4 w-2/3 max-w-full bg-slate-100" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="mt-5 flex gap-6 border-t border-slate-100 pt-4">
          {["membres", "clients", "documents"].map((id) => (
            <div key={id} className="space-y-1.5">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-3 w-24 bg-slate-100" />
            </div>
          ))}
        </div>
      </div>

      {/* À traiter — 5 tuiles */}
      <section className="mb-8">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["documents", "factures", "echeances", "relances", "salaires"].map((id) => (
            <div
              key={id}
              className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5"
            >
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-4 w-36 max-w-full" />
                <Skeleton className="h-3 w-24 max-w-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules — 6 cartes */}
      <div>
        <Skeleton className="mb-4 h-5 w-20" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["clients", "documents", "calendrier", "factures", "salaires", "recherche"].map((id) => (
            <div key={id} className="rounded-xl border border-slate-200 bg-white p-5">
              <Skeleton className="mb-3 size-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-3 w-3/4 max-w-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
