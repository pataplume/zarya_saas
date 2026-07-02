"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { libelleAnomalie } from "@/lib/libelles";
import { rejeterFactureAction, validerFactureAction } from "./actions";

// C4.1 — les libellés d'anomalies vivent désormais dans `@/lib/libelles`. On réexporte
// `libelleAnomalie` pour ne pas casser les imports existants (fiche document C2.3).
export { libelleAnomalie };

// Provenance/confiance par champ : les TYPES + le normaliseur vivent désormais dans un module
// SERVER-SAFE (./confiance-provenance) pour être appelables depuis des Server Components. On
// ré-exporte ici les types (effacés à la compilation → aucun risque client/serveur). Le
// NORMALISEUR s'importe directement depuis ./confiance-provenance côté serveur — ne JAMAIS
// l'appeler via ce module "use client" (c'était la cause du crash C2.3).
import type { ConfianceChampUi, ConfianceParChampUi } from "./confiance-provenance";

export type { ConfianceChampUi, ConfianceParChampUi };

export interface FactureItem {
  id: string;
  /** Client rattaché (null si non encore associé) — sert au lien vers le dossier. */
  client_id: string | null;
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
  /** L'IBAN-du-QR est chiffré au Vault dès la proposition (C6.1) → pré-rempli, pas retapé. */
  a_iban_qr: boolean;
  /** Masque d'affichage de l'IBAN-du-QR (ex. ****9012), jamais l'IBAN complet ni le vault_id. */
  iban_paiement_masque: string;
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
 * Réutilisé par la fiche document (C2.3) pour afficher la provenance de façon cohérente.
 */
export function ChampBadge({ prov }: { prov: ConfianceChampUi | undefined }) {
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

function FactureCard({
  f,
  peutValider,
  pending,
  onValider,
  onRejeter,
}: {
  f: FactureItem;
  peutValider: boolean;
  pending: boolean;
  onValider: (formData: FormData) => void;
  onRejeter: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Provenance d'un champ de formulaire pour ce document (ADR 0024).
  const prov = (champ: string): ConfianceChampUi | undefined =>
    provenanceChamp(f.confiance_par_champ, champ);

  return (
    <li className="rounded border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">
            {f.fournisseur_raison_sociale || "Fournisseur à saisir"}{" "}
            {f.qr_facture_detecte ? <span title="QR-facture détectée">🔳</span> : null}
          </p>
          <p className="text-sm text-gray-500">
            {f.client_id ? (
              <Link
                href={`/app/clients/${f.client_id}`}
                className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                {f.client_nom}
              </Link>
            ) : (
              f.client_nom
            )}{" "}
            · {f.numero_facture || "n° ?"} ·{" "}
            {f.total_ttc !== null ? `${f.total_ttc} ${f.devise}` : "montant ?"}
            {f.confiance_globale !== null
              ? ` · confiance ${Math.round(f.confiance_globale * 100)}%`
              : ""}
          </p>
          {f.anomalies.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {f.anomalies.map((a) => {
                const fraude = a === "incoherence_qr_ia_iban";
                return (
                  <li
                    key={a}
                    className={`text-xs ${fraude ? "font-semibold text-rose-700" : "text-amber-700"}`}
                  >
                    {fraude ? "" : "⚠️ "}
                    {libelleAnomalie(a)}
                  </li>
                );
              })}
            </ul>
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
        <form action={onValider} className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
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
          {f.a_iban_qr ? (
            <IbanQrField masque={f.iban_paiement_masque} />
          ) : (
            <Field
              label="IBAN (à saisir)"
              name="fournisseur_iban"
              def=""
              placeholder="CHxx…"
              prov={prov("iban")}
            />
          )}
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

          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ Valider la facture
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onRejeter}
              className="rounded border px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Rejeter
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/**
 * Affichage de l'IBAN issu du QR-bill (C6.1, ADR 0024 §5). L'IBAN est au Vault dès la
 * proposition : le validateur voit le MASQUE (jamais le clair ni le vault_id) avec un badge
 * « QR ✓ » et confirme sans retaper. À la validation, l'action récupère le clair depuis le Vault
 * si aucun IBAN n'est saisi (cf. validerFactureAction). Le validateur peut TOUT DE MÊME corriger :
 * révéler un champ `fournisseur_iban` qui, s'il est rempli, prime sur l'IBAN du QR.
 */
function IbanQrField({ masque }: { masque: string }) {
  const [corriger, setCorriger] = useState(false);
  if (corriger) {
    return (
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-gray-600">
          <span>IBAN</span>
          <ChampBadge prov={{ source: "qr", confiance: 1 }} />
        </span>
        <input
          name="fournisseur_iban"
          defaultValue=""
          placeholder="CHxx…"
          className="rounded border px-2 py-1"
        />
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-gray-600">
        <span>IBAN</span>
        <ChampBadge prov={{ source: "qr", confiance: 1 }} />
      </span>
      <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1">
        <span className="font-mono text-emerald-900" title="IBAN issu du QR-bill">
          {masque || "IBAN au coffre"}
        </span>
        <button
          type="button"
          onClick={() => setCorriger(true)}
          className="shrink-0 text-xs text-blue-600 hover:underline"
        >
          Corriger
        </button>
      </div>
    </div>
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
  // Deux régimes de disparition :
  // - REJET (pas de saisie en jeu) : optimiste — la carte disparaît immédiatement, rollback
  //   automatique de useOptimistic + toast en cas d'échec serveur.
  // - VALIDATION (formulaire de correction rempli) : disparition SEULEMENT à la confirmation
  //   serveur — si on démontait la carte optimistiquement, un échec (IBAN invalide, Zod…)
  //   perdrait les saisies de l'utilisateur au remontage. En erreur, le formulaire reste
  //   monté avec ses valeurs + toast.
  const [idsTraitees, marquerTraitees] = useOptimistic<Set<string>, string[]>(
    new Set(),
    (prev, ids) => new Set([...prev, ...ids]),
  );
  const [pending, startTransition] = useTransition();

  const enAttente = factures.filter((f) => !idsTraitees.has(f.id));

  function valider(id: string, formData: FormData) {
    startTransition(async () => {
      const res = await validerFactureAction({}, formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      // Masque la carte sans attendre le payload revalidé (toujours dans la transition).
      marquerTraitees([id]);
      // Pas de toast de succès unitaire (la disparition EST le feedback) — mais les signaux
      // de vigilance retournés par la validation restent montrés, sinon ils partiraient avec
      // la carte (icône + texte, pas seulement la couleur).
      if (res.iban_change_detecte) {
        toast.warning("⚠️ Changement d'IBAN signalé (fraude possible).");
      }
      if (res.doublons) {
        toast.warning(`⚠️ ${res.doublons} doublon(s) potentiel(s) détecté(s).`);
      }
    });
  }

  function rejeter(id: string) {
    startTransition(async () => {
      marquerTraitees([id]);
      const res = await rejeterFactureAction(id, "Pas une facture");
      if (res.error) toast.error(res.error);
    });
  }

  if (enAttente.length === 0) {
    return <p className="text-sm text-gray-500">Aucune facture en attente de validation.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {enAttente.map((f) => (
        <FactureCard
          key={f.id}
          f={f}
          peutValider={peutValider}
          pending={pending}
          onValider={(formData) => valider(f.id, formData)}
          onRejeter={() => rejeter(f.id)}
        />
      ))}
    </ul>
  );
}
