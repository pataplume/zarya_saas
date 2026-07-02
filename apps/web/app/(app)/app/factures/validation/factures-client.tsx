"use client";

import { ChevronLeft, ChevronRight, ExternalLink, RotateCw } from "lucide-react";
import Link from "next/link";
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
import { useFileKeyboard } from "@/lib/hooks/use-file-keyboard";
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
  /**
   * Fichier physique du document source (doc.document → doc.fichier_physique), servi par
   * /api/documents/[fichierId]/apercu (session + cabinet re-vérifiés côté route). Null si
   * la jointure n'aboutit pas → « Aperçu indisponible ».
   */
  fichier_id: string | null;
  /** Type MIME du fichier (sert à décider si l'iframe peut rendre l'aperçu nativement). */
  type_mime: string | null;
}

function val(n: number | null): string {
  return n === null ? "" : String(n);
}

// Confiance en dessous de laquelle on attire l'attention du validateur ("à vérifier").
const SEUIL_CONFIANCE_FAIBLE = 0.6;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Éligibilité à la validation EN LOT : le lot soumet les valeurs extraites TELLES QUELLES
 * (sans passage par le formulaire), donc il est réservé aux factures sans anomalie, avec
 * IBAN-du-QR au Vault (récupéré côté serveur par validerFactureAction) et dont tous les
 * champs OBLIGATOIRES du schéma serveur (ValiderSchema) sont déjà présents.
 * Retourne null si éligible, sinon le motif (affiché en title sur la checkbox désactivée).
 */
function motifIneligibleLot(f: FactureItem): string | null {
  if (f.anomalies.length > 0) return "Anomalies détectées — à vérifier via le formulaire";
  if (!f.a_iban_qr) return "IBAN absent — à saisir via le formulaire";
  if (!f.fournisseur_raison_sociale) return "Raison sociale manquante — à saisir via le formulaire";
  if (!f.numero_facture) return "Numéro de facture manquant — à saisir via le formulaire";
  if (!DATE_RE.test(f.date_emission))
    return "Date d'émission manquante — à saisir via le formulaire";
  if (f.total_ht === null || f.total_ttc === null)
    return "Montants incomplets — à vérifier via le formulaire";
  if (f.date_echeance !== "" && !DATE_RE.test(f.date_echeance))
    return "Date d'échéance invalide — à corriger via le formulaire";
  return null;
}

/**
 * Construit le FormData de validerFactureAction depuis les valeurs EXTRAITES, à l'identique
 * des defaultValue du formulaire « Vérifier & valider » (mêmes noms de champs, mêmes replis
 * compte_charge/montant_a_payer). `fournisseur_iban` est volontairement absent : côté serveur,
 * l'IBAN-du-QR au Vault prend le relais (d'où l'éligibilité restreinte à a_iban_qr).
 */
function formDataDepuisProposition(f: FactureItem): FormData {
  const fd = new FormData();
  fd.set("proposition_id", f.id);
  fd.set("fournisseur_raison_sociale", f.fournisseur_raison_sociale);
  fd.set("fournisseur_ide", f.fournisseur_ide);
  fd.set("fournisseur_numero_tva", f.fournisseur_numero_tva);
  fd.set("numero_facture", f.numero_facture);
  fd.set("compte_charge", f.categorie || "6000");
  fd.set("date_emission", f.date_emission);
  fd.set("date_echeance", f.date_echeance);
  fd.set("total_ht", val(f.total_ht));
  fd.set("total_tva", val(f.total_tva));
  fd.set("total_ttc", val(f.total_ttc));
  fd.set("montant_a_payer", val(f.montant_a_payer ?? f.total_ttc));
  fd.set("taux_tva_principal", val(f.taux_tva_principal));
  fd.set("devise", f.devise);
  return fd;
}

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

/** Types MIME que le navigateur sait rendre nativement dans une iframe (PDF, images, texte). */
function estPrevisualisable(typeMime: string | null): boolean {
  if (!typeMime) return true; // inconnu → on tente l'iframe plutôt que de priver d'aperçu
  return (
    typeMime === "application/pdf" || typeMime.startsWith("image/") || typeMime.startsWith("text/")
  );
}

