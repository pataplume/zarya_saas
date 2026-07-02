"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { badgeStatutEcheance, libelleTypeEcheance } from "@/lib/libelles";
import {
  annulerEcheanceAction,
  annulerLotAction,
  marquerTraiteeAction,
  marquerTraiteesLotAction,
  reporterEcheanceAction,
} from "./actions";

export interface EcheanceRow {
  id: string;
  /** Client rattaché — sert au lien vers le dossier. */
  client_id: string;
  client_nom: string | null;
  type: string;
  libelle: string;
  date_echeance: string | null;
  statut: string;
  reporte_a: string | null;
  motif_report: string | null;
}

const STATUTS_ACTIONNABLES = new Set(["a_venir", "imminente", "en_retard"]);

export function EcheancesListe({
  echeances,
  statuts,
  types,
  filtres,
  peutAgir,
}: {
  echeances: EcheanceRow[];
  statuts: string[];
  types: string[];
  filtres: { statut: string; type: string; q: string };
  peutAgir: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reporting, setReporting] = useState<EcheanceRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);

  const actionnables = echeances.filter((e) => STATUTS_ACTIONNABLES.has(e.statut));
  const toutSelectionne = actionnables.length > 0 && actionnables.every((e) => selection.has(e.id));

  function appliquerFiltres(form: FormData) {
    const params = new URLSearchParams();
    for (const k of ["statut", "type", "q"] as const) {
      const v = String(form.get(k) ?? "").trim();
      if (v) params.set(k, v);
    }
    // Nouveau filtre → retour page 1 (pas de param `page`).
    router.push(`/app/calendrier/echeances?${params.toString()}`);
  }

  function agir(action: () => Promise<{ success?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await action();
      setMessage(res.success ? ok : (res.error ?? "Erreur."));
      router.refresh();
    });
  }

  function basculer(id: string) {
    setSelection((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function basculerTout() {
    setSelection(toutSelectionne ? new Set() : new Set(actionnables.map((e) => e.id)));
  }

  // Actions de lot : feedback par toast (synthèse), pas de message inline par item.
  function agirLot(
    action: (ids: string[]) => Promise<{ traitees: number; error?: string }>,
    libeller: (n: number) => string,
  ) {
    const ids = [...selection];
    startTransition(async () => {
      const res = await action(ids);
      if (res.error) toast.error(res.error);
      if (res.traitees > 0) toast.success(libeller(res.traitees));
      setSelection(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <form action={appliquerFiltres} className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mr-1 text-gray-500">Statut</span>
          <select name="statut" defaultValue={filtres.statut} className="rounded border px-2 py-1">
            <option value="">Tous</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {badgeStatutEcheance(s).label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-1 text-gray-500">Type</span>
          <select name="type" defaultValue={filtres.type} className="rounded border px-2 py-1">
            <option value="">Tous</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {libelleTypeEcheance(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-1 text-gray-500">Client</span>
          <input
            name="q"
            defaultValue={filtres.q}
            placeholder="Raison sociale…"
            className="rounded border px-2 py-1"
          />
        </label>
        <Button type="submit" size="sm">
          Filtrer
        </Button>
      </form>

      {message && (
        <div className="mb-4 rounded bg-gray-100 px-3 py-2 text-sm" role="status">
          {message}
        </div>
      )}

      {peutAgir && actionnables.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || selection.size === 0}
            onClick={() => agirLot(marquerTraiteesLotAction, (n) => `${n} échéance(s) traitée(s).`)}
          >
            Traiter la sélection ({selection.size})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || selection.size === 0}
            onClick={() => setConfirmerAnnulation(true)}
          >
            Annuler la sélection ({selection.size})
          </Button>
        </div>
      )}

      {echeances.length === 0 ? (
        <p className="text-gray-500">Aucune échéance.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              {peutAgir && (
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    checked={toutSelectionne}
                    disabled={actionnables.length === 0}
                    onChange={basculerTout}
                    aria-label="Tout sélectionner"
                  />
                </th>
              )}
              <th className="py-2">Date</th>
              <th>Client</th>
              <th>Type</th>
              <th>Libellé</th>
              <th>Statut</th>
              {peutAgir && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {echeances.map((e) => (
              <tr key={e.id} className="border-b">
                {peutAgir && (
                  <td className="py-2">
                    {STATUTS_ACTIONNABLES.has(e.statut) && (
                      <input
                        type="checkbox"
                        checked={selection.has(e.id)}
                        onChange={() => basculer(e.id)}
                        aria-label={`Sélectionner l'échéance ${e.libelle}`}
                      />
                    )}
                  </td>
                )}
                <td className="py-2">{e.date_echeance ?? "—"}</td>
                <td>
                  <Link
                    href={`/app/clients/${e.client_id}`}
                    className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {e.client_nom ?? "—"}
                  </Link>
                </td>
                <td>{libelleTypeEcheance(e.type)}</td>
                <td>
                  {e.libelle}
                  {e.statut === "reportee" && e.reporte_a && (
                    <span className="ml-1 text-xs text-blue-700">→ {e.reporte_a}</span>
                  )}
                </td>
                <td>
                  <Badge
                    famille={badgeStatutEcheance(e.statut).famille}
                    className={e.statut === "annulee" ? "line-through" : undefined}
                  >
                    {badgeStatutEcheance(e.statut).label}
                  </Badge>
                </td>
                {peutAgir && (
                  <td className="whitespace-nowrap">
                    {STATUTS_ACTIONNABLES.has(e.statut) ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            agir(() => marquerTraiteeAction(e.id), "Échéance traitée.")
                          }
                          className="text-emerald-700 hover:text-emerald-800"
                        >
                          Traiter
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setReporting(e)}
                          className="text-blue-700 hover:text-blue-800"
                        >
                          Reporter
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            agir(() => annulerEcheanceAction(e.id), "Échéance annulée.")
                          }
                        >
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={confirmerAnnulation} onOpenChange={setConfirmerAnnulation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler {selection.size} échéance(s) ?</DialogTitle>
            <DialogDescription>
              Les échéances sélectionnées passeront au statut « Annulée ». Cette action est
              difficilement réversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmerAnnulation(false)}>
              Retour
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmerAnnulation(false);
                agirLot(annulerLotAction, (n) => `${n} échéance(s) annulée(s).`);
              }}
            >
              Annuler la sélection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reporting && (
        <ReporterModal
          echeance={reporting}
          pending={pending}
          onClose={() => setReporting(null)}
          onSubmit={(formData) =>
            startTransition(async () => {
              const res = await reporterEcheanceAction(formData);
              setMessage(res.success ? "Échéance reportée." : (res.error ?? "Erreur."));
              setReporting(null);
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

function ReporterModal({
  echeance,
  pending,
  onClose,
  onSubmit,
}: {
  echeance: EcheanceRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reporter l'échéance"
        className="relative z-10 w-full max-w-sm rounded bg-white p-4 shadow-lg"
      >
        <h2 className="mb-3 text-lg font-semibold">Reporter — {echeance.libelle}</h2>
        <form action={onSubmit}>
          <input type="hidden" name="echeanceId" value={echeance.id} />
          <label className="block text-sm font-medium" htmlFor="reporteA">
            Nouvelle date
          </label>
          <input
            id="reporteA"
            name="reporteA"
            type="date"
            required
            className="mb-3 w-full rounded border px-2 py-1 text-sm"
          />
          <label className="block text-sm font-medium" htmlFor="motif">
            Motif (optionnel)
          </label>
          <input id="motif" name="motif" className="mb-4 w-full rounded border px-2 py-1 text-sm" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Reporter
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
