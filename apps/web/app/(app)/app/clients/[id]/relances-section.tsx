"use client";

import type { CibleRelance } from "@zarya/calendar";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  DocumentAttenduRow,
  PauseActiveRow,
  RelanceAVenirRow,
  RelanceTimelineRow,
} from "@/lib/relances-dossier-data";
import {
  createDocumentAttenduAction,
  type DocumentAttenduActionState,
  supprimerDocumentAttenduAction,
} from "../documents-attendus/actions";
import {
  creerRelanceAction,
  envoyerRelanceDossierAction,
  pauserRelancesClientAction,
  reprendreRelancesClientAction,
} from "../relances/actions";

// Lot 4 (ADR 0025) — Section « Documents attendus & relances » du dossier client.
// Mode A : tout envoi de relance passe par une CONFIRMATION explicite (jamais auto).

interface ServiceOption {
  id: string;
  type: string;
}

export interface RelancesSectionData {
  clientId: string;
  documents: DocumentAttenduRow[];
  timeline: RelanceTimelineRow[];
  aVenir: RelanceAVenirRow[];
  pause: PauseActiveRow | null;
  services: ServiceOption[];
}

const FREQUENCES = [
  ["mensuelle", "Mensuelle"],
  ["trimestrielle", "Trimestrielle"],
  ["semestrielle", "Semestrielle"],
  ["annuelle", "Annuelle"],
  ["ponctuelle", "Ponctuelle"],
] as const;

const CATEGORIES = [
  ["bancaire", "Bancaire"],
  ["fiscal", "Fiscal"],
  ["salaire", "Salaire"],
  ["commercial", "Commercial"],
  ["administratif", "Administratif"],
] as const;

const STATUT_RELANCE_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  lue: "Lue",
  repondue: "Répondue",
  sans_reponse: "Sans réponse",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const CARD = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
const INPUT =
  "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const BTN_PRIMARY =
  "inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50";

