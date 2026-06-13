"use client";

import { useActionState, useState, useTransition } from "react";
import { type FactureActionState, rejeterFactureAction, validerFactureAction } from "./actions";

/** Provenance + confiance d'un champ proposé (ADR 0024). Côté UI (miroir de l'extraction). */
export interface ConfianceChampUi {
  source: "qr" | "ia" | "humain";
  confiance: number;
}

/** Map champ → provenance, normalisée et sûre (jamais la forme brute jsonb). */
export type ConfianceParChampUi = Record<string, ConfianceChampUi>;

/**
 * Lecteur DÉFENSIF de `confiance_par_champ` (jsonb). Gère les deux formes :
 *  - nouvelle (ADR 0024) : `{ source, confiance }` par champ ;
 *  - ancienne (legacy) : un simple `number` par champ → interprété `{ source: "ia", confiance }`.
 * Toute entrée illisible est ignorée. Ne lève jamais.
 */
export function normaliserConfianceParChamp(raw: unknown): ConfianceParChampUi {
  const out: ConfianceParChampUi = {};
  if (raw === null || typeof raw !== "object") return out;
  for (const [champ, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[champ] = { source: "ia", confiance: v };
      continue;
    }
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const source =
        o.source === "qr" || o.source === "ia" || o.source === "humain" ? o.source : "ia";
      const confiance =
        typeof o.confiance === "number" && Number.isFinite(o.confiance) ? o.confiance : 0;
      out[champ] = { source, confiance };
    }
  }
  return out;
}

export interface FactureItem {
  id: string;
  client_nom: string;
  fournisseur_raison_sociale: string;
  fournisseur_ide: string;
  fournisseur_numero_tva: string;
  fournisseur_bic: string;
  numero_facture: string;
  date_emission: string;
  date_echeance: string;
  total_ht: number | null;
  total_tva: number | null;
  total_ttc: number | null;
  montant_a_payer: number | null;
  taux_tva_principal: number | null;
  devise: string;
  categorie: string;
  qr_facture_detecte: boolean;
  anomalies: string[];
  confiance_globale: number | null;
  /** Provenance + confiance par champ (normalisée, ADR 0024). */
  confiance_par_champ: ConfianceParChampUi;
}

function val(n: number | null): string {
  return n === null ? "" : String(n);
}

// Confiance en dessous de laquelle on attire l'attention du validateur ("à vérifier").
const SEUIL_CONFIANCE_FAIBLE = 0.6;

/**
 * Résout la provenance d'un champ de FORMULAIRE vers la clé stockée dans confiance_par_champ.
 * L'extraction agrège certaines confiances : l'identité fournisseur sous `fournisseur`, les
 * totaux sous `montants` ; le QR renseigne en plus `iban`, `montant_a_payer`, `devise`,
 * `reference`. On essaie d'abord la clé exacte, puis la clé agrégée.
 */
const CHAMP_AGGREGE: Record<string, string> = {
  fournisseur_raison_sociale: "fournisseur",
  fournisseur_ide: "fournisseur",
  fournisseur_numero_tva: "fournisseur",
  fournisseur_bic: "fournisseur",
  total_ht: "montants",
  total_tva: "montants",
  total_ttc: "montants",
  taux_tva_principal: "montants",
};

function provenanceChamp(carte: ConfianceParChampUi, champ: string): ConfianceChampUi | undefined {
  return carte[champ] ?? carte[CHAMP_AGGREGE[champ] ?? ""];
}

/**
 * Petit badge de provenance par champ (ADR 0024) : QR = sûr (vert), IA = à confirmer (ambre).
 * Une confiance faible ajoute un repère « à vérifier » (icône + texte, pas seulement la couleur).
 */
function ChampBadge({ prov }: { prov: ConfianceChampUi | undefined }) {
  if (!prov) return null;
  const faible = prov.confiance < SEUIL_CONFIANCE_FAIBLE;
  if (prov.source === "qr") {
    return (
      <span
        title="Issu du QR-bill : donnée sûre"
        className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
      >
        QR ✓
      </span>
    );
  }
  // source "ia" (ou "humain" forward-compat) → proposé, à confirmer.
  return (
    <span
      title={
        faible
          ? "Proposé par l'IA, confiance faible : à vérifier"
          : "Proposé par l'IA : à confirmer"
      }
      className={
        faible
          ? "inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800"
          : "inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
      }
    >
      {faible ? "IA · à vérifier" : "IA"}
    </span>
  );
}

