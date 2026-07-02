import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-2xl">
      {/* Titre */}
      <Skeleton className="h-6 w-40 max-w-full" />

      {/* Mon profil */}
      <Skeleton className="mt-6 h-4 w-24 bg-slate-100" />
      <div className="mt-2 rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="space-y-5">
          {["nom", "email", "mot-de-passe"].map((id) => (
            <div key={id} className="space-y-2">
              <Skeleton className="h-4 w-28 max-w-full bg-slate-100" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-5 h-8 w-32 rounded-md" />
      </div>

      {/* Mes données personnelles */}
      <Skeleton className="mt-8 h-4 w-48 bg-slate-100" />
      <div className="mt-2 rounded-lg border border-border bg-card p-5 shadow-card">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="mt-2 h-4 w-full bg-slate-100" />
        <Skeleton className="mt-1 h-4 w-3/4 max-w-full bg-slate-100" />
        <Skeleton className="mt-3 h-8 w-44 rounded-md bg-slate-100" />
      </div>

      {/* Supprimer mon accès */}
      <div className="mt-4 rounded-lg border border-border bg-card p-5 shadow-card">
        <Skeleton className="h-4 w-44 max-w-full" />
        <Skeleton className="mt-2 h-4 w-full bg-slate-100" />
        <Skeleton className="mt-1 h-4 w-2/3 max-w-full bg-slate-100" />
        <Skeleton className="mt-3 h-8 w-44 rounded-md bg-slate-100" />
      </div>
    </section>
  );
}
