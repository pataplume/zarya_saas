"use client";

import { useActionState, useEffect, useState } from "react";
import { type CreateClientZefixState, createClientDepuisZefixAction } from "./actions";

// Lot 3 (ADR 0025) — Formulaire de création de client avec PRÉREMPLISSAGE ZEFIX (identité +
// adresse). Corrige le bug ONB « Zefix ne remplit pas l'adresse » : on recherche via le route
// handler /api/zefix/* (ADR 0009 — Zefix ne supporte pas CORS, jamais d'appel direct navigateur),
// puis on préremplit les champs identité ET adresse du siège, modifiables avant validation.
// Parcours NON BLOQUANT : la recherche est facultative, la saisie manuelle reste possible, et
// seule la raison sociale est requise.

// Forme normalisée renvoyée par /api/zefix/search (ZefixResultat). On ne type que ce qu'on lit.
interface ZefixResultatUI {
  ide: string;
  raison_sociale: string;
  forme_juridique?: string;
  statut: string;
  adresse_rue?: string;
  adresse_npa?: string;
  adresse_ville?: string;
  adresse_canton?: string;
}

interface Prefill {
  raison_sociale: string;
  ide: string;
  forme_juridique: string;
  adresse_rue: string;
  adresse_code_postal: string;
  adresse_ville: string;
  adresse_canton: string;
}

const VIDE: Prefill = {
  raison_sociale: "",
  ide: "",
  forme_juridique: "",
  adresse_rue: "",
  adresse_code_postal: "",
  adresse_ville: "",
  adresse_canton: "",
};

const STATUTS = [
  { value: "prospect", label: "Prospect" },
  { value: "actif", label: "Actif" },
  { value: "inactif", label: "Inactif" },
];

const TYPES_CLIENT = [
  { value: "", label: "— Type (optionnel)" },
  { value: "pme", label: "PME" },
  { value: "independant", label: "Indépendant" },
  { value: "prive", label: "Privé" },
  { value: "association", label: "Association" },
];

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const LABEL = "mb-1 block text-xs font-medium text-gray-600";

