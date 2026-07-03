"use client";

import { ExternalLink, Eye, RotateCw } from "lucide-react";
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
import { createClientDepuisZefixAction } from "@/app/(app)/app/clients/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { helpAttrs } from "@/lib/help-attrs";
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
  /**
   * Fichier physique source (doc.v_inbox_a_valider.fichier_physique_id), servi par
   * /api/documents/[fichierId]/apercu (session + cabinet re-vérifiés côté route). Null si
   * la vue ne rattache pas de fichier → pas d'aperçu.
   */
  fichier_id: string | null;
  /** Type MIME du fichier (décide si l'iframe peut rendre l'aperçu nativement). */
  type_mime: string | null;
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

/** Types MIME que le navigateur sait rendre nativement dans une iframe (PDF, images, texte). */
function estPrevisualisable(typeMime: string | null): boolean {
  if (!typeMime) return true; // inconnu → on tente l'iframe plutôt que de priver d'aperçu
  return (
    typeMime === "application/pdf" || typeMime.startsWith("image/") || typeMime.startsWith("text/")
  );
}

/**
 * Aperçu du document source d'une proposition (toggle par item), via
 * /api/documents/[fichierId]/apercu (URL signée Storage, TTL 300 s — la route re-vérifie
 * session + cabinet, on ne contourne rien). Même pattern que la file des factures. L'URL
 * signée expirant après 5 min, « Recharger l'aperçu » re-set le src avec un cache-buster.
 * Si le format ne se rend pas en iframe → repli « Ouvrir le document » (nouvel onglet).
 */
