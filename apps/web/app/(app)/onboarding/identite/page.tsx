"use client";

import type { ZefixResultat } from "@zarya/integrations";
import { useActionState, useState } from "react";
import { type IdentiteState, sauvegarderIdentiteAction } from "./actions";

const LANGUES = [
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
] as const;

export default function IdentitePage() {
  // ─── Recherche Zefix (route handler — ADR 0009) ──────────────────────────
  const [query, setQuery] = useState("");
  const [consentement, setConsentement] = useState(false); // NON pré-coché (ADR 0009 §3)
  const [isSearching, setIsSearching] = useState(false);
  const [rechercheError, setRechercheError] = useState<string | null>(null);
  const [resultats, setResultats] = useState<ZefixResultat[] | null>(null);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consentement) {
      setRechercheError("Le consentement est requis pour interroger Zefix");
      return;
    }
    if (query.trim().length < 2) {
      setRechercheError("Saisissez au moins 2 caractères");
      return;
    }

    setIsSearching(true);
    setRechercheError(null);
    setResultats(null);

    try {
      const response = await fetch("/api/zefix/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requete: query.trim(), consentement: true }),
      });

      const data = (await response.json()) as { resultats?: ZefixResultat[]; error?: string };

      if (!response.ok || data.error) {
        setRechercheError(data.error ?? "Erreur lors de la recherche");
        return;
      }

      setResultats(data.resultats ?? []);
    } catch {
      setRechercheError(
        "Zefix est temporairement indisponible. Saisissez les informations manuellement.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  // ─── Formulaire identité (server action) ─────────────────────────────────
  const [identiteState, sauvegarderAction, isSaving] = useActionState<IdentiteState, FormData>(
    sauvegarderIdentiteAction,
    {},
  );

  // Pré-remplissage depuis un résultat Zefix sélectionné
  const [selectionne, setSelectionne] = useState<ZefixResultat | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [langues, setLangues] = useState<string[]>(["fr"]);

  // On sélectionne un résultat depuis la liste : on recharge le détail complet par IDE
  // pour obtenir l'adresse postale complète (la recherche par nom retourne des summaries partiels).
  async function selectionnerResultat(r: ZefixResultat) {
    setIsLoadingDetail(true);
    try {
      const response = await fetch("/api/zefix/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Le consentement a déjà été donné pour cette session de recherche
        body: JSON.stringify({ requete: r.ide, consentement: true }),
      });
      if (response.ok) {
        const data = (await response.json()) as { resultats?: ZefixResultat[]; error?: string };
        setSelectionne(data.resultats?.[0] ?? r);
      } else {
        setSelectionne(r);
      }
    } catch {
      setSelectionne(r); // Fallback gracieux sur le résumé
    } finally {
      setIsLoadingDetail(false);
      document.getElementById("form-identite")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function toggleLangue(code: string) {
    setLangues((prev) => (prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]));
  }

  return (
    <div className="space-y-8">
      {/* En-tête étape */}
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Étape 1 / 3
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Identité de votre cabinet</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nous récupérons les informations publiques depuis le registre du commerce suisse (Zefix).
        </p>
      </div>

      {/* Bloc recherche Zefix */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-base font-semibold text-slate-900">
          Rechercher votre cabinet dans Zefix
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Saisissez votre IDE (CHE-XXX.XXX.XXX) ou votre raison sociale.
        </p>

        <form onSubmit={handleSearch} className="mt-4 space-y-4">
          {/* Consentement nLPD — non pré-coché (ADR 0009 §3) */}
          <label htmlFor="consentement-zefix" className="flex cursor-pointer items-start gap-3">
            <input
              id="consentement-zefix"
              type="checkbox"
              checked={consentement}
              onChange={(e) => {
                setConsentement(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            <span className="text-xs text-slate-600">
              J&apos;autorise ZARYA à récupérer les informations publiques de mon cabinet depuis le
              registre du commerce suisse (Zefix).
            </span>
          </label>

          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Ex. : CHE-123.456.789 ou Cabinet Dupont SA"
              className="flex-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-50"
            >
              {isSearching ? "Recherche…" : "Rechercher"}
            </button>
          </div>

          {rechercheError && <p className="text-sm text-red-600">{rechercheError}</p>}
        </form>

        {/* Résultats */}
        {resultats && resultats.length > 0 && (
          <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {resultats.map((r) => (
              <button
                key={r.ehraid}
                type="button"
                disabled={isLoadingDetail}
                onClick={() => {
                  void selectionnerResultat(r);
                }}
                className={`w-full px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring ${isLoadingDetail ? "cursor-wait opacity-60" : "hover:bg-blue-50"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{r.raison_sociale}</p>
                    <p className="text-xs text-slate-500">
                      {r.forme_juridique}
                      {r.adresse_ville ? ` · ${r.adresse_ville}` : ""}
                      {r.adresse_canton ? ` (${r.adresse_canton})` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs text-slate-600">{r.ide}</p>
                    {r.statut !== "actif" && (
                      <p className="text-xs text-amber-600">
                        {r.statut === "en_liquidation" ? "En liquidation" : "Radié"}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {resultats?.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            Aucun résultat. Saisissez les informations manuellement ci-dessous.
          </p>
        )}
      </div>

      {/* Formulaire identité — key force un remontage quand la sélection Zefix change,
          ce qui permet aux defaultValue de prendre la nouvelle valeur */}
      <form
        key={selectionne?.ehraid ?? ""}
        id="form-identite"
        action={sauvegarderAction}
        className="space-y-6"
      >
        {/* Champs cachés Zefix */}
        <input type="hidden" name="zefix_ehraid" value={selectionne?.ehraid ?? ""} />
        <input type="hidden" name="adresse_canton" value={selectionne?.adresse_canton ?? ""} />

        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h2 className="text-base font-semibold text-slate-900">Informations du cabinet</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Raison sociale */}
            <div className="sm:col-span-2">
              <label
                htmlFor="raison_sociale"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Raison sociale <span className="text-red-500">*</span>
              </label>
              <input
                id="raison_sociale"
                type="text"
                name="raison_sociale"
                defaultValue={selectionne?.raison_sociale ?? ""}
                required
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {identiteState.fieldErrors?.raison_sociale && (
                <p className="mt-1 text-xs text-red-600">
                  {identiteState.fieldErrors.raison_sociale}
                </p>
              )}
            </div>

            {/* IDE */}
            <div>
              <label htmlFor="ide" className="mb-1 block text-sm font-medium text-slate-700">
                IDE (CHE-XXX.XXX.XXX)
              </label>
              <input
                id="ide"
                type="text"
                name="ide"
                defaultValue={selectionne?.ide ?? ""}
                placeholder="CHE-123.456.789"
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {identiteState.fieldErrors?.ide && (
                <p className="mt-1 text-xs text-red-600">{identiteState.fieldErrors.ide}</p>
              )}
            </div>

            {/* Forme juridique */}
            <div>
              <label
                htmlFor="forme_juridique"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Forme juridique
              </label>
              <input
                id="forme_juridique"
                type="text"
                name="forme_juridique"
                defaultValue={selectionne?.forme_juridique ?? ""}
                placeholder="SA, Sàrl, Raison individuelle…"
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Adresse */}
            <div className="sm:col-span-2">
              <label
                htmlFor="adresse_rue"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Rue
              </label>
              <input
                id="adresse_rue"
                type="text"
                name="adresse_rue"
                defaultValue={selectionne?.adresse_rue ?? ""}
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="adresse_npa"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                NPA
              </label>
              <input
                id="adresse_npa"
                type="text"
                name="adresse_npa"
                defaultValue={selectionne?.adresse_npa ?? ""}
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="adresse_ville"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Ville
              </label>
              <input
                id="adresse_ville"
                type="text"
                name="adresse_ville"
                defaultValue={selectionne?.adresse_ville ?? ""}
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* TVA */}
            <div>
              <label htmlFor="tva_numero" className="mb-1 block text-sm font-medium text-slate-700">
                Numéro TVA
              </label>
              <input
                id="tva_numero"
                type="text"
                name="tva_numero"
                placeholder="CHE-XXX.XXX.XXX MVA"
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Téléphone */}
            <div>
              <label htmlFor="telephone" className="mb-1 block text-sm font-medium text-slate-700">
                Téléphone
              </label>
              <input
                id="telephone"
                type="tel"
                name="telephone"
                placeholder="+41 XX XXX XX XX"
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Site web */}
            <div className="sm:col-span-2">
              <label htmlFor="site_web" className="mb-1 block text-sm font-medium text-slate-700">
                Site web
              </label>
              <input
                id="site_web"
                type="url"
                name="site_web"
                placeholder="https://cabinet-dupont.ch"
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {identiteState.fieldErrors?.site_web && (
                <p className="mt-1 text-xs text-red-600">{identiteState.fieldErrors.site_web}</p>
              )}
            </div>
          </div>
        </div>

        {/* Langues opérationnelles */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h2 className="text-base font-semibold text-slate-900">Langues de travail</h2>
          <p className="mt-1 text-sm text-slate-500">
            Langues dans lesquelles votre cabinet opère.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {LANGUES.map((l) => (
              <label
                key={l.code}
                htmlFor={`langue_${l.code}`}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  id={`langue_${l.code}`}
                  type="checkbox"
                  name="langues"
                  value={l.code}
                  checked={langues.includes(l.code)}
                  onChange={() => {
                    toggleLangue(l.code);
                  }}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="text-sm text-slate-700">{l.label}</span>
              </label>
            ))}
          </div>
          {identiteState.fieldErrors?.langues && (
            <p className="mt-2 text-xs text-red-600">{identiteState.fieldErrors.langues}</p>
          )}

          <div className="mt-4">
            <label
              htmlFor="langue_principale"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Langue principale <span className="text-red-500">*</span>
            </label>
            <select
              id="langue_principale"
              name="langue_principale"
              defaultValue="fr"
              className="rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {LANGUES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {identiteState.error && <p className="text-sm text-red-600">{identiteState.error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {isSaving ? "Enregistrement…" : "Continuer →"}
          </button>
        </div>
      </form>
    </div>
  );
}