function FactureCard({ f, peutValider }: { f: FactureItem; peutValider: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FactureActionState, FormData>(
    validerFactureAction,
    {},
  );
  const [rejet, setRejet] = useState<FactureActionState>({});
  const [rejetPending, startRejet] = useTransition();

  // Provenance d'un champ de formulaire pour ce document (ADR 0024).
  const prov = (champ: string): ConfianceChampUi | undefined =>
    provenanceChamp(f.confiance_par_champ, champ);

  if (state.success) {
    return (
      <li className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Facture validée pour <strong>{f.client_nom}</strong>
        {state.iban_change_detecte ? " — ⚠️ changement d'IBAN signalé (fraude possible)" : ""}
        {state.doublons ? ` — ⚠️ ${state.doublons} doublon(s) potentiel(s)` : ""}
      </li>
    );
  }
  if (rejet.success) {
    return (
      <li className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Facture rejetée ({f.fournisseur_raison_sociale || "fournisseur inconnu"}).
      </li>
    );
  }

  return (
    <li className="rounded border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">
            {f.fournisseur_raison_sociale || "Fournisseur à saisir"}{" "}
            {f.qr_facture_detecte ? <span title="QR-facture détectée">🔳</span> : null}
          </p>
          <p className="text-sm text-gray-500">
            {f.client_nom} · {f.numero_facture || "n° ?"} ·{" "}
            {f.total_ttc !== null ? `${f.total_ttc} ${f.devise}` : "montant ?"}
            {f.confiance_globale !== null
              ? ` · confiance ${Math.round(f.confiance_globale * 100)}%`
              : ""}
          </p>
          {f.anomalies.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">⚠️ {f.anomalies.join(", ")}</p>
          ) : null}
        </div>
        {peutValider ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            {open ? "Fermer" : "Vérifier & valider"}
          </button>
        ) : null}
      </div>

      {open && peutValider ? (
        <form action={formAction} className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
          <input type="hidden" name="proposition_id" value={f.id} />
          <Field
            label="Raison sociale"
            name="fournisseur_raison_sociale"
            def={f.fournisseur_raison_sociale}
            required
            prov={prov("fournisseur_raison_sociale")}
          />
          <Field
            label="IDE"
            name="fournisseur_ide"
            def={f.fournisseur_ide}
            prov={prov("fournisseur_ide")}
          />
          <Field
            label="IBAN (à saisir)"
            name="fournisseur_iban"
            def=""
            placeholder="CHxx…"
            prov={prov("iban")}
          />
          <Field
            label="N° TVA"
            name="fournisseur_numero_tva"
            def={f.fournisseur_numero_tva}
            prov={prov("fournisseur_numero_tva")}
          />
          <Field
            label="N° facture"
            name="numero_facture"
            def={f.numero_facture}
            required
            prov={prov("numero_facture")}
          />
          <Field
            label="Compte de charge"
            name="compte_charge"
            def={f.categorie || "6000"}
            required
          />
          <Field
            label="Date émission"
            name="date_emission"
            def={f.date_emission}
            placeholder="AAAA-MM-JJ"
            required
            prov={prov("date_emission")}
          />
          <Field
            label="Date échéance"
            name="date_echeance"
            def={f.date_echeance}
            placeholder="AAAA-MM-JJ"
            prov={prov("date_echeance")}
          />
          <Field
            label="Total HT"
            name="total_ht"
            def={val(f.total_ht)}
            required
            prov={prov("total_ht")}
          />
          <Field
            label="Total TVA"
            name="total_tva"
            def={val(f.total_tva)}
            prov={prov("total_tva")}
          />
          <Field
            label="Total TTC"
            name="total_ttc"
            def={val(f.total_ttc)}
            required
            prov={prov("total_ttc")}
          />
          <Field
            label="Montant à payer"
            name="montant_a_payer"
            def={val(f.montant_a_payer ?? f.total_ttc)}
            required
            prov={prov("montant_a_payer")}
          />
          <Field
            label="Taux TVA %"
            name="taux_tva_principal"
            def={val(f.taux_tva_principal)}
            prov={prov("taux_tva_principal")}
          />
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span>Devise</span>
              <ChampBadge prov={prov("devise")} />
            </span>
            <select name="devise" defaultValue={f.devise} className="rounded border px-2 py-1">
              <option>CHF</option>
              <option>EUR</option>
              <option>USD</option>
            </select>
          </label>

          {state.error ? <p className="col-span-2 text-sm text-red-600">{state.error}</p> : null}

          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? "Validation…" : "✓ Valider la facture"}
            </button>
            <button
              type="button"
              disabled={rejetPending}
              onClick={() =>
                startRejet(async () => {
                  setRejet(await rejeterFactureAction(f.id, "Pas une facture"));
                })
              }
              className="rounded border px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Rejeter
            </button>
          </div>
          {rejet.error ? <p className="col-span-2 text-sm text-red-600">{rejet.error}</p> : null}
        </form>
      ) : null}
    </li>
  );
}

function Field(props: {
  label: string;
  name: string;
  def: string;
  required?: boolean;
  placeholder?: string;
  prov?: ConfianceChampUi | undefined;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-gray-600">
        <span>
          {props.label}
          {props.required ? " *" : ""}
        </span>
        <ChampBadge prov={props.prov} />
      </span>
      <input
        name={props.name}
        defaultValue={props.def}
        placeholder={props.placeholder}
        required={props.required}
        className="rounded border px-2 py-1"
      />
    </label>
  );
}

export function FacturesValidation({
  factures,
  peutValider,
}: {
  factures: FactureItem[];
  peutValider: boolean;
}) {
  if (factures.length === 0) {
    return <p className="text-sm text-gray-500">Aucune facture en attente de validation.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {factures.map((f) => (
        <FactureCard key={f.id} f={f} peutValider={peutValider} />
      ))}
    </ul>
  );
}
