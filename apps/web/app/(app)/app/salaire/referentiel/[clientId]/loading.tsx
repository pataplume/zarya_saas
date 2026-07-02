import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-5xl">
      {/* Titre + description */}
      <Skeleton className="h-8 w-2/3 max-w-full" />
      <Skeleton className="mt-2 h-4 w-full bg-slate-100" />
      <Skeleton className="mt-1 h-4 w-3/4 max-w-full bg-slate-100" />

      {/* Cartes employés */}
      <div className="mt-6 space-y-3">
        {["e1", "e2", "e3", "e4"].map((id) => (
          <div key={id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-36 max-w-full" />
                <Skeleton className="h-4 w-24 bg-slate-100" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
              <Skeleton className="h-3 w-28 bg-slate-100" />
              <Skeleton className="h-3 w-20 bg-slate-100" />
              <Skeleton className="h-3 w-24 bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
