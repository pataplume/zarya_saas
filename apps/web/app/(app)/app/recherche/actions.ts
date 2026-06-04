"use server";

// H4b — Recherche conversationnelle (RAG) : server action. auth + scope cabinet. answerQuestion
// orchestre intent → récupération (scopée cabinet) → génération sourcée anti-injection → trace.
import { getCurrentUser } from "@zarya/auth";
import { and, db, eq, searchRequete } from "@zarya/db";
import { type AnswerSource, answerQuestion } from "@zarya/extraction";
import { z } from "zod";

export type RechercheState = {
  error?: string;
  answer?: string;
  sources?: AnswerSource[];
  intent?: string;
  requete_id?: string | null;
};

const QuestionSchema = z.object({ question: z.string().min(3).max(1000) });

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
    return {
      answer: res.answer,
      sources: res.sources,
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
