"use client";

import { useActionState } from "react";
import type { BancaireDossierData } from "@/lib/bancaire-dossier-data";
import { helpAttrs } from "@/lib/help-attrs";
import {
  type AccesLogicielActionState,
  upsertAccesLogicielAction,
} from "../acces-logiciel/actions";
import {
  type BanqueActionState,
  createBanqueAction,
  supprimerBanqueAction,
  updateBanqueAction,
} from "../banque/actions";
import { type RelationActionState, upsertRelationAction } from "../facturation/actions";

// Lot 5 (ADR 0025 §6) — Sections bancaire / facturation / accès logiciel du dossier client.
// ⚠️ ANTI-CLAIR (ADR 0013) : aucun IBAN/credential en clair n'est affiché — seulement un masque
// (****0012) + un indicateur « configuré ». La saisie part chiffrée au Vault côté serveur.
// RBAC : `peutEcrire=false` (lecteur) ⇒ lecture seule (aucun formulaire rendu).

const USAGES = [
  { value: "principal", label: "Principal" },
  { value: "secondaire", label: "Secondaire" },
  { value: "paie", label: "Paie" },
  { value: "tva", label: "TVA" },
];

const MODELES = [
  { value: "forfait", label: "Forfait" },
  { value: "regie", label: "Régie" },
  { value: "mixte", label: "Mixte" },
];

const LABEL_USAGE: Record<string, string> = {
  principal: "Principal",
  secondaire: "Secondaire",
  paie: "Paie",
  tva: "TVA",
};

// Styles alignés sur les composants ui/ (Input h-8 13px, Button h-8) — tokens hairline/radius.
const FIELD =
  "mt-1 block w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL = "block text-xs font-medium text-slate-600";
const BTN_PRIMARY =
  "inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60";
const BTN_DANGER =
  "inline-flex h-8 items-center rounded-md border border-rose-300 px-3 text-[13px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60";
const CARD = "rounded-lg border border-border bg-card p-4 shadow-card";

function Erreur({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-sm text-rose-600" role="alert">
      {message}
    </p>
  );
}