function ApercuDocument({
  fichierId,
  typeMime,
  titre,
}: {
  fichierId: string;
  typeMime: string | null;
  titre: string;
}) {
  const [version, setVersion] = useState(0);
  if (!estPrevisualisable(typeMime)) {
    return (
      <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-secondary p-6">
        <p className="text-sm text-muted-foreground">Aperçu intégré indisponible pour ce format</p>
        <a
          href={`/api/documents/${fichierId}/apercu`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          {...helpAttrs(
            "Ouvrir le document",
            "Ouvre le document source dans un nouvel onglet, quand l'aperçu intégré n'est pas disponible pour ce format.",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Ouvrir le document
        </a>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <iframe
        key={version}
        src={`/api/documents/${fichierId}/apercu${version > 0 ? `?v=${version}` : ""}`}
        title={`Aperçu du document — ${titre}`}
        className="h-[70vh] w-full rounded-md border border-border bg-secondary"
      />
      <button
        type="button"
        onClick={() => setVersion(Date.now())}
        title="L'aperçu expire après 5 minutes — recharger si la page grise"
        className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        {...helpAttrs(
          "Recharger l'aperçu",
          "Régénère l'aperçu du document. À utiliser si l'image devient grise : le lien d'aperçu expire après 5 minutes.",
        )}
      >
        <RotateCw className="h-3 w-3" aria-hidden />
        Recharger l'aperçu
      </button>
    </div>
  );
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
  // Aperçu ouvert (toggle par item) : id de la proposition dont on affiche le document.
  const [apercuOuvert, setApercuOuvert] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<InboxItem | null>(null);
  const [rejecting, setRejecting] = useState<InboxItem | null>(null);
  const [confirmLot, setConfirmLot] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Copie locale de `clients`, enrichie immédiatement quand un nouveau client est créé
  // depuis la modale de correction (« + Nouveau client »), sans attendre un rechargement
  // de la page serveur.
  const [clientsLocal, setClientsLocal] = useState<ClientOption[]>(clients);

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
            {...helpAttrs(
              "Tout sélectionner",
              "Coche toutes les propositions visibles d'un coup pour les valider ensemble. Décochez pour tout désélectionner.",
            )}
          />
          Tout sélectionner
        </label>
        <Button
          type="button"
          size="sm"
          onClick={validerSelection}
          disabled={selected.size === 0 || isPending || sansClient}
          className="disabled:cursor-not-allowed"
          {...helpAttrs(
            "Valider la sélection",
            "Confirme le classement proposé par l'IA pour tous les documents cochés et crée les documents définitifs. Au-delà de 20, une confirmation est demandée.",
          )}
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
                    {...helpAttrs(
                      "Valider le classement",
                      "Confirme la catégorie proposée par l'IA et crée le document définitif. Le raccourci V fait la même chose sur l'élément sélectionné.",
                    )}
                  >
                    Valider
                  </Button>
                  <div className="flex gap-1.5">
                    {item.fichier_id !== null && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setApercuOuvert((cur) =>
                            cur === item.proposition_id ? null : item.proposition_id,
                          )
                        }
                        {...helpAttrs(
                          "Aperçu du document",
                          "Affiche la pièce d'origine sous la proposition pour la vérifier avant de valider. Un nouveau clic referme l'aperçu.",
                        )}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        Aperçu
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setCorrecting(item)}
                      disabled={isPending}
                      {...helpAttrs(
                        "Corriger puis valider",
                        "Ouvre un formulaire pour rectifier le client, le type ou la période avant de valider. Le raccourci C fait la même chose.",
                      )}
                    >
                      Corriger
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setRejecting(item)}
                      disabled={isPending}
                      {...helpAttrs(
                        "Rejeter le document",
                        "Écarte la proposition sans créer de document (illisible, hors périmètre…). Vous pourrez préciser un motif. Le raccourci R fait la même chose.",
                      )}
                    >
                      Rejeter
                    </Button>
                  </div>
                </div>
              </div>
              {apercuOuvert === item.proposition_id && item.fichier_id !== null && (
                <ApercuDocument
                  fichierId={item.fichier_id}
                  typeMime={item.type_mime}
                  titre={item.nom_fichier ?? "document à valider"}
                />
              )}
            </li>
          );
        })}
      </ul>

      {correcting && (
        <CorrectionModal
          item={correcting}
          clients={clientsLocal}
          pending={isPending}
          onClose={() => setCorrecting(null)}
          onClientCreated={(c) => setClientsLocal((prev) => [...prev, c])}
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
  onClientCreated,
  onSubmit,
}: {
  item: InboxItem;
  clients: ClientOption[];
  pending: boolean;
  onClose: () => void;
  onClientCreated: (c: ClientOption) => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [clientIdSelectionne, setClientIdSelectionne] = useState(item.client_id_propose ?? "");
  const [creatingClient, setCreatingClient] = useState(false);

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
            {creatingClient ? (
              <NouveauClientInline
                onCree={(c) => {
                  onClientCreated(c);
                  setClientIdSelectionne(c.id);
                  setCreatingClient(false);
                }}
                onAnnuler={() => setCreatingClient(false)}
              />
            ) : (
              <>
                <Select
                  id="correction-client"
                  name="client_id"
                  value={clientIdSelectionne}
                  onChange={(e) => setClientIdSelectionne(e.target.value)}
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
                <button
                  type="button"
                  onClick={() => setCreatingClient(true)}
                  className="mt-1 text-xs text-primary hover:underline"
                  {...helpAttrs(
                    "Nouveau client",
                    "Le client n'existe pas encore dans ZARYA ? Créez-le ici sans quitter cette fenêtre (raison sociale + IDE optionnel).",
                  )}
                >
                  + Nouveau client
                </button>
              </>
            )}
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

/**
 * Mini-formulaire de création de client, inline dans la modale de correction (pas de modal
 * sur modal). Remplace le `<Select>` client le temps de la saisie, puis rebascule dessus une
 * fois le client créé (sélection automatique gérée par l'appelant via `onCree`).
 */
function NouveauClientInline({
  onCree,
  onAnnuler,
}: {
  onCree: (c: ClientOption) => void;
  onAnnuler: () => void;
}) {
  const [raisonSociale, setRaisonSociale] = useState("");
  const [ide, setIde] = useState("");
  const [erreurCreation, setErreurCreation] = useState<string | null>(null);
  const [pendingCreation, startCreation] = useTransition();

  function creer() {
    setErreurCreation(null);
    const nom = raisonSociale.trim();
    if (!nom) {
      setErreurCreation("Raison sociale requise");
      return;
    }
    const fd = new FormData();
    fd.set("raison_sociale", nom);
    if (ide.trim()) fd.set("ide", ide.trim());
    startCreation(async () => {
      const res = await createClientDepuisZefixAction({}, fd);
      if (res.error || !res.client_id) {
        setErreurCreation(res.error ?? "Échec de la création du client");
        return;
      }
      toast.success(`Client « ${nom} » créé`);
      onCree({ id: res.client_id, raison_sociale: nom });
    });
  }

  return (
    <div className="rounded-md border border-dashed border-input bg-secondary p-2.5">
      <div className="space-y-2">
        <div>
          <label
            htmlFor="nouveau-client-raison-sociale"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Raison sociale
          </label>
          <Input
            id="nouveau-client-raison-sociale"
            value={raisonSociale}
            onChange={(e) => setRaisonSociale(e.target.value)}
            placeholder="Nom de l'entreprise"
            disabled={pendingCreation}
            autoFocus
          />
        </div>
        <div>
          <label
            htmlFor="nouveau-client-ide"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            IDE (optionnel)
          </label>
          <Input
            id="nouveau-client-ide"
            value={ide}
            onChange={(e) => setIde(e.target.value)}
            placeholder="CHE-123.456.789"
            disabled={pendingCreation}
          />
        </div>
        {erreurCreation && <p className="text-xs text-rose-700">{erreurCreation}</p>}
        <div className="flex items-center gap-3 pt-0.5">
          <Button type="button" size="sm" onClick={creer} disabled={pendingCreation}>
            {pendingCreation ? "Création…" : "Créer"}
          </Button>
          <button
            type="button"
            onClick={onAnnuler}
            disabled={pendingCreation}
            className="text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
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
