"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFileKeyboard } from "@/lib/hooks/use-file-keyboard";
import { libelleAnomalie, libelleTypeDocument } from "@/lib/libelles";
import { rejeterPropositionAction, validerLotAction, validerPropositionAction } from "./actions";

export type ClientOption = { id: string; raison_sociale: string };

export type InboxItem = {
  proposition_id: string;
  type_propose: string | null;
  categorie_proposee: string | null;
  periode_proposee: string | null;
  libelle_propose: string | null;
  client_id_propose: string | null;
  client_nom: string | null;
  confiance_globale: string | null;
  anomalies: string[];
  nom_fichier: string | null;
};

const CATEGORIES = [
  ["bancaire", "Bancaire"],
  ["fiscal", "Fiscal"],
  ["salaire", "Salaire"],
  ["commercial", "Commercial"],
  ["administratif", "Administratif"],
  ["autre", "Autre"],
] as const;

const SEUIL_CONFIRMATION_LOT = 20;

function pourcent(confiance: string | null): number | null {
  if (!confiance) return null;
  const n = Number.parseFloat(confiance);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// Une proposition est validable en 1-clic / lot si l'IA a proposé les champs critiques
// (client + type + libellé). Sinon elle exige une correction manuelle.
function estComplete(item: InboxItem): boolean {
  return Boolean(item.client_id_propose && item.type_propose && item.libelle_propose);
}

export function ValidationInbox({
  propositions,
  clients,
}: {
  propositions: InboxItem[];
  clients: ClientOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [correcting, setCorrecting] = useState<InboxItem | null>(null);
  const [rejecting, setRejecting] = useState<InboxItem | null>(null);
  const [confirmLot, setConfirmLot] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Optimistic UI : les propositions validées/rejetées disparaissent immédiatement de la
  // liste ; si le serveur échoue, React annule l'état optimiste en fin de transition
  // (rollback automatique) et l'item réapparaît.
  const [idsTraites, marquerTraites] = useOptimistic<Set<string>, string[]>(
    new Set(),
    (prev, ids) => new Set([...prev, ...ids]),
  );
  const visibles = useMemo(
    () => propositions.filter((p) => !idsTraites.has(p.proposition_id)),
    [propositions, idsTraites],
  );

  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const sansClient = clients.length === 0;
  const modalOuverte = correcting !== null || rejecting !== null || confirmLot !== null;

  const retirerDeSelection = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const lancerLot = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setError(null);
      setConfirmLot(null);
      startTransition(async () => {
        // Doit être appelé DANS la transition (contrainte useOptimistic).
        marquerTraites(ids);
        const r = await validerLotAction(ids);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        retirerDeSelection(ids);
        // Toast de succès uniquement pour un lot : pour une validation unitaire,
        // la disparition de l'item EST le feedback.
        if (ids.length > 1) {
          const valides = r.valides ?? 0;
          const parts = [
            `${valides} document${valides > 1 ? "s" : ""} validé${valides > 1 ? "s" : ""}`,
          ];
          if (r.ignores) parts.push(`${r.ignores} ignoré${r.ignores > 1 ? "s" : ""} (à corriger)`);
          toast.success(parts.join(" · "));
        }
      });
    },
    [marquerTraites, retirerDeSelection],
  );

  const valider1Clic = useCallback(
    (item: InboxItem | undefined) => {
      if (!item) return;
      if (!estComplete(item)) {
        setError("Document incomplet : utilisez « Corriger » pour renseigner le client.");
        setCorrecting(item);
        return;
      }
      lancerLot([item.proposition_id]);
    },
    [lancerLot],
  );

  const validerSelection = useCallback(() => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (ids.length > SEUIL_CONFIRMATION_LOT) {
      setConfirmLot(ids);
      return;
    }
    lancerLot(ids);
  }, [selected, lancerLot]);

  // Raccourcis clavier (doc.md §15.1) via le hook partagé des files de travail :
  // J début · N suivant · P précédent · V valider · C corriger · R rejeter.
  useFileKeyboard({
    count: visibles.length,
    cursor,
    setCursor,
    onAction: (i) => valider1Clic(visibles[i]),
    onCorriger: (i) => {
      const item = visibles[i];
      if (item) setCorrecting(item);
    },
    onRejeter: (i) => {
      const item = visibles[i];
      if (item) setRejecting(item);
    },
    enabled: !modalOuverte,
  });

  // Escape ferme la modal ouverte (les raccourcis de file sont suspendus pendant ce temps).
  useEffect(() => {
    if (!modalOuverte) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCorrecting(null);
        setRejecting(null);
        setConfirmLot(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOuverte]);

  // Garder le curseur valide + visible quand la liste change (y compris après disparition
  // optimiste : le curseur pointe alors l'item suivant visible, jamais hors limites).
  useEffect(() => {
    if (cursor > visibles.length - 1) setCursor(Math.max(0, visibles.length - 1));
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, visibles.length]);

  const toutSelectionne = useMemo(
    () => visibles.length > 0 && selected.size === visibles.length,
    [visibles.length, selected.size],
  );

  function toggleTout() {
    setSelected(toutSelectionne ? new Set() : new Set(visibles.map((p) => p.proposition_id)));
  }

  function toggleUn(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Barre d'actions lot + raccourcis */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-2.5 shadow-card">
        <label className="flex items-center gap-2 text-[13px] text-secondary-foreground">
          <input
            type="checkbox"
            checked={toutSelectionne}
            onChange={toggleTout}
            disabled={sansClient}
            className="h-4 w-4 rounded border-input"
          />
          Tout sélectionner
        </label>
        <Button
          type="button"
          size="sm"
          onClick={validerSelection}
          disabled={selected.size === 0 || isPending || sansClient}
          className="disabled:cursor-not-allowed"
        >
          {isPending
            ? "Validation…"
            : `Valider la sélection${selected.size ? ` (${selected.size})` : ""}`}
        </Button>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
          Raccourcis :{" "}
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px]">
            J
          </kbd>{" "}
          début ·{" "}
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px]">
            N
          </kbd>{" "}
          suivant ·{" "}
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px]">
            V
          </kbd>{" "}
          valider ·{" "}
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px]">
            C
          </kbd>{" "}
          corriger ·{" "}
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px]">
            R
          </kbd>{" "}
          rejeter
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ul className="space-y-2">
        {visibles.map((item, i) => {
          const conf = pourcent(item.confiance_globale);
          const actif = i === cursor;
          const complet = estComplete(item);
          return (
            <li
              key={item.proposition_id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onMouseDown={() => setCursor(i)}
              className={`rounded-lg border bg-card p-3 shadow-card transition ${
                actif ? "border-blue-400 ring-1 ring-blue-200" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.proposition_id)}
                  onChange={() => toggleUn(item.proposition_id)}
                  disabled={sansClient}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-input"
                  aria-label="Sélectionner"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-semibold text-foreground"
                    title={item.nom_fichier ?? undefined}
                  >
                    {item.nom_fichier ?? "Document sans nom"}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {item.type_propose ? libelleTypeDocument(item.type_propose) : "Type ?"} ·{" "}
                    {item.client_nom ?? (
                      <span className="text-amber-600">client non identifié</span>
                    )}
                    {item.periode_proposee ? ` · ${item.periode_proposee}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {conf !== null && (
                      <Badge famille={conf >= 60 ? "succes" : "attention"}>Confiance {conf}%</Badge>
                    )}
                    {item.anomalies.map((a) => (
                      <Badge key={a} famille="danger">
                        {libelleAnomalie(a)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => valider1Clic(item)}
                    disabled={isPending || sansClient || !complet}
                    title={complet ? "Valider (V)" : "Document incomplet — corriger d'abord"}
                    className="disabled:cursor-not-allowed"
                  >
                    Valider
                  </Button>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setCorrecting(item)}
                      disabled={isPending}
                    >
                      Corriger
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setRejecting(item)}
                      disabled={isPending}
                    >
                      Rejeter
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {correcting && (
        <CorrectionModal
          item={correcting}
          clients={clients}
          pending={isPending}
          onClose={() => setCorrecting(null)}
          onSubmit={(fd) => {
            // Pas d'optimistic ici : les erreurs de formulaire restent inline et la
            // modal reste ouverte pour corriger.
            const id = correcting.proposition_id;
            setError(null);
            startTransition(async () => {
              const r = await validerPropositionAction({}, fd);
              if (r.error) setError(r.error);
              else {
                setCorrecting(null);
                retirerDeSelection([id]);
              }
            });
          }}
        />
      )}

      {rejecting && (
        <RejetModal
          item={rejecting}
          pending={isPending}
          onClose={() => setRejecting(null)}
          onSubmit={(fd) => {
            const id = rejecting.proposition_id;
            setError(null);
            setRejecting(null);
            startTransition(async () => {
              // Disparition optimiste ; rollback automatique + toast si le serveur échoue.
              marquerTraites([id]);
              const r = await rejeterPropositionAction({}, fd);
              if (r.error) toast.error(r.error);
              else retirerDeSelection([id]);
            });
          }}
        />
      )}

      {confirmLot && (
        <Overlay onClose={() => setConfirmLot(null)}>
          <h2 className="text-base font-semibold text-foreground">Valider en lot ?</h2>
          <p className="mt-2 text-sm text-secondary-foreground">
            Vous êtes sur le point de valider <strong>{confirmLot.length} documents</strong> avec le
            classement proposé par ZARYA. Cette action est appliquée immédiatement.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmLot(null)}>
              Annuler
            </Button>
            <Button type="button" onClick={() => lancerLot(confirmLot)} disabled={isPending}>
              {isPending ? "Validation…" : `Valider ${confirmLot.length} documents`}
            </Button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop : clic = fermeture (aria-hidden → exempté des règles d'interaction). */}
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-pop"
      >
        {children}
      </div>
    </div>
  );
}

function CorrectionModal({
  item,
  clients,
  pending,
  onClose,
  onSubmit,
}: {
  item: InboxItem;
  clients: ClientOption[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <h2 className="text-base font-semibold text-foreground">Corriger le classement</h2>
      <p
        className="mt-1 truncate text-xs text-muted-foreground"
        title={item.nom_fichier ?? undefined}
      >
        {item.nom_fichier ?? "Document sans nom"}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
        className="mt-4"
      >
        <input type="hidden" name="proposition_id" value={item.proposition_id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="block sm:col-span-2">
            <label
              htmlFor="correction-client"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Client
            </label>
            <Select
              id="correction-client"
              name="client_id"
              defaultValue={item.client_id_propose ?? ""}
              required
            >
              <option value="" disabled>
                Sélectionnez un client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.raison_sociale}
                </option>
              ))}
            </Select>
          </div>
          <div className="block">
            <label
              htmlFor="correction-categorie"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Catégorie
            </label>
            <Select
              id="correction-categorie"
              name="categorie"
              defaultValue={item.categorie_proposee ?? "autre"}
            >
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="block">
            <label
              htmlFor="correction-type"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Type
            </label>
            <Input
              id="correction-type"
              name="type"
              defaultValue={item.type_propose ?? ""}
              required
            />
          </div>
          <div className="block">
            <label
              htmlFor="correction-periode"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Période
            </label>
            <Input
              id="correction-periode"
              name="periode"
              defaultValue={item.periode_proposee ?? ""}
              placeholder="2026-04, 2026-Q1…"
            />
          </div>
          <div className="block">
            <label
              htmlFor="correction-libelle"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Libellé
            </label>
            <Input
              id="correction-libelle"
              name="libelle"
              defaultValue={item.libelle_propose ?? ""}
              required
            />
          </div>
          <div className="block sm:col-span-2">
            <label
              htmlFor="correction-note"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Note interne (feedback, optionnel)
            </label>
            <Textarea
              id="correction-note"
              name="note"
              rows={2}
              maxLength={2000}
              placeholder="Pourquoi cette correction ? (sert à améliorer le classement)"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Validation…" : "Corriger et valider"}
          </Button>
        </div>
      </form>
    </Overlay>
  );
}

function RejetModal({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: InboxItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <h2 className="text-base font-semibold text-foreground">Rejeter le document</h2>
      <p
        className="mt-1 truncate text-xs text-muted-foreground"
        title={item.nom_fichier ?? undefined}
      >
        {item.nom_fichier ?? "Document sans nom"}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
        className="mt-4"
      >
        <input type="hidden" name="proposition_id" value={item.proposition_id} />
        <div className="block">
          <label
            htmlFor="rejet-motif"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Motif (optionnel)
          </label>
          <Input
            id="rejet-motif"
            name="motif"
            maxLength={500}
            placeholder="Document illisible, hors périmètre…"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Rejet…" : "Confirmer le rejet"}
          </Button>
        </div>
      </form>
    </Overlay>
  );
}
