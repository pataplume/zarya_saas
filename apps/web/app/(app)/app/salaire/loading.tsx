import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-4xl">
      {/* Titre + sous-titre */}
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full bg-slate-100" />

      {/* Barre d'actions (campagne + lien relances) */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-44 max-w-full rounded-md" />
        <Skeleton className="h-4 w-32 bg-slate-100" />
      </div>

      {/* 5 cartes KPI */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {["total", "validees", "a-valider", "en-retard", "exportees"].map((id) => (
          <div key={id} className="rounded-lg border border-slate-200 bg-white p-4">
            <Skeleton className="h-7 w-10" />
            <Skeleton className="mt-2 h-3 w-16 bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Tableau des périodes */}
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex gap-4 bg-slate-50 px-4 py-2.5">
          {["client", "statut", "employes", "changements", "pieces", "limite"].map((id) => (
            <Skeleton key={id} className="h-4 w-20 max-w-full bg-slate-100" />
          ))}
        </div>
        <div className="divide-y divide-slate-100">
          {["r1", "r2", "r3", "r4", "r5"].map((id) => (
            <div key={id} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/4 max-w-full" />
              <Skeleton className="h-5 w-20 rounded-full bg-slate-100" />
              <Skeleton className="h-4 w-12 bg-slate-100" />
              <Skeleton className="h-4 w-12 bg-slate-100" />
              <Skeleton className="h-4 w-12 bg-slate-100" />
              <Skeleton className="h-4 w-20 bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