export function ClientCreateZefix() {
  const [state, action, pending] = useActionState<CreateClientZefixState, FormData>(
    createClientDepuisZefixAction,
    {},
  );

  // Recherche Zefix
  const [requete, setRequete] = useState("");
  const [consentement, setConsentement] = useState(false);
  const [recherche, setRecherche] = useState(false);
  const [erreurZefix, setErreurZefix] = useState<string | null>(null);
  const [resultats, setResultats] = useState<ZefixResultatUI[]>([]);

  // Valeurs préremplies du formulaire (modifiables). `key` force le remount à un nouveau prefill
  // pour réinitialiser les defaultValue des inputs non contrôlés.
  const [prefill, setPrefill] = useState<Prefill>(VIDE);
  const [formKey, setFormKey] = useState(0);

  // Reset complet au succès de la création.
  useEffect(() => {
    if (state.success) {
      setPrefill(VIDE);
      setFormKey((k) => k + 1);
      setRequete("");
      setResultats([]);
      setErreurZefix(null);
    }
  }, [state.success]);

  async function lancerRecherche() {
    setErreurZefix(null);
    setResultats([]);
    if (requete.trim().length < 2) {
      setErreurZefix("Saisissez au moins 2 caractères (nom ou IDE).");
      return;
    }
    if (!consentement) {
      setErreurZefix("Cochez le consentement nLPD pour interroger Zefix.");
      return;
    }
    setRecherche(true);
    try {
      const res = await fetch("/api/zefix/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requete: requete.trim(), consentement: true }),
      });
      const data = (await res.json()) as { resultats?: ZefixResultatUI[]; error?: string };
      if (!res.ok) {
        setErreurZefix(data.error ?? "Recherche Zefix indisponible. Saisissez manuellement.");
        return;
      }
      const liste = data.resultats ?? [];
      if (liste.length === 0) {
        setErreurZefix("Aucun résultat. Saisissez les informations manuellement.");
        return;
      }
      setResultats(liste);
    } catch {
      setErreurZefix("Recherche Zefix indisponible. Saisissez manuellement.");
    } finally {
      setRecherche(false);
    }
  }

  function choisir(r: ZefixResultatUI) {
    setPrefill({
      raison_sociale: r.raison_sociale ?? "",
      ide: r.ide ?? "",
      forme_juridique: r.forme_juridique ?? "",
      adresse_rue: r.adresse_rue ?? "",
      adresse_code_postal: r.adresse_npa ?? "",
      adresse_ville: r.adresse_ville ?? "",
      adresse_canton: r.adresse_canton ?? "",
    });
    setFormKey((k) => k + 1);
    setResultats([]);
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Ajouter un client
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* ── Recherche Zefix (facultative) ───────────────────────────────────── */}
        <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <p className="mb-2 text-xs font-medium text-slate-600">
            Rechercher dans le registre du commerce (Zefix) pour préremplir l'identité et l'adresse
            — facultatif.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={requete}
              onChange={(e) => setRequete(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lancerRecherche();
                }
              }}
              placeholder="Nom de l'entreprise ou IDE (CHE-123.456.789)"
              className={`${INPUT} flex-1`}
            />
            <button
              type="button"
              onClick={() => void lancerRecherche()}
              disabled={recherche}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {recherche ? "Recherche…" : "Rechercher"}
            </button>
          </div>
          <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={consentement}
              onChange={(e) => setConsentement(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Je consens à interroger Zefix pour identifier ce client (registre public, nLPD).
            </span>
          </label>

          {erreurZefix && <p className="mt-2 text-sm text-amber-700">{erreurZefix}</p>}

          {resultats.length > 0 && (
            <ul className="mt-3 divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100 bg-white">
              {resultats.map((r) => (
                <li key={r.ide}>
                  <button
                    type="button"
                    onClick={() => choisir(r)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{r.raison_sociale}</span>
                    <span className="text-xs text-slate-500">
                      {[r.ide, r.adresse_ville, r.adresse_canton].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Formulaire de création (préremplissable, modifiable) ────────────── */}
        <form key={formKey} action={action} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="raison_sociale" className={LABEL}>
                Raison sociale
              </label>
              <input
                id="raison_sociale"
                name="raison_sociale"
                required
                defaultValue={prefill.raison_sociale}
                placeholder="Acme Sàrl"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="ide" className={LABEL}>
                IDE (optionnel)
              </label>
              <input
                id="ide"
                name="ide"
                defaultValue={prefill.ide}
                placeholder="CHE-123.456.789"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="forme_juridique" className={LABEL}>
                Forme juridique (optionnel)
              </label>
              <input
                id="forme_juridique"
                name="forme_juridique"
                defaultValue={prefill.forme_juridique}
                placeholder="SA, Sàrl…"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="type" className={LABEL}>
                Type
              </label>
              <select id="type" name="type" defaultValue="" className={INPUT}>
                {TYPES_CLIENT.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="statut" className={LABEL}>
                Statut
              </label>
              <select id="statut" name="statut" defaultValue="actif" className={INPUT}>
                {STATUTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="email_contact" className={LABEL}>
                Email (optionnel)
              </label>
              <input
                id="email_contact"
                name="email_contact"
                type="email"
                placeholder="contact@acme.ch"
                className={INPUT}
              />
            </div>
          </div>

          {/* Adresse du siège (préremplie par Zefix) */}
          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs font-medium text-gray-500">
              Adresse du siège (préremplie depuis Zefix — optionnel)
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="adresse_rue" className={LABEL}>
                  Rue
                </label>
                <input
                  id="adresse_rue"
                  name="adresse_rue"
                  defaultValue={prefill.adresse_rue}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="adresse_code_postal" className={LABEL}>
                  NPA
                </label>
                <input
                  id="adresse_code_postal"
                  name="adresse_code_postal"
                  defaultValue={prefill.adresse_code_postal}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="adresse_ville" className={LABEL}>
                  Ville
                </label>
                <input
                  id="adresse_ville"
                  name="adresse_ville"
                  defaultValue={prefill.adresse_ville}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="adresse_canton" className={LABEL}>
                  Canton
                </label>
                <input
                  id="adresse_canton"
                  name="adresse_canton"
                  defaultValue={prefill.adresse_canton}
                  maxLength={2}
                  placeholder="VD"
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="adresse_pays" className={LABEL}>
                  Pays
                </label>
                <input
                  id="adresse_pays"
                  name="adresse_pays"
                  defaultValue="CH"
                  maxLength={2}
                  className={INPUT}
                />
              </div>
            </div>
          </fieldset>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.success && <p className="text-sm text-green-600">Client ajouté avec succès ✓</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Ajout…" : "Ajouter le client →"}
          </button>
        </form>
      </div>
    </section>
  );
}
