"use client";

import { ArrowRight, CheckCircle2, Download, FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  confirmerImportAction,
  revoirPeriodeAction,
  type SalaireFiduciaireState,
  saisirElementFiduciaireAction,
} from "@/app/(app)/app/salaire/actions";
import { Button } from "@/components/ui/button";
import { helpAttrs } from "@/lib/help-attrs";

const INITIAL: SalaireFiduciaireState = {};

const CHAMP =
  "mt-1 rounded-md border border-input bg-card px-2 py-1 text-[13px] text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

type Employe = { id: string; prenom: string; nom: string };
type TypeElement = { id: string; code: string; libelle: string; unite: string };

// ─── Barre d'actions : Revoir → Exporter → Confirmer import ──────────────────

export function ActionsPeriodeFiduciaire({
  periodeId,
  statut,
  revueFaite,
  clientValide,
  dernierExport,
}: {
  periodeId: string;
  statut: string;
  revueFaite: boolean;
  clientValide: boolean;
  dernierExport: { id: string; statut: string } | null;
}) {
  const cloturee = statut === "cloturee";
  const exportee = statut === "exportee";
  // « Revoir » possible tant que la période n'est ni exportée ni clôturée.
  const peutRevoir = !exportee && !cloturee;
  // Export réel autorisé seulement après la revue fiduciaire (garde-fou serveur).
  const peutExporter = revueFaite && (statut === "validee" || exportee);

  if (cloturee) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 p-4 text-sm text-muted-foreground shadow-card">
        <FileCheck2 className="size-5 shrink-0 text-slate-400" aria-hidden />
        Période clôturée — l'export a été importé dans le logiciel de paie. Plus aucune modification
        possible.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Traitement de la paie
      </p>
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {/* 1. Revue */}
        <li className="flex-1 rounded-lg border border-border bg-slate-50/60 p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            <ShieldCheck className="size-4 text-indigo-500" aria-hidden />1 · Revue
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {revueFaite
              ? "Revue effectuée."
              : clientValide
                ? "Le client a validé. Contrôlez, puis validez la revue."
                : "Le client n'a pas encore validé — vous pouvez valider pour lui."}
          </p>
          {!revueFaite && peutRevoir && <RevoirForm periodeId={periodeId} />}
          {revueFaite && (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" aria-hidden /> Faite
            </span>
          )}
        </li>

        {/* 2. Export */}
        <li className="flex-1 rounded-lg border border-border bg-slate-50/60 p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            <Download className="size-4 text-indigo-500" aria-hidden />2 · Export
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {peutExporter
              ? "Téléchargez le fichier de paie (Excel)."
              : "Disponible après la revue."}
          </p>
          {peutExporter ? (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="mt-2"
              {...helpAttrs(
                "Exporter la paie (Excel)",
                "Télécharge le fichier des salaires de la période (matrice employés × éléments) et passe la période en « exportée ». Vous l'importez ensuite dans votre logiciel de paie.",
              )}
            >
              <Link href={`/app/salaire/export/${periodeId}?format=xlsx`}>Exporter (Excel)</Link>
            </Button>
          ) : (
            <span className="mt-2 inline-block text-xs text-slate-400">En attente de revue</span>
          )}
        </li>

        {/* 3. Import → clôture */}
        <li className="flex-1 rounded-lg border border-border bg-slate-50/60 p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            <FileCheck2 className="size-4 text-indigo-500" aria-hidden />3 · Clôture
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {exportee && dernierExport
              ? "Confirmez l'import dans votre logiciel — la période sera clôturée."
              : "Disponible après l'export."}
          </p>
          {exportee && dernierExport ? (
            <ConfirmerImportForm exportId={dernierExport.id} />
          ) : (
            <span className="mt-2 inline-block text-xs text-slate-400">En attente d'export</span>
          )}
        </li>
      </ol>
    </div>
  );
}

function RevoirForm({ periodeId }: { periodeId: string }) {
  const [state, action, pending] = useActionState(revoirPeriodeAction, INITIAL);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="periode_id" value={periodeId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        {...helpAttrs(
          "Valider la revue",
          "Marque la période comme revue par le cabinet (jalon obligatoire avant l'export). Si le client n'avait pas validé, vous validez à sa place.",
        )}
      >
        {pending ? "…" : "Valider la revue"}
        <ArrowRight className="size-3.5" aria-hidden />
      </Button>
      {state.error && <p className="mt-1 text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

function ConfirmerImportForm({ exportId }: { exportId: string }) {
  const [state, action, pending] = useActionState(confirmerImportAction, INITIAL);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="export_id" value={exportId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        {...helpAttrs(
          "Confirmer l'import & clôturer",
          "Confirme que l'export a bien été importé dans votre logiciel de paie. La période est alors clôturée (verrouillée définitivement).",
        )}
      >
        {pending ? "…" : "Marquer importé"}
        <CheckCircle2 className="size-3.5" aria-hidden />
      </Button>
      {state.error && <p className="mt-1 text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

// ─── Saisie / correction d'un élément « à la place du client » ───────────────

export function SaisieFiduciaireForm({
  periodeId,
  employes,
  types,
}: {
  periodeId: string;
  employes: Employe[];
  types: TypeElement[];
}) {
  const [state, action, pending] = useActionState(saisirElementFiduciaireAction, INITIAL);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <input type="hidden" name="periode_id" value={periodeId} />
      <label className="flex flex-col text-xs text-muted-foreground">
        Employé
        <select name="employe_id" required className={CHAMP}>
          {employes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.prenom} {e.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted-foreground">
        Élément
        <select name="type_element_id" required className={CHAMP}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle} ({t.unite})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted-foreground">
        Valeur
        <input
          name="valeur_numerique"
          type="number"
          step="any"
          required
          className={`w-28 ${CHAMP}`}
        />
      </label>
      <Button
        type="submit"
        disabled={pending}
        {...helpAttrs(
          "Saisir / corriger un élément",
          "Enregistre ou corrige un élément de paie à la place du client (heures, prime, retenue…). Tracé comme saisie fiduciaire dans l'audit.",
        )}
      >
        {pending ? "…" : "Enregistrer"}
      </Button>
      {state.error && <p className="w-full text-sm text-rose-600">{state.error}</p>}
      {state.success && <p className="w-full text-sm text-emerald-600">Enregistré.</p>}
    </form>
  );
}
