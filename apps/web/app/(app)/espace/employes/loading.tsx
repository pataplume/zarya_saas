import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl">
      {/* Titre + sous-titre */}
      <Skeleton className="h-8 w-48 max-w-full" />
      <Skeleton className="mt-2 h-4 w-full bg-slate-100" />
      <Skeleton className="mt-1 h-4 w-2/3 max-w-full bg-slate-100" />

      {/* Tableau employés */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex gap-4 bg-gray-50 px-4 py-2.5">
          {["nom", "fonction", "taux", "avs", "iban"].map((id) => (
            <Skeleton key={id} className="h-4 w-16 max-w-full bg-slate-100" />
          ))}
        </div>
        <div className="divide-y divide-gray-100">
          {["e1", "e2", "e3", "e4"].map((id) => (
            <div key={id} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/4 max-w-full" />
              <Skeleton className="h-4 w-20 bg-slate-100" />
              <Skeleton className="h-4 w-12 bg-slate-100" />
              <Skeleton className="h-4 w-16 bg-slate-100" />
              <Skeleton className="h-4 w-16 bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
