import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl">
      {/* Titre + sous-titre */}
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="mt-2 h-4 w-3/4 max-w-full bg-slate-100" />

      {/* Tableau matrice employés × éléments */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex gap-4 bg-gray-50 px-4 py-2.5">
          {["employe", "el1", "el2", "el3"].map((id) => (
            <Skeleton key={id} className="h-4 w-20 max-w-full bg-slate-100" />
          ))}
        </div>
        <div className="divide-y divide-gray-100">
          {["r1", "r2", "r3", "r4"].map((id) => (
            <div key={id} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/3 max-w-full" />
              <Skeleton className="h-4 w-14 bg-slate-100" />
              <Skeleton className="h-4 w-14 bg-slate-100" />
              <Skeleton className="h-4 w-14 bg-slate-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Formulaires de saisie / validation */}
      <div className="mt-6 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-slate-100" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </section>
  );
}
