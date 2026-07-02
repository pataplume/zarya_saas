import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      {/* Titre + compteur */}
      <Skeleton className="mb-1 h-8 w-72 max-w-full" />
      <Skeleton className="mb-6 h-4 w-56 max-w-full bg-slate-100" />

      {/* Cartes relances en attente */}
      <div className="space-y-4">
        {["rel1", "rel2", "rel3"].map((id) => (
          <div key={id} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-5 w-1/3 max-w-full" />
              <Skeleton className="h-5 w-24 rounded-full bg-slate-100" />
            </div>
            <Skeleton className="mt-3 h-4 w-2/3 max-w-full bg-slate-100" />
            <Skeleton className="mt-2 h-4 w-1/2 max-w-full bg-slate-100" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
