import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-2xl">
      {/* Titre + sous-titre */}
      <Skeleton className="h-8 w-40 max-w-full" />
      <Skeleton className="mt-2 h-4 w-3/4 max-w-full bg-slate-100" />

      {/* Liste des périodes */}
      <div className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {["p1", "p2", "p3", "p4"].map((id) => (
          <div key={id} className="flex items-center justify-between gap-4 px-5 py-3">
            <Skeleton className="h-4 w-32 max-w-full" />
            <Skeleton className="h-3 w-20 shrink-0 bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