export function RelancesSection({
  data,
  peutEcrire,
}: {
  data: RelancesSectionData;
  peutEcrire: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);
  const [showDocForm, setShowDocForm] = useState(false);

  function notify(text: string) {
    setMessage(text);
  }

  function relancer(cible: CibleRelance) {
    startTransition(async () => {
      const res = await creerRelanceAction(cible);
      notify(
        res.success
          ? "Brouillon de relance créé — à valider dans la file des relances."
          : (res.error ?? "Erreur."),
      );
      router.refresh();
    });
  }

  function envoyer(relanceId: string) {
    startTransition(async () => {
      const res = await envoyerRelanceDossierAction(relanceId);
      notify(res.success ? "Relance envoyée." : (res.error ?? "Erreur."));
      setConfirmSend(null);
      router.refresh();
    });
  }

  function creerDocument(formData: FormData) {
    formData.set("client_id", data.clientId);
    startTransition(async () => {
      const res: DocumentAttenduActionState = await createDocumentAttenduAction({}, formData);
      notify(res.success ? "Document attendu ajouté." : (res.error ?? "Erreur."));
      if (res.success) setShowDocForm(false);
      router.refresh();
    });
  }

  function supprimerDocument(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await supprimerDocumentAttenduAction({}, fd);
      notify(res.success ? "Document retiré." : (res.error ?? "Erreur."));
      router.refresh();
    });
  }

  function pauser(formData: FormData) {
    formData.set("client_id", data.clientId);
    startTransition(async () => {
      const res = await pauserRelancesClientAction({}, formData);
      notify(res.success ? "Relances en pause." : (res.error ?? "Erreur."));
      router.refresh();
    });
  }

  function reprendre(pauseId: string) {
    startTransition(async () => {
      const res = await reprendreRelancesClientAction(pauseId);
      notify(res.success ? "Relances reprises." : (res.error ?? "Erreur."));
      router.refresh();
    });
  }

  return (
    <section id="relances" className="mt-10 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Documents attendus & relances
        </h2>
      </div>

      {message && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"
        >
          {message}
        </div>
      )}

      {/* Pause active */}
      {data.pause ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            ⏸ Relances en pause du {formatDate(data.pause.date_debut)} au{" "}
            {formatDate(data.pause.date_fin)}
            {data.pause.motif ? ` — ${data.pause.motif}` : ""}
          </span>
          {peutEcrire && (
            <button
              type="button"
              className={BTN_GHOST}
              disabled={pending}
              onClick={() => data.pause && reprendre(data.pause.id)}
            >
              Reprendre
            </button>
          )}
        </div>
      ) : (
        peutEcrire && <PauseForm onSubmit={pauser} pending={pending} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Documents attendus */}
        <div className={CARD}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Documents attendus
            </h3>
            {peutEcrire && (
              <button
                type="button"
                className={BTN_GHOST}
                disabled={pending}
                onClick={() => setShowDocForm((s) => !s)}
              >
                {showDocForm ? "Annuler" : "+ Ajouter"}
              </button>
            )}
          </div>

          {showDocForm && peutEcrire && (
            <form
              action={creerDocument}
              className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <input
                name="type_document"
                required
                maxLength={160}
                placeholder="Type de document (ex. Relevé bancaire)"
                className={INPUT}
              />
              <div className="grid grid-cols-2 gap-2">
                <select name="frequence" className={INPUT} defaultValue="mensuelle">
                  {FREQUENCES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <select name="categorie" className={INPUT} defaultValue="">
                  <option value="">Catégorie…</option>
                  {CATEGORIES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select name="service_id" className={INPUT} defaultValue="">
                  <option value="">Sans service</option>
                  {data.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.type}
                    </option>
                  ))}
                </select>
                <input
                  name="deadline_jours_apres_periode"
                  type="number"
                  min={0}
                  max={366}
                  placeholder="Délai (jours)"
                  className={INPUT}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="obligatoire" defaultChecked /> Obligatoire
              </label>
              <button type="submit" className={BTN_PRIMARY} disabled={pending}>
                Ajouter le document
              </button>
            </form>
          )}

          {data.documents.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun document attendu configuré.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.documents.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-800">{d.type_document}</span>
                      {d.obligatoire && (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                          Obligatoire
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {d.frequence}
                      {d.categorie ? ` · ${d.categorie}` : ""}
                      {d.deadline_jours_apres_periode != null
                        ? ` · délai ${d.deadline_jours_apres_periode} j`
                        : ""}
                      {d.service_type ? ` · ${d.service_type}` : ""}
                    </p>
                  </div>
                  {peutEcrire && (
                    <button
                      type="button"
                      className={BTN_GHOST}
                      disabled={pending}
                      onClick={() => supprimerDocument(d.id)}
                    >
                      Retirer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Relances à venir */}
        <div className={CARD}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Relances à venir
          </h3>
          {!peutEcrire && (
            <p className="mb-2 text-xs text-slate-400">Lecture seule — actions réservées.</p>
          )}
          {data.aVenir.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune échéance imminente ou en retard.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.aVenir.map((a) => (
                <li key={a.echeance_id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{a.libelle}</p>
                      <p className="text-xs text-slate-500">
                        {a.type} · échéance {formatDate(a.date_echeance)}
                        {a.statut === "en_retard" ? " · en retard" : " · imminente"}
                        {a.relances_envoyees > 0
                          ? ` · ${a.relances_envoyees} relance${a.relances_envoyees > 1 ? "s" : ""} envoyée${a.relances_envoyees > 1 ? "s" : ""}`
                          : ""}
                      </p>
                      {a.escalade_max_atteinte && (
                        <p className="text-xs font-medium text-amber-600">
                          Escalade max atteinte ({a.relances_envoyees} relances) — relance manuelle
                          uniquement
                        </p>
                      )}
                    </div>
                    {peutEcrire &&
                      (a.relance_id ? (
                        confirmSend === a.relance_id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              className={BTN_PRIMARY}
                              disabled={pending}
                              onClick={() => a.relance_id && envoyer(a.relance_id)}
                            >
                              Confirmer l'envoi
                            </button>
                            <button
                              type="button"
                              className={BTN_GHOST}
                              disabled={pending}
                              onClick={() => setConfirmSend(null)}
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={BTN_GHOST}
                            disabled={pending}
                            onClick={() => a.relance_id && setConfirmSend(a.relance_id)}
                          >
                            Valider & envoyer…
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className={BTN_GHOST}
                          disabled={pending}
                          onClick={() => relancer({ kind: "echeance", echeanceId: a.echeance_id })}
                        >
                          Préparer une relance
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {peutEcrire && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                className={BTN_GHOST}
                disabled={pending}
                onClick={() => relancer({ kind: "client", clientId: data.clientId })}
              >
                Relancer le client (documents manquants)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Journal des relances */}
      <div className={`mt-6 ${CARD}`}>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Journal des relances
        </h3>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune relance pour ce client.</p>
        ) : (
          <ol className="space-y-2.5">
            {data.timeline.map((r) => (
              <li key={r.id} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    r.statut === "brouillon" ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-slate-800">
                    <span className="font-medium">
                      {STATUT_RELANCE_LABEL[r.statut] ?? r.statut}
                    </span>
                    {r.numero_dans_serie ? ` · relance n°${r.numero_dans_serie}` : ""}
                    {r.echeance_libelle
                      ? ` · ${r.echeance_libelle}`
                      : r.document_libelle
                        ? ` · ${r.document_libelle}`
                        : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.sujet ? `« ${r.sujet} » · ` : ""}
                    {r.destinataire_nom || r.destinataire_email || "destinataire à confirmer"}
                    {r.date_envoi
                      ? ` · envoyée le ${formatDate(r.date_envoi)}`
                      : ` · créée le ${formatDate(r.created_at)}`}
                    {r.reponse_recue_le ? ` · réponse le ${formatDate(r.reponse_recue_le)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function PauseForm({ onSubmit, pending }: { onSubmit: (fd: FormData) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="mb-4">
        <button type="button" className={BTN_GHOST} onClick={() => setOpen(true)}>
          ⏸ Mettre les relances en pause
        </button>
      </div>
    );
  }
  return (
    <form
      action={onSubmit}
      className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <label className="text-xs text-slate-600">
        Du
        <input name="date_debut" type="date" required className={`${INPUT} mt-0.5`} />
      </label>
      <label className="text-xs text-slate-600">
        Au
        <input name="date_fin" type="date" required className={`${INPUT} mt-0.5`} />
      </label>
      <input name="motif" maxLength={200} placeholder="Motif (facultatif)" className={INPUT} />
      <button type="submit" className={BTN_PRIMARY} disabled={pending}>
        Mettre en pause
      </button>
      <button type="button" className={BTN_GHOST} onClick={() => setOpen(false)}>
        Annuler
      </button>
    </form>
  );
}
