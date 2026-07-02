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
      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 transition-colors focus-within:border-indigo-400/60 focus-within:bg-white/[0.06] focus-within:ring-1 focus-within:ring-indigo-400/40"
    >
      <Sparkles className="size-5 shrink-0 text-indigo-300" strokeWidth={1.75} aria-hidden />
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Demande à ZARYA — « quelles échéances TVA arrivent cette semaine ? »"
        aria-label="Demander à ZARYA"
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
      />
      {question.trim().length >= 3 ? (
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1 text-[13px] font-medium text-white transition-colors hover:bg-indigo-400"
        >
          Demander
          <CornerDownLeft className="size-3.5" aria-hidden />
        </button>
      ) : (
        <kbd className="hidden shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 sm:inline">
          Entrée
        </kbd>
      )}
    </form>
  );
}
