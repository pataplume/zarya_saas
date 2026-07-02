import type { CompletudeResult } from "@/lib/completude-client";

// Lot 3 (ADR 0025) — Assistant de complétude affiché sur le dossier client. Server Component
// pur (aucune interactivité) : score + checklist « ce qui manque pour activer tel service ».
// NON BLOQUANT : c'est un guide, jamais une barrière (ADR 0025 §1). Les items pointent vers
// l'ancre de la section à compléter (#identite, #services, #adresses, #contacts).

function couleurScore(score: number): { barre: string; texte: string } {
  if (score >= 90) return { barre: "bg-emerald-500", texte: "text-emerald-700" };
  if (score >= 60) return { barre: "bg-amber-500", texte: "text-amber-700" };
  return { barre: "bg-rose-500", texte: "text-rose-700" };
}

export function CompletudeSection({ completude }: { completude: CompletudeResult }) {
  const { score, manquants, a_bloquants } = completude;
  const couleur = couleurScore(score);
  const bloquants = manquants.filter((m) => m.severite === "bloquant");
  const recommandes = manquants.filter((m) => m.severite === "recommande");

  return (
    <section id="completude" className="mt-10 scroll-mt-20">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Complétude du dossier
      </h2>
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        {/* Score + barre de progression */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-slate-600">
              Ce dossier est complété à{" "}
              <span className={`font-semibold ${couleur.texte}`}>{score}%</span>.
            </p>
            <span className={`text-lg font-bold ${couleur.texte}`}>{score}/100</span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Complétude du dossier"
          >
            <div
              className={`h-full rounded-full ${couleur.barre}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {manquants.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            ● Rien ne manque : les échéances peuvent être générées pour tous les services activés.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Bloquants : ce qui empêche de générer des échéances */}
            {bloquants.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                  ▲ À compléter pour générer les échéances
                </h3>
                <ul className="space-y-2">
                  {bloquants.map((item) => (
                    <li
                      key={item.cle}
                      className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2"
                    >
                      <span className="text-sm text-slate-700">{item.libelle}</span>
                      <a
                        href={item.ancre}
                        className="shrink-0 rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                      >
                        Compléter
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommandés : qualité du dossier (jamais bloquant) */}
            {recommandes.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  ◐ Recommandé
                </h3>
                <ul className="space-y-2">
                  {recommandes.map((item) => (
                    <li
                      key={item.cle}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <span className="text-sm text-slate-600">{item.libelle}</span>
                      <a
                        href={item.ancre}
                        className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Compléter
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Rappel non bloquant : la saisie reste libre. */}
        {a_bloquants && (
          <p className="mt-4 text-xs text-slate-400">
            Vous pouvez enregistrer le dossier à tout moment : ces éléments ne sont pas
            obligatoires, mais certains services n'enverront pas d'échéance tant qu'ils manquent.
          </p>
        )}
      </div>
    </section>
  );
}
