"use server";

// H4b — Recherche conversationnelle (RAG) : server action. auth + scope cabinet. answerQuestion
// orchestre intent → récupération (scopée cabinet) → génération sourcée anti-injection → trace.
import { getCurrentUser } from "@zarya/auth";
import { and, db, document, eq, inArray, isNull, searchRequete } from "@zarya/db";
import { type AnswerSource, answerQuestion } from "@zarya/extraction";
import { z } from "zod";

// Source enrichie du libellé du document (pour affichage — lien cliquable vers la fiche
// document, cf. RUN 6 « Sources de recherche cliquables »). Le libellé est résolu par une
// requête SÉPARÉE, scopée cabinet_id (jamais depuis l'input utilisateur) : si un document a
// été archivé/supprimé entre l'indexation et la requête, `document_libelle` est absent et
// l'UI retombe sur l'UUID tronqué (pas de lien mort silencieux).
export type RechercheSource = AnswerSource & { document_libelle?: string };

export type RechercheState = {
  error?: string;
  answer?: string;
  sources?: RechercheSource[];
  intent?: string;
  requete_id?: string | null;
};

const QuestionSchema = z.object({ question: z.string().min(3).max(1000) });

/**
 * Résout le libellé lisible des documents cités en source, STRICTEMENT scopé
 * (cabinet_id, id IN sources). Ne fuit jamais un document d'un autre cabinet : un id qui
 * n'appartient pas au cabinet courant est simplement absent du résultat.
 */
async function resolveLibellesDocuments(
  cabinet_id: string,
  documentIds: string[],
): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map();
  const rows = await db
    .select({ id: document.id, libelle: document.libelle })
    .from(document)
    .where(
      and(
        eq(document.cabinet_id, cabinet_id),
        inArray(document.id, documentIds),
        // Un document archivé ne doit pas produire de libellé/lien vivant (cf. commentaire
        // ci-dessus) : retrieveChunks l'exclut déjà en amont, ceci est une défense en profondeur.
        isNull(document.archived_at),
      ),
    );
  return new Map(rows.map((r) => [r.id, r.libelle]));
}

export async function rechercheAction(
  _prev: RechercheState,
  formData: FormData,
): Promise<RechercheState> {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!user || !cabinet_id) return { error: "Non autorisé." };

  const parsed = QuestionSchema.safeParse({ question: formData.get("question") });
  if (!parsed.success) return { error: "Question trop courte ou invalide." };

  try {
    const res = await answerQuestion({
      cabinet_id,
      question: parsed.data.question,
      utilisateur_id: user.id,
    });
    const libelles = await resolveLibellesDocuments(
      cabinet_id,
      res.sources.map((s) => s.document_id),
    );
    const sources: RechercheSource[] = res.sources.map((s) => {
      const libelle = libelles.get(s.document_id);
      return libelle ? { ...s, document_libelle: libelle } : s;
    });
    return {
      answer: res.answer,
      sources,
      intent: res.intent,
      requete_id: res.requete_id,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de la recherche." };
  }
}

const FeedbackSchema = z.object({
  requete_id: z.string().uuid(),
  utile: z.enum(["true", "false"]),
});

/** Feedback 👍/👎 sur une réponse : met à jour search.requete.utile (scopé cabinet). */
export async function feedbackRechercheAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!user || !cabinet_id) return { error: "Non autorisé." };

  const parsed = FeedbackSchema.safeParse({
    requete_id: formData.get("requete_id"),
    utile: formData.get("utile"),
  });
  if (!parsed.success) return { error: "Feedback invalide." };

  await db
    .update(searchRequete)
    .set({ utile: parsed.data.utile === "true" })
    .where(
      and(eq(searchRequete.id, parsed.data.requete_id), eq(searchRequete.cabinet_id, cabinet_id)),
    );
  return { ok: true };
}
