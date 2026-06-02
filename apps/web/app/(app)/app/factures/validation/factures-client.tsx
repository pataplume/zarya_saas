"use client";

import { useActionState, useState, useTransition } from "react";
import { type FactureActionState, rejeterFactureAction, validerFactureAction } from "./actions";

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
}

function val(n: number | null): string {
  return n === null ? "" : String(n);
}

function FactureCard({ f, peutValider }: { f: FactureItem; peutValider: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FactureActionState, FormData>(
    validerFactureAction,
    {},
  );
  const [rejet, setRejet] = useState<FactureActionState>({});
  const [rejetPending, startRejet] = useTransition();

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
          />
          <Field label="IDE" name="fournisseur_ide" def={f.fournisseur_ide} />
          <Field label="IBAN (à saisir)" name="fournisseur_iban" def="" placeholder="CHxx…" />
          <Field label="N° TVA" name="fournisseur_numero_tva" def={f.fournisseur_numero_tva} />
          <Field label="N° facture" name="numero_facture" def={f.numero_facture} required />
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
          />
          <Field
            label="Date échéance"
            name="date_echeance"
            def={f.date_echeance}
            placeholder="AAAA-MM-JJ"
          />
          <Field label="Total HT" name="total_ht" def={val(f.total_ht)} required />
          <Field label="Total TVA" name="total_tva" def={val(f.total_tva)} />
          <Field label="Total TTC" name="total_ttc" def={val(f.total_ttc)} required />
          <Field
            label="Montant à payer"
            name="montant_a_payer"
            def={val(f.montant_a_payer ?? f.total_ttc)}
            required
          />
          <Field label="Taux TVA %" name="taux_tva_principal" def={val(f.taux_tva_principal)} />
          <label className="flex flex-col gap-1">
            <span className="text-gray-600">Devise</span>
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
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-gray-600">
        {props.label}
        {props.required ? " *" : ""}
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
