"use client";

// Écran /parametres/conformite — UI demandes RGPD : changer de statut, ajouter une note.
// Réservé au rôle responsable (RBAC déjà tranché côté page.tsx, qui ne rend pas ce
// composant pour les autres rôles). Convention parametres/* : Dialog de confirmation pour
// la transition de statut (sensible), toast sonner, textes FR en dur.
import { useActionState, useEffect, useState } from "react";
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
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { helpAttrs } from "@/lib/help-attrs";
import { badgeStatutDemandeRgpd, libelleStatutDemandeRgpd } from "@/lib/libelles";
import { ajouterNoteDemandeAction, changerStatutDemandeAction } from "./actions";

const STATUTS = ["nouvelle", "en_cours", "traitee", "rejetee"] as const;

export interface DemandeNote {
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DemandeRow {
  id: string;
  client_raison_sociale: string | null;
  demandeur_email: string | null;
  motif: string | null;
  statut: string;
  created_at: string;
  historique: DemandeNote[];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ConformiteListe({ demandes }: { demandes: DemandeRow[] }) {
  const [statutCible, setStatutCible] = useState<{ demande: DemandeRow; statut: string } | null>(
    null,
  );
  const [noteCible, setNoteCible] = useState<DemandeRow | null>(null);
  const [detailCible, setDetailCible] = useState<DemandeRow | null>(null);

  if (demandes.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Aucune demande de suppression pour le moment.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Client</TableHead>
            <TableHead>Demandeur</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Motif</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {demandes.map((demande) => (
            <TableRow key={demande.id}>
              <TableCell className="font-medium text-slate-900">
                {demande.client_raison_sociale ?? "Client supprimé"}
              </TableCell>
              <TableCell>{demande.demandeur_email ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(demande.created_at)}</TableCell>
              <TableCell>
                {demande.motif ? demande.motif : <span className="text-slate-400">—</span>}
              </TableCell>
              <TableCell>
                <Badge famille={badgeStatutDemandeRgpd(demande.statut).famille}>
                  {badgeStatutDemandeRgpd(demande.statut).label}
                </Badge>
                {demande.historique.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDetailCible(demande)}
                    className="ml-2 text-xs text-primary hover:underline"
                    {...helpAttrs(
                      "Voir l'historique",
                      "Affiche les changements de statut et les notes déjà ajoutées sur cette demande.",
                    )}
                  >
                    historique ({demande.historique.length})
                  </button>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Select
                  className="mb-1 inline-block w-auto min-w-32"
                  defaultValue={demande.statut}
                  onChange={(e) => {
                    const statut = e.target.value;
                    if (statut !== demande.statut) setStatutCible({ demande, statut });
                  }}
                  {...helpAttrs(
                    "Changer le statut",
                    "Fait passer la demande à un autre statut du cycle RGPD (nouvelle, en cours, traitée, rejetée). Une confirmation est demandée avant d'enregistrer.",
                  )}
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {libelleStatutDemandeRgpd(s)}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  onClick={() => setNoteCible(demande)}
                  {...helpAttrs(
                    "Ajouter une note",
                    "Ajoute une note libre sur cette demande RGPD (ex. étape du traitement, échange avec le client). Conservée dans l'historique, non modifiable.",
                  )}
                >
                  + Note
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {statutCible && (
        <ChangerStatutDialog
          demande={statutCible.demande}
          statut={statutCible.statut}
          onClose={() => setStatutCible(null)}
        />
      )}

      {noteCible && <AjouterNoteDialog demande={noteCible} onClose={() => setNoteCible(null)} />}

      {detailCible && (
        <HistoriqueDialog demande={detailCible} onClose={() => setDetailCible(null)} />
      )}
    </div>
  );
}

function ChangerStatutDialog({
  demande,
  statut,
  onClose,
}: {
  demande: DemandeRow;
  statut: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(changerStatutDemandeAction, {});

  useEffect(() => {
    if (state.success) {
      toast.success("Statut de la demande mis à jour.");
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer le changement de statut</DialogTitle>
          <DialogDescription>
            La demande RGPD de{" "}
            <span className="font-medium">{demande.client_raison_sociale ?? "ce client"}</span>{" "}
            passera de « {libelleStatutDemandeRgpd(demande.statut)} » à «{" "}
            {libelleStatutDemandeRgpd(statut)} ». Le traitement effectif (suppression /
            anonymisation) reste sous votre responsabilité de fiduciaire.
          </DialogDescription>
        </DialogHeader>
        <form action={action}>
          <input type="hidden" name="demandeId" value={demande.id} />
          <input type="hidden" name="statut" value={statut} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AjouterNoteDialog({ demande, onClose }: { demande: DemandeRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(ajouterNoteDemandeAction, {});

  useEffect(() => {
    if (state.success) {
      toast.success("Note ajoutée.");
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une note</DialogTitle>
          <DialogDescription>
            Note interne sur la demande RGPD de{" "}
            <span className="font-medium">{demande.client_raison_sociale ?? "ce client"}</span>.
            Visible par le cabinet dans l'historique, non modifiable une fois enregistrée.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="demandeId" value={demande.id} />
          <Textarea
            name="note"
            required
            maxLength={2000}
            placeholder="Ex. Client recontacté le [date] pour confirmer la demande."
            className="min-h-24 w-full"
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ajout…" : "Ajouter la note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoriqueDialog({ demande, onClose }: { demande: DemandeRow; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Historique</DialogTitle>
          <DialogDescription>
            Demande de {demande.client_raison_sociale ?? "ce client"}.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 space-y-3 overflow-y-auto text-sm">
          {demande.historique.map((h, i) => {
            const note = h.metadata?.note;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: historique en lecture seule, jamais réordonné
              <li key={i} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-400">{formatDateTime(h.created_at)}</p>
                <p className="text-slate-700">{h.description}</p>
                {typeof note === "string" && note.length > 0 && (
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">{note}</p>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
