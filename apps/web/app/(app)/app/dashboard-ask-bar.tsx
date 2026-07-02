"use client";

import { CornerDownLeft, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Barre « demande à ZARYA » du dashboard (surface de commande façon co-pilote).
 * Route la question vers la recherche RAG existante (/app/recherche), qui
 * exécute la réponse sourcée et scopée cabinet. Pas de nouvelle logique IA ici.
 */
export function DashboardAskBar() {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3) return;
    router.push(`/app/recherche?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      onSubmit={envoyer}
      className="group flex items-center gap-3 rounded-xl border border-slate-300 bg-card px-4 py-3 shadow-card transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-ring"
    >
      <Sparkles className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Demande à ZARYA — « quelles échéances TVA arrivent cette semaine ? »"
        aria-label="Demander à ZARYA"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      {question.trim().length >= 3 ? (
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Demander
          <CornerDownLeft className="size-3.5" aria-hidden />
        </button>
      ) : (
        <kbd className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">
          Entrée
        </kbd>
      )}
    </form>
  );
}
