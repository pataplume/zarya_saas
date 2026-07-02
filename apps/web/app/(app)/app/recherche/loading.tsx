import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-3xl">
      {/* Titre + sous-titre */}
      <Skeleton className="h-8 w-40 max-w-full" />
      <Skeleton className="mt-2 h-4 w-full bg-slate-100" />
      <Skeleton className="mt-1 h-4 w-2/3 max-w-full bg-slate-100" />

      {/* Barre de recherche */}
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-28 shrink-0 rounded-lg" />
      </div>

      {/* Zone de réponse */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <Skeleton className="h-4 w-full bg-slate-100" />
        <Skeleton className="mt-2 h-4 w-5/6 max-w-full bg-slate-100" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-full bg-slate-100" />
      </div>
    </section>
  );
}
