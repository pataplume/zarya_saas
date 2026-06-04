"use client";

// H4b — Interface de recherche conversationnelle (RAG). Formulaire + réponse sourcée + feedback.
// useActionState ; sources visibles (UX ZARYA §5 traçabilité). Citations [N] → liste des sources.
import { useActionState } from "react";
import {
  feedbackRechercheAction,
  type RechercheState,
  rechercheAction,
} from "@/app/(app)/app/recherche/actions";

const INITIAL: RechercheState = {};

const INTENT_LABEL: Record<string, string> = {
  factuelle: "Question factuelle",
  recherche: "Recherche de documents",
  agregation: "Agrégation / calcul",
  synthese: "Synthèse",
  hors_scope: "Hors périmètre",
};

export function RechercheClient() {
  const [state, action, pending] = useActionState(rechercheAction, INITIAL);

  return (
    <div className="space-y-6">
      <form action={action} className="flex gap-2">
        <input
          type="text"
          name="question"
          required
          minLength={3}
          placeholder="Posez une question sur vos documents…"
          aria-label="Question"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Recherche…" : "Rechercher"}
        </button>
      </form>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      {state.answer && (
        <article className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          {state.intent && (
            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {INTENT_LABEL[state.intent] ?? state.intent}
            </span>
          )}
          <p className="whitespace-pre-wrap text-sm text-gray-900">{state.answer}</p>

          {state.sources && state.sources.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <h3 className="text-xs font-medium text-gray-500">Sources</h3>
              <ul className="mt-1 space-y-1 text-xs text-gray-600">
                {state.sources.map((s) => (
                  <li key={s.chunk_id}>
                    <span className="font-medium">[{s.n}]</span> document{" "}
                    {s.document_id.slice(0, 8)}…
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.requete_id && <Feedback requeteId={state.requete_id} />}
        </article>
      )}
    </div>
  );
}

function Feedback({ requeteId }: { requeteId: string }) {
  const [state, action, pending] = useActionState(feedbackRechercheAction, {});
  if (state.ok) return <p className="text-xs text-green-600">Merci pour votre retour.</p>;
  return (
    <form action={action} className="flex items-center gap-2 border-t border-gray-100 pt-3">
      <input type="hidden" name="requete_id" value={requeteId} />
      <span className="text-xs text-gray-500">Cette réponse vous a-t-elle aidé ?</span>
      <button
        type="submit"
        name="utile"
        value="true"
        disabled={pending}
        className="rounded px-2 py-0.5 text-sm hover:bg-gray-100 disabled:opacity-50"
        aria-label="Utile"
      >
        👍
      </button>
      <button
        type="submit"
        name="utile"
        value="false"
        disabled={pending}
        className="rounded px-2 py-0.5 text-sm hover:bg-gray-100 disabled:opacity-50"
        aria-label="Pas utile"
      >
        👎
      </button>
    </form>
  );
}
