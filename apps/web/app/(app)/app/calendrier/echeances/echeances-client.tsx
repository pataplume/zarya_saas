"use client";

import { CalendarCheck } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { helpAttrs } from "@/lib/help-attrs";
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
  filtreClient,
}: {
  echeances: EcheanceRow[];
  statuts: string[];
  types: string[];
  filtres: { statut: string; type: string; q: string };
  peutAgir: boolean;
  /** Filtre « dossier client » actif : bandeau « Filtré sur [nom] · tout voir ». */
  filtreClient?: { id: string; nom: string; hrefTout: string };
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
    // Le filtre « dossier client » reste actif quand on change statut/type/q (préservé via
    // le champ caché du formulaire). « Tout voir » (bandeau) est la seule sortie du filtre.
    const clientId = String(form.get("client") ?? "").trim();
    if (clientId) params.set("client", clientId);
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
      {filtreClient && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
          role="status"
        >
          <span>
            Filtré sur <span className="font-semibold">{filtreClient.nom}</span>
          </span>
          <span aria-hidden="true">·</span>
          <Link
            href={filtreClient.hrefTout}
            className="font-medium text-primary hover:underline"
            {...helpAttrs(
              "Tout voir",
              "Retire le filtre « dossier client » et affiche les échéances de tous les clients (les autres filtres sont conservés).",
            )}
          >
            tout voir
          </Link>
        </div>
      )}

      <form action={appliquerFiltres} className="mb-4 flex flex-wrap items-end gap-3">
        {filtreClient && <input type="hidden" name="client" value={filtreClient.id} />}
        <div className="text-sm">
          <label
            htmlFor="filtre-statut"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Statut
          </label>
          <Select
            id="filtre-statut"
            name="statut"
            defaultValue={filtres.statut}
            className="w-auto min-w-36"
            {...helpAttrs(
              "Filtrer par statut",
              "Restreint la liste à un statut d'échéance (à venir, imminente, en retard, traitée…). Choisissez « Tous » pour lever le filtre, puis cliquez « Filtrer ».",
            )}
          >
            <option value="">Tous</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {badgeStatutEcheance(s).label}
              </option>
            ))}
          </Select>
        </div>
        <div className="text-sm">
          <label
            htmlFor="filtre-type"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Type
          </label>
          <Select
            id="filtre-type"
            name="type"
            defaultValue={filtres.type}
            className="w-auto min-w-36"
            {...helpAttrs(
              "Filtrer par type",
              "Restreint la liste à un type d'échéance (fiscale, TVA, bouclement, salaire…). Choisissez « Tous » pour lever le filtre, puis cliquez « Filtrer ».",
            )}
          >
            <option value="">Tous</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {libelleTypeEcheance(t)}
              </option>
            ))}
          </Select>
        </div>
        <div className="text-sm">
          <label
            htmlFor="filtre-client"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Client
          </label>
          <Input
            id="filtre-client"
            name="q"
            defaultValue={filtres.q}
            placeholder="Raison sociale…"
            className="w-auto"
            {...helpAttrs(
              "Filtrer par client",
              "Ne garde que les échéances des clients dont la raison sociale contient ce texte. Laissez vide pour tous les clients, puis cliquez « Filtrer ».",
            )}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          {...helpAttrs(
            "Filtrer",
            "Applique les filtres Statut, Type et Client choisis ci-dessus et recharge la liste depuis la première page.",
          )}
        >
          Filtrer
        </Button>
      </form>

      {message && (
        <div
          className="mb-4 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-secondary-foreground"
          role="status"
        >
          {message}
        </div>
      )}

      {peutAgir && actionnables.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5 shadow-card">
          <Button
            type="button"
            size="sm"
            disabled={pending || selection.size === 0}
            onClick={() => agirLot(marquerTraiteesLotAction, (n) => `${n} échéance(s) traitée(s).`)}
            {...helpAttrs(
              "Traiter la sélection",
              "Marque d'un coup toutes les échéances cochées comme traitées. Elles sortent de la liste des actions à faire.",
            )}
          >
            Traiter la sélection ({selection.size})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || selection.size === 0}
            onClick={() => setConfirmerAnnulation(true)}
            {...helpAttrs(
              "Annuler la sélection",
              "Passe les échéances cochées au statut « Annulée » après confirmation. Action difficilement réversible.",
            )}
          >
            Annuler la sélection ({selection.size})
          </Button>
        </div>
      )}

      {echeances.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Aucune échéance"
          hint="Modifiez les filtres, ou laissez ZARYA générer les échéances de vos clients."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {peutAgir && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={toutSelectionne}
                    disabled={actionnables.length === 0}
                    onChange={basculerTout}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
              )}
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Statut</TableHead>
              {peutAgir && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {echeances.map((e) => (
              <TableRow key={e.id}>
                {peutAgir && (
                  <TableCell>
                    {STATUTS_ACTIONNABLES.has(e.statut) && (
                      <input
                        type="checkbox"
                        checked={selection.has(e.id)}
                        onChange={() => basculer(e.id)}
                        aria-label={`Sélectionner l'échéance ${e.libelle}`}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>{e.date_echeance ?? "—"}</TableCell>
                <TableCell>
                  <Link
                    href={`/app/clients/${e.client_id}`}
                    className="font-medium text-primary hover:text-primary-hover hover:underline"
                  >
                    {e.client_nom ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>{libelleTypeEcheance(e.type)}</TableCell>
                <TableCell>
                  {e.libelle}
                  {e.statut === "reportee" && e.reporte_a && (
                    <span className="ml-1 text-xs text-blue-700">→ {e.reporte_a}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    famille={badgeStatutEcheance(e.statut).famille}
                    className={e.statut === "annulee" ? "line-through" : undefined}
                  >
                    {badgeStatutEcheance(e.statut).label}
                  </Badge>
                </TableCell>
                {peutAgir && (
                  <TableCell className="whitespace-nowrap">
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
                          {...helpAttrs(
                            "Traiter l'échéance",
                            "Marque l'échéance comme traitée (document reçu / obligation remplie). Elle sort de la liste des actions à faire.",
                          )}
                        >
                          Traiter
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setReporting(e)}
                          className="text-blue-700 hover:text-blue-800"
                          {...helpAttrs(
                            "Reporter",
                            "Décale la date limite : choisissez une nouvelle date et un motif ; l'échéance passe en « reportée ».",
                          )}
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
                          {...helpAttrs(
                            "Annuler l'échéance",
                            "Passe l'échéance au statut « Annulée ». À utiliser quand l'obligation ne s'applique plus ; action difficilement réversible.",
                          )}
                        >
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
