import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-2xl">
      {/* Salutation */}
      <Skeleton className="h-6 w-40 max-w-full" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-full bg-slate-100" />

      {/* À faire */}
      <Skeleton className="mt-6 h-5 w-16" />
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {["docs", "validations"].map((id) => (
          <div key={id} className="rounded-lg border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-4 w-32 max-w-full bg-slate-100" />
              </div>
            </div>
            <Skeleton className="mt-3 h-3 w-28 max-w-full bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Accès rapides */}
      <Skeleton className="mt-8 h-5 w-28" />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {["documents", "validations", "entreprise", "employes", "parametres"].map((id) => (
          <div key={id} className="rounded-lg border border-border bg-card p-4 shadow-card">
            <Skeleton className="h-4 w-3/4 max-w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
