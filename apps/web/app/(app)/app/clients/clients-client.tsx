"use client";

import { Archive } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { badgeRisque, badgeStatutClient, libelleTypeClient } from "@/lib/libelles";
import { cn } from "@/lib/utils";
import { archiverClientAction, type ClientActionState, updateClientAction } from "./actions";
import { ClientCreateZefix } from "./client-create-zefix";
import type { ClientRow } from "./page";

type Props = {
  clients: ClientRow[];
  archives: ClientRow[];
  peutEcrire: boolean;
  isResponsable: boolean;
};

const STATUTS = [
  { value: "prospect", label: "Prospect" },
  { value: "actif", label: "Actif" },
  { value: "inactif", label: "Inactif" },
];

const FILTRES_RISQUE = [
  { value: "tous", label: "Tous risques" },
  { value: "critique", label: "Critique" },
  { value: "eleve", label: "Élevé" },
  { value: "moyen", label: "Moyen" },
  { value: "faible", label: "Faible" },
];

const FILTRES_STATUT = [
  { value: "tous", label: "Tous statuts" },
  { value: "actif", label: "Actif" },
  { value: "prospect", label: "Prospect" },
  { value: "inactif", label: "Inactif" },
];

// Formate une date ISO (YYYY-MM-DD ou ISO complet) en jj.mm.aaaa, ou "—".
function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Dernière activité en relatif (« il y a 3 j », « aujourd'hui »…), ou "—".
function formatRelatif(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const jours = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  if (jours < 30) return `Il y a ${jours} j`;
  if (jours < 365) return `Il y a ${Math.floor(jours / 30)} mois`;
  return `Il y a ${Math.floor(jours / 365)} an(s)`;
}

export function ClientsClient({ clients, archives, peutEcrire, isResponsable }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtreRisque, setFiltreRisque] = useState("tous");
  const [filtreStatut, setFiltreStatut] = useState("tous");

  const actifs = useMemo(
    () =>
      clients.filter((c) => {
        if (filtreRisque !== "tous" && c.risque_niveau !== filtreRisque) return false;
        if (filtreStatut !== "tous" && c.statut !== filtreStatut) return false;
        return true;
      }),
    [clients, filtreRisque, filtreStatut],
  );

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">
          Les PME que votre cabinet gère. Cliquez un client pour ouvrir son dossier.
        </p>
      </div>

      {/* Liste des clients actifs */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Clients · {actifs.length}
          </h2>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="filtre-risque">
              Filtrer par risque
            </label>
            <Select
              id="filtre-risque"
              value={filtreRisque}
              onChange={(e) => setFiltreRisque(e.target.value)}
              className="h-8 w-auto py-1"
            >
              {FILTRES_RISQUE.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <label className="sr-only" htmlFor="filtre-statut">
              Filtrer par statut
            </label>
            <Select
              id="filtre-statut"
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className="h-8 w-auto py-1"
            >
              {FILTRES_STATUT.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {actifs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-card py-12 text-center">
            <p className="text-sm font-medium text-slate-600">Aucun client à afficher</p>
            <p className="mt-1 text-xs text-slate-400">
              {peutEcrire
                ? "Ajustez les filtres ou ajoutez un client ci-dessous."
                : "Ajustez les filtres pour voir vos clients."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {/* En-tête de colonnes (desktop) */}
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_0.8fr_1fr_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <span>Raison sociale</span>
              <span>Type</span>
              <span>Statut</span>
              <span>Risque</span>
              <span>Prochaine échéance</span>
              <span>Docs manq.</span>
              <span>Dernière activité</span>
              <span className="sr-only">Actions</span>
            </div>

            {actifs.map((c, idx) =>
              editingId === c.id ? (
                <EditRow
                  key={c.id}
                  client={c}
                  isLast={idx === actifs.length - 1}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <DisplayRow
                  key={c.id}
                  client={c}
                  isLast={idx === actifs.length - 1}
                  peutEcrire={peutEcrire}
                  isResponsable={isResponsable}
                  onEdit={() => setEditingId(c.id)}
                />
              ),
            )}
          </div>
        )}
      </section>

      {/* Formulaire de création avec préremplissage Zefix (Lot 3 ADR 0025) */}
      {peutEcrire && <ClientCreateZefix />}

      {/* Clients archivés */}
      {archives.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Archivés · {archives.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-slate-50 shadow-sm">
            {archives.map((c, idx) => (
              <Link
                key={c.id}
                href={`/app/clients/${c.id}`}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 hover:bg-slate-100",
                  idx < archives.length - 1 && "border-b border-slate-100",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-500">{c.raison_sociale}</p>
                  {c.ide && <p className="truncate text-xs text-slate-400">{c.ide}</p>}
                </div>
                <Badge famille="termine" className="shrink-0">
                  Archivé
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Badge de risque (symbole + couleur + texte, jamais couleur seule) ─────────

function RisqueBadge({ niveau, score }: { niveau: string | null; score: number | null }) {
  if (!niveau) return <span className="text-xs text-slate-400">—</span>;
  const meta = badgeRisque(niveau);
  return (
    <Badge famille={meta.famille} title={score != null ? `Score ${score}` : undefined}>
      <span aria-hidden="true">{meta.symbole}</span>
      {meta.label}
      {score != null && <span className="font-normal opacity-70">· {score}</span>}
    </Badge>
  );
}

// ─── Ligne en lecture (cliquable → dossier) ───────────────────────────────────

function DisplayRow({
  client,
  isLast,
  peutEcrire,
  isResponsable,
  onEdit,
}: {
  client: ClientRow;
  isLast: boolean;
  peutEcrire: boolean;
  isResponsable: boolean;
  onEdit: () => void;
}) {
  const statut = badgeStatutClient(client.statut);
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-center gap-3 px-4 py-3 hover:bg-slate-50 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_0.8fr_1fr_auto]",
        !isLast && "border-b border-slate-100",
      )}
    >
      {/* Raison sociale → lien dossier */}
      <Link href={`/app/clients/${client.id}`} className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900 hover:text-primary">
          {client.raison_sociale}
        </p>
        {client.ide && <p className="truncate text-xs text-slate-400 lg:hidden">{client.ide}</p>}
      </Link>

      {/* Type */}
      <span className="text-sm text-slate-600">
        {client.type ? libelleTypeClient(client.type) : "—"}
      </span>

      {/* Statut */}
      <span>
        <Badge famille={statut.famille}>{statut.label}</Badge>
      </span>

      {/* Risque */}
      <span>
        <RisqueBadge niveau={client.risque_niveau} score={client.risque_score} />
      </span>

      {/* Prochaine échéance */}
      <span className="text-sm text-slate-600 tabular-nums">
        {formatDate(client.prochaine_echeance)}
      </span>

      {/* Docs manquants */}
      <span className="text-sm">
        {client.nb_documents_manquants > 0 ? (
          <Badge famille="attention">{client.nb_documents_manquants}</Badge>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </span>

      {/* Dernière activité */}
      <span className="text-sm text-slate-500">{formatRelatif(client.derniere_activite)}</span>

      {/* Actions (édition / archivage) */}
      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        {peutEcrire && (
          <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
            Modifier
          </Button>
        )}
        {isResponsable && (
          <form action={archiverClientAction}>
            <input type="hidden" name="id" value={client.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="text-slate-300 hover:bg-transparent hover:text-destructive"
              aria-label={`Archiver ${client.raison_sociale}`}
            >
              <Archive aria-hidden />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Ligne en édition ─────────────────────────────────────────────────────────

function EditRow({
  client,
  isLast,
  onDone,
}: {
  client: ClientRow;
  isLast: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(
    updateClientAction,
    {},
  );

  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form
      action={action}
      className={cn("space-y-3 bg-blue-50/40 px-4 py-4", !isLast && "border-b border-slate-100")}
    >
      <input type="hidden" name="id" value={client.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_140px]">
        <Input
          name="raison_sociale"
          required
          defaultValue={client.raison_sociale}
          placeholder="Raison sociale"
        />
        <Input name="ide" defaultValue={client.ide ?? ""} placeholder="CHE-123.456.789" />
        <Input
          name="email_contact"
          type="email"
          defaultValue={client.email_contact ?? ""}
          placeholder="contact@client.ch"
        />
        <Select name="statut" defaultValue={client.statut}>
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
