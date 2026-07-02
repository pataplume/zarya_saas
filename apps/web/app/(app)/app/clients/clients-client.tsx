"use client";

import { Archive, ChevronDown, ChevronsUpDown, ChevronUp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { helpAttrs } from "@/lib/help-attrs";
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

// ─── Tri par colonne (état dans l'URL : ?tri=…&dir=asc|desc) ──────────────────

type TriKey = "raison_sociale" | "type" | "statut" | "risque" | "echeance" | "docs" | "activite";

type TriDir = "asc" | "desc";

// Nombres nullable : null trié comme le plus petit (donc en fin de liste en desc).
function cmpNumber(a: number | null, b: number | null): number {
  const av = a ?? Number.NEGATIVE_INFINITY;
  const bv = b ?? Number.NEGATIVE_INFINITY;
  return av === bv ? 0 : av < bv ? -1 : 1;
}

// Dates ISO nullable : comparaison lexicale suffisante, null = plus petit.
function cmpDate(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

const COMPARATEURS: Record<TriKey, (a: ClientRow, b: ClientRow) => number> = {
  raison_sociale: (a, b) => a.raison_sociale.localeCompare(b.raison_sociale, "fr"),
  type: (a, b) => (a.type ?? "").localeCompare(b.type ?? "", "fr"),
  statut: (a, b) => a.statut.localeCompare(b.statut, "fr"),
  risque: (a, b) => cmpNumber(a.risque_score, b.risque_score),
  echeance: (a, b) => cmpDate(a.prochaine_echeance, b.prochaine_echeance),
  docs: (a, b) => a.nb_documents_manquants - b.nb_documents_manquants,
  activite: (a, b) => cmpDate(a.derniere_activite, b.derniere_activite),
};

function isTriKey(value: string | null): value is TriKey {
  return value != null && value in COMPARATEURS;
}

// Minuscules + accents retirés, pour une recherche insensible casse/accents.
function normaliser(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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

  // État filtres/tri piloté par l'URL (survit au refresh, partageable).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtreRisque = searchParams.get("risque") ?? "tous";
  const filtreStatut = searchParams.get("statut") ?? "tous";
  const triParam = searchParams.get("tri");
  const tri = isTriKey(triParam) ? triParam : null;
  const dirParam = searchParams.get("dir");
  const dir: TriDir | null = dirParam === "asc" || dirParam === "desc" ? dirParam : null;

  // Recherche : état local immédiat, écrit dans l'URL avec un débounce (250 ms).
  const qUrl = searchParams.get("q") ?? "";
  const [recherche, setRecherche] = useState(qUrl);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [cle, valeur] of Object.entries(updates)) {
        if (valeur == null || valeur === "") params.delete(cle);
        else params.set(cle, valeur);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  useEffect(() => {
    if (recherche === qUrl) return;
    const timer = setTimeout(() => setParams({ q: recherche || null }), 250);
    return () => clearTimeout(timer);
  }, [recherche, qUrl, setParams]);

  // Clic en-tête : asc → desc → retour à l'ordre serveur (risque desc).
  const basculerTri = useCallback(
    (colonne: TriKey) => {
      if (tri !== colonne || dir == null) setParams({ tri: colonne, dir: "asc" });
      else if (dir === "asc") setParams({ tri: colonne, dir: "desc" });
      else setParams({ tri: null, dir: null });
    },
    [tri, dir, setParams],
  );

  const actifs = useMemo(() => {
    const rechercheNorm = normaliser(recherche.trim());
    const filtres = clients.filter((c) => {
      if (filtreRisque !== "tous" && c.risque_niveau !== filtreRisque) return false;
      if (filtreStatut !== "tous" && c.statut !== filtreStatut) return false;
      if (rechercheNorm && !normaliser(c.raison_sociale).includes(rechercheNorm)) return false;
      return true;
    });
    // dir absent = ordre serveur (risque desc, raison sociale asc) inchangé.
    if (tri == null || dir == null) return filtres;
    const cmp = COMPARATEURS[tri];
    const facteur = dir === "asc" ? 1 : -1;
    return [...filtres].sort((a, b) => facteur * cmp(a, b));
  }, [clients, filtreRisque, filtreStatut, recherche, tri, dir]);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* En-tête */}
      <PageHeader
        title="Clients"
        description="Les PME que votre cabinet gère. Cliquez un client pour ouvrir son dossier."
      />

      {/* Liste des clients actifs */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Clients · {actifs.length}
          </h2>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="recherche-client">
              Rechercher un client
            </label>
            <Input
              id="recherche-client"
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un client…"
              className="h-8 w-56 py-1"
              {...helpAttrs(
                "Rechercher un client",
                "Filtre la liste sur la raison sociale à mesure que vous tapez. La recherche ignore les accents et la casse.",
              )}
            />
            <label className="sr-only" htmlFor="filtre-risque">
              Filtrer par risque
            </label>
            <Select
              id="filtre-risque"
              value={filtreRisque}
              onChange={(e) =>
                setParams({ risque: e.target.value === "tous" ? null : e.target.value })
              }
              className="h-8 w-auto py-1"
              {...helpAttrs(
                "Filtrer par risque",
                "Restreint la liste au niveau de risque choisi. Le filtre est mémorisé dans l'URL — vous pouvez partager le lien.",
              )}
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
              onChange={(e) =>
                setParams({ statut: e.target.value === "tous" ? null : e.target.value })
              }
              className="h-8 w-auto py-1"
              {...helpAttrs(
                "Filtrer par statut",
                "Restreint la liste au statut choisi (actif, prospect, inactif). Le filtre est mémorisé dans l'URL — vous pouvez partager le lien.",
              )}
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
          <EmptyState
            icon={Users}
            title="Aucun client à afficher"
            hint={
              peutEcrire
                ? "Ajustez les filtres ou ajoutez un client ci-dessous."
                : "Ajustez les filtres pour voir vos clients."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
            {/* En-tête de colonnes (desktop) — cliquables pour trier */}
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_0.8fr_1fr_auto] gap-3 border-b border-border bg-slate-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
              <EnteteTriable colonne="raison_sociale" tri={tri} dir={dir} onTri={basculerTri}>
                Raison sociale
              </EnteteTriable>
              <EnteteTriable colonne="type" tri={tri} dir={dir} onTri={basculerTri}>
                Type
              </EnteteTriable>
              <EnteteTriable colonne="statut" tri={tri} dir={dir} onTri={basculerTri}>
                Statut
              </EnteteTriable>
              <EnteteTriable colonne="risque" tri={tri} dir={dir} onTri={basculerTri}>
                Risque
              </EnteteTriable>
              <EnteteTriable colonne="echeance" tri={tri} dir={dir} onTri={basculerTri}>
                Prochaine échéance
              </EnteteTriable>
              <EnteteTriable colonne="docs" tri={tri} dir={dir} onTri={basculerTri}>
                Docs manq.
              </EnteteTriable>
              <EnteteTriable colonne="activite" tri={tri} dir={dir} onTri={basculerTri}>
                Dernière activité
              </EnteteTriable>
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Archivés · {archives.length}
          </h2>
          <div className="overflow-hidden rounded-lg border border-border bg-slate-50 shadow-card">
            {archives.map((c, idx) => (
              <Link
                key={c.id}
                href={`/app/clients/${c.id}`}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 hover:bg-slate-100",
                  idx < archives.length - 1 && "border-b border-border/70",
                )}
                {...helpAttrs(
                  "Ouvrir un client archivé",
                  "Ouvre la fiche d'un client archivé en lecture. Vous pourrez le réactiver depuis son dossier.",
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

// ─── En-tête de colonne triable (icône = état du tri, jamais couleur seule) ───

function EnteteTriable({
  colonne,
  tri,
  dir,
  onTri,
  children,
}: {
  colonne: TriKey;
  tri: TriKey | null;
  dir: TriDir | null;
  onTri: (colonne: TriKey) => void;
  children: React.ReactNode;
}) {
  const actif = tri === colonne && dir != null;
  const Icone = actif ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onTri(colonne)}
      aria-pressed={actif}
      className={cn(
        "flex items-center gap-1 text-left font-semibold uppercase tracking-wider hover:text-foreground",
        actif && "text-foreground",
      )}
      {...helpAttrs(
        "Trier la colonne",
        "Cliquez pour trier par cette colonne ; re-cliquez pour inverser, une 3ᵉ fois pour revenir au tri par défaut.",
      )}
    >
      {children}
      <Icone className={cn("h-3 w-3 shrink-0", !actif && "opacity-50")} aria-hidden />
    </button>
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
        "grid grid-cols-1 items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_0.8fr_1fr_auto]",
        !isLast && "border-b border-border/70",
      )}
    >
      {/* Raison sociale → lien dossier */}
      <Link
        href={`/app/clients/${client.id}`}
        className="min-w-0"
        {...helpAttrs(
          "Ouvrir le dossier client",
          "Ouvre la fiche complète du client : coordonnées, documents, échéances et risque. Cliquez sur le nom pour y accéder.",
        )}
      >
        <p className="truncate text-[13px] font-medium text-foreground hover:text-primary">
          {client.raison_sociale}
        </p>
        {client.ide && <p className="truncate text-xs text-slate-400 lg:hidden">{client.ide}</p>}
      </Link>

      {/* Type */}
      <span className="text-[13px] text-slate-600">
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
      <span className="text-[13px] text-slate-600 tabular-nums">
        {formatDate(client.prochaine_echeance)}
      </span>

      {/* Docs manquants */}
      <span className="text-[13px]">
        {client.nb_documents_manquants > 0 ? (
          <Badge famille="attention">{client.nb_documents_manquants}</Badge>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </span>

      {/* Dernière activité */}
      <span className="text-[13px] text-muted-foreground">
        {formatRelatif(client.derniere_activite)}
      </span>

      {/* Actions (édition / archivage) */}
      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        {peutEcrire && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onEdit}
            {...helpAttrs(
              "Modifier le client",
              "Passe la ligne en mode édition pour corriger la raison sociale, l'IDE, l'email ou le statut, sans quitter la liste.",
            )}
          >
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
              {...helpAttrs(
                "Archiver le client",
                "Retire le client de la liste active et le classe dans les archivés. Réservé au responsable ; le client reste consultable plus bas.",
              )}
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
      className={cn("space-y-3 bg-blue-50/40 px-4 py-4", !isLast && "border-b border-border/70")}
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
        <Button
          type="submit"
          disabled={pending}
          {...helpAttrs(
            "Enregistrer les modifications",
            "Sauvegarde les changements de la ligne et referme le mode édition. Les champs vides sont refusés pour la raison sociale.",
          )}
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onDone}
          {...helpAttrs(
            "Annuler l'édition",
            "Ferme le mode édition sans rien enregistrer. La ligne revient à ses valeurs d'origine.",
          )}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