/**
 * Volet gauche du split-screen (desktop lg+) : aperçu du document source via
 * /api/documents/[fichierId]/apercu (URL signée Storage, TTL 300 s — la route re-vérifie
 * session + cabinet, on ne contourne rien). L'URL signée expirant après 5 min, le bouton
 * « Recharger l'aperçu » re-set le src avec un cache-buster pour re-signer.
 */
function ApercuDocument({
  fichierId,
  typeMime,
  titre,
}: {
  fichierId: string | null;
  typeMime: string | null;
  titre: string;
}) {
  const [version, setVersion] = useState(0);
  const disponible = fichierId !== null && estPrevisualisable(typeMime);
  return (
    <div className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
      {disponible ? (
        <>
          <iframe
            key={version}
            src={`/api/documents/${fichierId}/apercu${version > 0 ? `?v=${version}` : ""}`}
            title={`Aperçu du document — ${titre}`}
            className="h-[80vh] w-full rounded border border-gray-200 bg-gray-50"
          />
          <button
            type="button"
            onClick={() => setVersion(Date.now())}
            title="L'aperçu expire après 5 minutes — recharger si la page grise"
            className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Recharger l'aperçu
          </button>
        </>
      ) : (
        <div className="flex h-[80vh] flex-col items-center justify-center gap-2 rounded border border-dashed border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">Aperçu indisponible</p>
          {fichierId !== null ? (
            <a
              href={`/api/documents/${fichierId}/apercu`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Ouvrir le document
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FactureCard({
  f,
  peutValider,
  pending,
  actif,
  open,
  selectionne,
  motifLot,
  cardRef,
  onFocus,
  onToggleOpen,
  onToggleSelection,
  onValider,
  onRejeter,
  onPrecedente,
  onSuivante,
}: {
  f: FactureItem;
  peutValider: boolean;
  pending: boolean;
  /** Carte sous le curseur clavier (J/N/P) : anneau bleu + scrollIntoView côté parent. */
  actif: boolean;
  /** Formulaire « Vérifier & valider » ouvert — état remonté au parent pour le raccourci V. */
  open: boolean;
  selectionne: boolean;
  /** null = éligible au lot ; sinon motif affiché en title sur la checkbox désactivée. */
  motifLot: string | null;
  cardRef: (el: HTMLLIElement | null) => void;
  onFocus: () => void;
  onToggleOpen: () => void;
  onToggleSelection: () => void;
  onValider: (formData: FormData) => void;
  onRejeter: () => void;
  /** Navigation dans la file sans fermer le split — null = pas de facture précédente. */
  onPrecedente: (() => void) | null;
  /** Navigation dans la file sans fermer le split — null = pas de facture suivante. */
  onSuivante: (() => void) | null;
}) {
  // Provenance d'un champ de formulaire pour ce document (ADR 0024).
  const prov = (champ: string): ConfianceChampUi | undefined =>
    provenanceChamp(f.confiance_par_champ, champ);

  return (
    <li
      ref={cardRef}
      onMouseDown={onFocus}
      className={`rounded border p-4 ${actif ? "border-blue-300 ring-2 ring-blue-500" : "border-gray-200"}`}
    >
      <div className="flex items-center justify-between gap-4">
        {peutValider ? (
          <input
            type="checkbox"
            checked={selectionne}
            onChange={onToggleSelection}
            disabled={motifLot !== null}
            title={motifLot ?? "Sélectionner pour la validation en lot"}
            aria-label="Sélectionner pour la validation en lot"
            className="h-4 w-4 shrink-0 self-start rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
          />
        ) : null}
        <div className="min-w-0 flex-1">
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
          <div className="flex shrink-0 items-center gap-2">
            {open ? (
              // En-tête du split : passer à la facture précédente/suivante de la liste
              // visible sans fermer le mode vérification (déplace aussi le curseur clavier).
              <>
                <button
                  type="button"
                  onClick={onPrecedente ?? undefined}
                  disabled={onPrecedente === null}
                  title="Facture précédente"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Précédente
                </button>
                <button
                  type="button"
                  onClick={onSuivante ?? undefined}
                  disabled={onSuivante === null}
                  title="Facture suivante"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Suivante
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onToggleOpen}
              className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              {open ? "Fermer" : "Vérifier & valider"}
            </button>
          </div>
        ) : null}
      </div>

      {open && peutValider ? (
        // Split-screen (lg+) : aperçu du document à gauche (sticky), formulaire à droite.
        // Sur mobile, pas d'iframe — un lien « Ouvrir le document » au-dessus du formulaire.
        <div className="mt-4 border-t pt-4 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-6">
          <ApercuDocument
            fichierId={f.fichier_id}
            typeMime={f.type_mime}
            titre={f.fournisseur_raison_sociale || f.numero_facture || "facture à valider"}
          />
          <div className="min-w-0">
            {f.fichier_id !== null ? (
              <a
                href={`/api/documents/${f.fichier_id}/apercu`}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline lg:hidden"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Ouvrir le document
              </a>
            ) : null}
            <form action={onValider} className="grid grid-cols-2 gap-3 text-sm">
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
          </div>
        </div>
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

  // Curseur clavier (J/N/P) + formulaire ouvert (état remonté pour le raccourci V) +
  // sélection pour la validation en lot.
  const [cursor, setCursor] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const enAttente = useMemo(
    () => factures.filter((f) => !idsTraitees.has(f.id)),
    [factures, idsTraitees],
  );
  const eligiblesLot = useMemo(
    () => enAttente.filter((f) => motifIneligibleLot(f) === null),
    [enAttente],
  );

  const retirerDeSelection = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  function valider(id: string, formData: FormData) {
    startTransition(async () => {
      const res = await validerFactureAction({}, formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      // Masque la carte sans attendre le payload revalidé (toujours dans la transition).
      marquerTraitees([id]);
      retirerDeSelection([id]);
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

  const rejeter = useCallback(
    (id: string) => {
      startTransition(async () => {
        marquerTraitees([id]);
        const res = await rejeterFactureAction(id, "Pas une facture");
        if (res.error) toast.error(res.error);
        else retirerDeSelection([id]);
      });
    },
    [marquerTraitees, retirerDeSelection],
  );

  // Validation EN LOT : boucle séquentielle sur validerFactureAction avec les valeurs
  // extraites telles quelles (formDataDepuisProposition). Régime existant respecté :
  // chaque carte ne disparaît qu'à la CONFIRMATION serveur de SON item (pas d'optimiste
  // anticipé), les échecs restent affichés et comptés.
  function validerSelection() {
    const items = enAttente.filter((f) => selected.has(f.id) && motifIneligibleLot(f) === null);
    if (items.length === 0) return;
    startTransition(async () => {
      const reussis: string[] = [];
      let echecs = 0;
      let ibanChanges = 0;
      let doublons = 0;
      for (const f of items) {
        const res = await validerFactureAction({}, formDataDepuisProposition(f));
        if (res.error) {
          echecs++;
          continue;
        }
        marquerTraitees([f.id]);
        reussis.push(f.id);
        if (res.iban_change_detecte) ibanChanges++;
        if (res.doublons) doublons += res.doublons;
      }
      retirerDeSelection(reussis);
      if (reussis.length > 0) {
        toast.success(
          `${reussis.length} facture${reussis.length > 1 ? "s" : ""} validée${reussis.length > 1 ? "s" : ""}`,
        );
      }
      if (echecs > 0) {
        toast.error(`${echecs} échec${echecs > 1 ? "s" : ""} — à vérifier via le formulaire`);
      }
      if (ibanChanges > 0) {
        toast.warning(
          `⚠️ ${ibanChanges} changement${ibanChanges > 1 ? "s" : ""} d'IBAN signalé${ibanChanges > 1 ? "s" : ""} (fraude possible).`,
        );
      }
      if (doublons > 0) {
        toast.warning(`⚠️ ${doublons} doublon(s) potentiel(s) détecté(s).`);
      }
    });
  }

  function toggleUn(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const toutSelectionne = eligiblesLot.length > 0 && eligiblesLot.every((f) => selected.has(f.id));

  function toggleTout() {
    setSelected(toutSelectionne ? new Set() : new Set(eligiblesLot.map((f) => f.id)));
  }

  // Raccourcis clavier partagés des files ZARYA. Suspendus quand un formulaire de facture
  // est ouvert (openId) : on ne rejette pas pendant une saisie ; Échap referme le formulaire.
  const formulaireOuvert = openId !== null;
  const onAction = useCallback(
    (index: number) => {
      const f = enAttente[index];
      if (f) setOpenId((cur) => (cur === f.id ? null : f.id));
    },
    [enAttente],
  );
  const onRejeterCourant = useCallback(
    (index: number) => {
      const f = enAttente[index];
      if (f) rejeter(f.id);
    },
    [enAttente, rejeter],
  );
  useFileKeyboard({
    count: enAttente.length,
    cursor,
    setCursor,
    onAction,
    onRejeter: onRejeterCourant,
    enabled: peutValider && !formulaireOuvert,
  });

  // Navigation précédent/suivant depuis l'en-tête du split : ferme le formulaire courant,
  // ouvre celui de la facture voisine dans la liste VISIBLE et déplace le curseur clavier
  // (cohérent avec J/N/P + V : à la fermeture par Échap, le curseur est sur la bonne carte).
  const naviguer = useCallback(
    (index: number, delta: number) => {
      const cible = enAttente[index + delta];
      if (!cible) return;
      setCursor(index + delta);
      setOpenId(cible.id);
    },
    [enAttente],
  );

  // Échap referme le formulaire ouvert (pendant que les autres raccourcis sont suspendus).
  useEffect(() => {
    if (!formulaireOuvert) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formulaireOuvert]);

  // Garder le curseur valide + visible quand la liste change (y compris après disparition
  // optimiste : le curseur pointe l'item suivant visible, jamais hors limites).
  useEffect(() => {
    if (cursor > enAttente.length - 1) setCursor(Math.max(0, enAttente.length - 1));
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, enAttente.length]);

  if (enAttente.length === 0) {
    return <p className="text-sm text-gray-500">Aucune facture en attente de validation.</p>;
  }
  return (
    <div>
      {peutValider ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-gray-200 bg-white p-3">
          <label
            className="flex items-center gap-2 text-sm text-gray-600"
            title="Sélectionne les factures sans anomalie dont l'IBAN et les champs obligatoires sont présents"
          >
            <input
              type="checkbox"
              checked={toutSelectionne}
              onChange={toggleTout}
              disabled={eligiblesLot.length === 0}
              className="h-4 w-4 rounded border-gray-300"
            />
            Tout sélectionner
          </label>
          <button
            type="button"
            onClick={validerSelection}
            disabled={selected.size === 0 || pending}
            className="inline-flex items-center rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? "Validation…"
              : `Valider la sélection${selected.size ? ` (${selected.size})` : ""}`}
          </button>
          <span className="ml-auto hidden text-xs text-gray-400 sm:inline">
            Raccourcis : <kbd className="font-semibold">J</kbd> début ·{" "}
            <kbd className="font-semibold">N</kbd> suivant · <kbd className="font-semibold">P</kbd>{" "}
            précédent · <kbd className="font-semibold">V</kbd> vérifier ·{" "}
            <kbd className="font-semibold">R</kbd> rejeter
          </span>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {enAttente.map((f, i) => (
          <FactureCard
            key={f.id}
            f={f}
            peutValider={peutValider}
            pending={pending}
            actif={i === cursor}
            open={openId === f.id}
            selectionne={selected.has(f.id)}
            motifLot={motifIneligibleLot(f)}
            cardRef={(el) => {
              rowRefs.current[i] = el;
            }}
            onFocus={() => setCursor(i)}
            onToggleOpen={() => setOpenId((cur) => (cur === f.id ? null : f.id))}
            onToggleSelection={() => toggleUn(f.id)}
            onValider={(formData) => valider(f.id, formData)}
            onRejeter={() => rejeter(f.id)}
            onPrecedente={i > 0 ? () => naviguer(i, -1) : null}
            onSuivante={i < enAttente.length - 1 ? () => naviguer(i, 1) : null}
          />
        ))}
      </ul>
    </div>
  );
}
