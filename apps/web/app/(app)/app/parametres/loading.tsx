import { Skeleton } from "@/components/ui/skeleton";

// Le layout parent affiche déjà l'en-tête « Paramètres » et les onglets réels ;
// ce fallback ne mime que le contenu de l'onglet (formulaire).
export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Skeleton className="h-5 w-40 max-w-full" />
        <div className="mt-5 space-y-5">
          {["champ1", "champ2", "champ3", "champ4"].map((id) => (
            <div key={id} className="space-y-2">
              <Skeleton className="h-4 w-32 max-w-full bg-slate-100" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Skeleton className="h-5 w-48 max-w-full" />
        <div className="mt-5 space-y-5">
          {["champ5", "champ6"].map((id) => (
            <div key={id} className="space-y-2">
              <Skeleton className="h-4 w-28 max-w-full bg-slate-100" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