function Succes({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <p className="mt-2 text-sm text-emerald-600">Enregistré (chiffré).</p>;
}

function NouveauCompte({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<BanqueActionState, FormData>(
    createBanqueAction,
    {},
  );
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="client_id" value={clientId} />
      <label className={LABEL}>
        Nom de la banque
        <input className={FIELD} name="nom_banque" placeholder="UBS, PostFinance…" />
      </label>
      <label className={LABEL}>
        IBAN <span className="text-rose-600">*</span>
        <input className={FIELD} name="iban" placeholder="CH.." required />
      </label>
      <label className={LABEL}>
        BIC
        <input className={FIELD} name="bic" />
      </label>
      <label className={LABEL}>
        Usage
        <select className={FIELD} name="usage" defaultValue="">
          <option value="">—</option>
          {USAGES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        Credentials Open Banking (optionnel — stockés chiffrés)
        <input
          className={FIELD}
          name="credentials_open_banking"
          type="password"
          autoComplete="off"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          className={BTN_PRIMARY}
          type="submit"
          disabled={pending}
          {...helpAttrs(
            "Ajouter le compte bancaire",
            "Enregistre un nouveau compte pour ce client. L'IBAN et les identifiants sont chiffrés au repos.",
          )}
        >
          {pending ? "Enregistrement…" : "Ajouter le compte"}
        </button>
        <Erreur message={state.error} />
        <Succes visible={Boolean(state.success)} />
      </div>
    </form>
  );
}

function CompteRow({ compte }: { compte: BancaireDossierData["comptes"][number] }) {
  const [upd, updateAction, updPending] = useActionState<BanqueActionState, FormData>(
    updateBanqueAction,
    {},
  );
  const [del, deleteAction, delPending] = useActionState<BanqueActionState, FormData>(
    supprimerBanqueAction,
    {},
  );
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {compte.nom_banque ?? "Compte bancaire"}
            {compte.usage ? (
              <span className="ml-2 text-xs text-slate-500">({LABEL_USAGE[compte.usage]})</span>
            ) : null}
          </p>
          <p className="font-mono text-xs text-slate-500">
            IBAN {compte.iban_masque ?? "****"} · {compte.devise}
            {compte.open_banking_configure ? " · Open Banking configuré" : ""}
          </p>
        </div>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={compte.id} />
          <button
            className={BTN_DANGER}
            type="submit"
            disabled={delPending}
            {...helpAttrs(
              "Archiver le compte",
              "Retire ce compte des comptes actifs du client. L'historique reste conservé.",
            )}
          >
            {delPending ? "…" : "Archiver"}
          </button>
        </form>
      </div>
      <Erreur message={del.error} />
      <form action={updateAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={compte.id} />
        <label className={LABEL}>
          Nom de la banque
          <input className={FIELD} name="nom_banque" defaultValue={compte.nom_banque ?? ""} />
        </label>
        <label className={LABEL}>
          Nouvel IBAN (laisser vide pour conserver)
          <input className={FIELD} name="iban" placeholder={compte.iban_masque ?? "CH.."} />
        </label>
        <label className={LABEL}>
          BIC
          <input className={FIELD} name="bic" defaultValue={compte.bic ?? ""} />
        </label>
        <label className={LABEL}>
          Usage
          <select className={FIELD} name="usage" defaultValue={compte.usage ?? ""}>
            <option value="">—</option>
            {USAGES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <button
            className={BTN_PRIMARY}
            type="submit"
            disabled={updPending}
            {...helpAttrs(
              "Mettre à jour le compte",
              "Enregistre les modifications de ce compte. Laissez l'IBAN vide pour conserver l'actuel.",
            )}
          >
            {updPending ? "Enregistrement…" : "Mettre à jour"}
          </button>
          <Erreur message={upd.error} />
          <Succes visible={Boolean(upd.success)} />
        </div>
      </form>
    </div>
  );
}

function Facturation({
  clientId,
  facturation,
}: {
  clientId: string;
  facturation: BancaireDossierData["facturation"];
}) {
  const [state, action, pending] = useActionState<RelationActionState, FormData>(
    upsertRelationAction,
    {},
  );
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="client_id" value={clientId} />
      <label className={LABEL}>
        Pack tarifaire
        <input
          className={FIELD}
          name="pack_tarifaire"
          defaultValue={facturation?.pack_tarifaire ?? ""}
        />
      </label>
      <label className={LABEL}>
        Honoraires mensuels (CHF)
        <input
          className={FIELD}
          name="honoraires_mensuels"
          type="number"
          step="0.01"
          min="0"
          defaultValue={facturation?.honoraires_mensuels ?? ""}
        />
      </label>
      <label className={LABEL}>
        Modèle d'honoraires
        <select
          className={FIELD}
          name="honoraires_modele"
          defaultValue={facturation?.honoraires_modele ?? ""}
        >
          <option value="">—</option>
          {MODELES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Durée d'engagement (mois)
        <input
          className={FIELD}
          name="duree_engagement_mois"
          type="number"
          min="0"
          defaultValue={facturation?.duree_engagement_mois ?? ""}
        />
      </label>
      <label className={LABEL}>
        Date de signature
        <input
          className={FIELD}
          name="date_signature"
          type="date"
          defaultValue={facturation?.date_signature ?? ""}
        />
      </label>
      <label className={LABEL}>
        Date de renouvellement
        <input
          className={FIELD}
          name="date_renouvellement"
          type="date"
          defaultValue={facturation?.date_renouvellement ?? ""}
        />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        IBAN de facturation (ultra-sensible — stocké chiffré)
        {facturation?.iban_facturation_configure ? (
          <span className="ml-2 font-mono text-xs text-slate-500">
            actuel : {facturation.iban_facturation_masque ?? "****"}
          </span>
        ) : null}
        <input
          className={FIELD}
          name="iban_facturation"
          placeholder={facturation?.iban_facturation_masque ?? "CH.."}
        />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        Notes de facturation
        <textarea
          className={FIELD}
          name="notes_facturation"
          rows={2}
          defaultValue={facturation?.notes_facturation ?? ""}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          className={BTN_PRIMARY}
          type="submit"
          disabled={pending}
          {...helpAttrs(
            "Enregistrer la facturation",
            "Sauvegarde les conditions de facturation (pack, honoraires, engagement) et l'IBAN de facturation chiffré.",
          )}
        >
          {pending ? "Enregistrement…" : "Enregistrer la facturation"}
        </button>
        <Erreur message={state.error} />
        <Succes visible={Boolean(state.success)} />
      </div>
    </form>
  );
}

function AccesLogiciel({ clientId, configure }: { clientId: string; configure: boolean }) {
  const [state, action, pending] = useActionState<AccesLogicielActionState, FormData>(
    upsertAccesLogicielAction,
    {},
  );
  return (
    <form action={action} className="grid grid-cols-1 gap-3">
      <input type="hidden" name="client_id" value={clientId} />
      <p className="text-xs text-slate-500">
        {configure
          ? "Des credentials sont enregistrés (chiffrés au Vault). Saisir pour remplacer."
          : "Aucun credential enregistré."}
      </p>
      <label className={LABEL}>
        Accès logiciel comptable (utilisateur / mot de passe / clé — stocké chiffré)
        <input
          className={FIELD}
          name="acces_logiciel_externe"
          type="password"
          autoComplete="off"
          required
        />
      </label>
      <div>
        <button
          className={BTN_PRIMARY}
          type="submit"
          disabled={pending}
          {...helpAttrs(
            "Enregistrer l'accès logiciel",
            "Sauvegarde les identifiants d'accès au logiciel comptable du client, chiffrés au Vault.",
          )}
        >
          {pending ? "Enregistrement…" : "Enregistrer l'accès"}
        </button>
        <Erreur message={state.error} />
        <Succes visible={Boolean(state.success)} />
      </div>
    </form>
  );
}

export function BancaireSection({
  clientId,
  data,
  peutEcrire,
}: {
  clientId: string;
  data: BancaireDossierData;
  peutEcrire: boolean;
}) {
  return (
    <section id="bancaire" className="mt-10 space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Bancaire & facturation
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Les IBAN et identifiants sont chiffrés au repos (Vault) ; seuls des masques sont affichés.
        </p>
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-slate-800">Comptes bancaires</h3>
        <div className="mt-3 space-y-3">
          {data.comptes.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun compte enregistré.</p>
          ) : (
            data.comptes.map((c) =>
              peutEcrire ? (
                <CompteRow key={c.id} compte={c} />
              ) : (
                <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">
                    {c.nom_banque ?? "Compte bancaire"}
                    {c.usage ? (
                      <span className="ml-2 text-xs text-slate-500">({LABEL_USAGE[c.usage]})</span>
                    ) : null}
                  </p>
                  <p className="font-mono text-xs text-slate-500">
                    IBAN {c.iban_masque ?? "****"} · {c.devise}
                  </p>
                </div>
              ),
            )
          )}
          {peutEcrire ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ajouter un compte
              </h4>
              <NouveauCompte clientId={clientId} />
            </div>
          ) : null}
        </div>
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-slate-800">Conditions de facturation</h3>
        <div className="mt-3">
          {peutEcrire ? (
            <Facturation clientId={clientId} facturation={data.facturation} />
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Pack</dt>
              <dd className="text-slate-800">{data.facturation?.pack_tarifaire ?? "—"}</dd>
              <dt className="text-slate-500">Honoraires</dt>
              <dd className="text-slate-800">{data.facturation?.honoraires_mensuels ?? "—"}</dd>
              <dt className="text-slate-500">IBAN facturation</dt>
              <dd className="font-mono text-slate-800">
                {data.facturation?.iban_facturation_masque ?? "—"}
              </dd>
            </dl>
          )}
        </div>
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-semibold text-slate-800">Accès logiciel comptable</h3>
        <div className="mt-3">
          {peutEcrire ? (
            <AccesLogiciel clientId={clientId} configure={data.acces_logiciel_configure} />
          ) : (
            <p className="text-sm text-slate-600">
              {data.acces_logiciel_configure
                ? "Accès configuré (chiffré)."
                : "Aucun accès enregistré."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
