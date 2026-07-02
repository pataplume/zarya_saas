"use client";

import {
  logicielComptableSchema,
  modeTransmissionSchema,
  regimeTvaSchema,
  typeServiceSchema,
} from "@zarya/schemas";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ServiceRegime, ServicesRegimeData } from "@/lib/dossier-client-edit-data";
import { libelleLogicielComptable, libelleModeTransmission, libelleService } from "@/lib/libelles";
import {
  type ParamComptableActionState,
  upsertParamComptableAction,
} from "../param-comptable/actions";
import {
  configurerServicesClientAction,
  type ServiceCrudState,
  type ServicesActionState,
  supprimerServiceAction,
} from "../services/actions";

// UX Lot 4 — Section « Services & régime » du dossier client (trou connu UX-UI-MAP § annexe).
// Le back est prêt (Lot 2 ADR 0025) : cette UI câble les actions EXISTANTES, sans nouvelle
// convention — les champs viennent des schémas Zod des actions (`Schema` de
// configurerServicesClientAction, upsertParamComptableSchema) et de @zarya/schemas.
//   - Activation de services (checkboxes) → configurerServicesClientAction : crée crm.service
//     (+ crm.param_comptable si comptabilité) + checklist crm.document_attendu, puis
//     RÉGÉNÈRE les échéances (genererEcheancesPourClient, idempotent) — comportement voulu.
//   - Désactivation par service → supprimerServiceAction (soft-delete + audit).
//   - Paramètres comptables (bouclement, exercice, transmission) → upsertParamComptableAction
//     (re-génère aussi les échéances).
// RBAC : `peutEcrire=false` (lecteur) ⇒ lecture seule (aucun formulaire rendu).

// Valeurs EXACTES des enums partagés (source unique : packages/schemas — mêmes schémas
// que la validation serveur, cf. CLAUDE.md packages/schemas § 4).
const TYPES_SERVICE = typeServiceSchema.options;
const LOGICIELS = logicielComptableSchema.options;
const MODES_TRANSMISSION = modeTransmissionSchema.options;
const REGIMES_TVA = regimeTvaSchema.options;

// Libellés locaux (pas de fonction partagée dans @/lib/libelles pour ces deux enums —
// même précédent que TYPES_CLIENT/LANGUES dans dossier-edit-client.tsx).
const REGIME_TVA_LABEL: Record<string, string> = {
  effective_trimestre: "Effectif — trimestriel",
  effective_semestre: "Effectif — semestriel",
  forfaitaire_semestre: "Forfaitaire — semestriel",
  forfaitaire_annuel: "Forfaitaire — annuel",
  mensuel: "Mensuel",
};

const FREQUENCE_LABEL: Record<string, string> = {
  mensuelle: "Mensuelle",
  trimestrielle: "Trimestrielle",
  semestrielle: "Semestrielle",
  annuelle: "Annuelle",
  ponctuelle: "Ponctuelle",
};

const FIELD =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:ring-blue-500";
const LABEL = "block text-xs font-medium text-slate-600";
const BTN_PRIMARY =
  "inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60";
const BTN_DANGER =
  "inline-flex items-center rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60";
const CARD = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

function Erreur({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-sm text-rose-600" role="alert">
      {message}
    </p>
  );
}

function resumeService(s: ServiceRegime): string {
  const parts: string[] = [];
  if (s.frequence) parts.push(FREQUENCE_LABEL[s.frequence] ?? s.frequence);
  if (s.type === "tva" && s.regime_tva)
    parts.push(`Régime : ${REGIME_TVA_LABEL[s.regime_tva] ?? s.regime_tva}`);
  return parts.join(" · ");
}

// ─── Ligne d'un service actif (désactivation granulaire) ─────────────────────

function ServiceActifLigne({ service }: { service: ServiceRegime }) {
  const [state, action, pending] = useActionState<ServiceCrudState, FormData>(
    supprimerServiceAction,
    {},
  );
  useEffect(() => {
    if (state.success) toast.success("Service désactivé.");
  }, [state]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
      <div className="min-w-0">
        <span className="text-sm font-medium text-slate-800">{libelleService(service.type)}</span>
        {resumeService(service) && (
          <p className="text-xs text-slate-500">{resumeService(service)}</p>
        )}
        <Erreur message={state.error} />
      </div>
      {/* TODO(founder) : édition granulaire fréquence/régime d'un service DÉJÀ actif —
          updateServiceAction existe (régénère les échéances) mais l'évidence UI (inline vs
          formulaire dédié) n'est pas documentée. À arbitrer avant de câbler. */}
      <form action={action}>
        <input type="hidden" name="id" value={service.id} />
        <button type="submit" className={BTN_DANGER} disabled={pending}>
          {pending ? "…" : "Désactiver"}
        </button>
      </form>
    </li>
  );
}

// ─── Formulaire d'activation des services (bulk, idempotent) ─────────────────

function ServicesForm({
  clientId,
  data,
  actifs,
}: {
  clientId: string;
  data: ServicesRegimeData;
  actifs: Map<string, ServiceRegime>;
}) {
  const [state, formAction, pending] = useActionState<ServicesActionState, FormData>(
    configurerServicesClientAction,
    {},
  );
  // Services supplémentaires cochés par l'utilisateur (les actifs sont figés : cochés,
  // désactivation via le bouton « Désactiver » — l'action bulk est additive, décocher
  // ne désactive rien).
  const [extras, setExtras] = useState<string[]>([]);

  useEffect(() => {
    if (state.success) {
      toast.success("Services enregistrés — échéances régénérées");
      setExtras([]); // les services nouvellement actifs arrivent par revalidation serveur
    }
  }, [state]);

  const estCoche = (t: string) => actifs.has(t) || extras.includes(t);
  const comptaCochee = estCoche("comptabilite");
  const tvaCochee = estCoche("tva");
  const tvaActive = actifs.has("tva");
  const param = data.param_comptable;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />

      <fieldset>
        <legend className={LABEL}>Services souscrits</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPES_SERVICE.map((t) => {
            const actif = actifs.has(t);
            return (
              <label
                key={t}
                className={`inline-flex items-center gap-2 text-sm ${actif ? "text-slate-400" : "text-slate-700"}`}
              >
                {/* Service actif : case figée (l'action est additive — la désactivation
                    passe par le bouton « Désactiver » ci-dessus) + champ caché pour
                    satisfaire le min(1) du schéma. */}
                {actif && <input type="hidden" name="services" value={t} />}
                <input
                  type="checkbox"
                  name={actif ? undefined : "services"}
                  value={t}
                  checked={estCoche(t)}
                  disabled={actif}
                  onChange={(e) =>
                    setExtras((prev) =>
                      e.target.checked ? [...prev, t] : prev.filter((x) => x !== t),
                    )
                  }
                />
                {libelleService(t)}
                {actif && <span className="text-xs text-slate-400">(actif)</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      {comptaCochee && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>Logiciel comptable</span>
            <select name="compta_logiciel" defaultValue={param?.logiciel ?? ""} className={FIELD}>
              <option value="">— Non renseigné</option>
              {LOGICIELS.map((l) => (
                <option key={l} value={l}>
                  {libelleLogicielComptable(l)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Plan comptable</span>
            <input
              name="compta_plan"
              defaultValue={param?.plan_comptable ?? ""}
              placeholder="PME suisse, plan spécifique…"
              className={FIELD}
            />
          </label>
        </div>
      )}

      {tvaCochee && !tvaActive && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>Régime TVA</span>
            <select name="tva_regime" defaultValue="" className={FIELD}>
              <option value="">— Non renseigné</option>
              {REGIMES_TVA.map((r) => (
                <option key={r} value={r}>
                  {REGIME_TVA_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Périodicité TVA</span>
            <select name="tva_frequence" defaultValue="trimestrielle" className={FIELD}>
              <option value="trimestrielle">Trimestrielle</option>
              <option value="semestrielle">Semestrielle</option>
            </select>
          </label>
        </div>
      )}

      <Erreur message={state.error} />
      <div className="flex items-center gap-3">
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les services"}
        </button>
        <p className="text-xs text-slate-400">
          L'enregistrement crée les documents attendus et régénère les échéances.
        </p>
      </div>
    </form>
  );
}

// ─── Formulaire paramètres comptables (bouclement / exercice / transmission) ─

function ParamComptableForm({
  clientId,
  param,
}: {
  clientId: string;
  param: ServicesRegimeData["param_comptable"];
}) {
  const [state, formAction, pending] = useActionState<ParamComptableActionState, FormData>(
    upsertParamComptableAction,
    {},
  );
  useEffect(() => {
    if (state.success) toast.success("Paramètres comptables enregistrés — échéances régénérées");
  }, [state]);

  // NB : `logiciel` et `plan_comptable` (aussi présents dans upsertParamComptableSchema)
  // sont saisis via le formulaire Services ci-dessus (compta_logiciel / compta_plan) —
  // pas de double saisie ici.
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={LABEL}>Début d'exercice</span>
          <input
            type="date"
            name="date_debut_exercice"
            defaultValue={param?.date_debut_exercice ?? ""}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Date de bouclement</span>
          <input
            type="date"
            name="date_bouclement"
            defaultValue={param?.date_bouclement ?? ""}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Transmission des pièces</span>
          <select
            name="mode_transmission"
            defaultValue={param?.mode_transmission ?? ""}
            className={FIELD}
          >
            <option value="">— Non renseigné</option>
            {MODES_TRANSMISSION.map((m) => (
              <option key={m} value={m}>
                {libelleModeTransmission(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-3">
          <span className={LABEL}>Logiciel — précision (si « Autre »)</span>
          <input
            name="logiciel_autre"
            defaultValue={param?.logiciel_autre ?? ""}
            placeholder="Nom du logiciel"
            className={FIELD}
          />
        </label>
      </div>
      <Erreur message={state.error} />
      <button type="submit" className={BTN_PRIMARY} disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer les paramètres"}
      </button>
    </form>
  );
}

// ─── Section complète ─────────────────────────────────────────────────────────

export function ServicesRegimeSection({
  clientId,
  data,
  peutEcrire,
}: {
  clientId: string;
  data: ServicesRegimeData;
  peutEcrire: boolean;
}) {
  const actifs = new Map(data.services.map((s) => [s.type, s]));
  const comptaActive = actifs.has("comptabilite");

  if (!peutEcrire) {
    // Lecteur : lecture seule (même pattern que DossierEditClient / BancaireSection).
    return (
      <section id="services" className="mt-10 scroll-mt-20">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Services & régime
        </h2>
        <div className={CARD}>
          {data.services.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun service actif.</p>
          ) : (
            <ul className="space-y-2">
              {data.services.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">{libelleService(s.type)}</span>
                  <span className="text-slate-500">{resumeService(s) || "—"}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Votre rôle est en lecture seule : la configuration des services n'est pas disponible.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="services" className="mt-10 scroll-mt-20">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Services & régime
      </h2>
      <div className={CARD}>
        {data.services.length > 0 && (
          <ul className="mb-4 space-y-2">
            {data.services.map((s) => (
              <ServiceActifLigne key={s.id} service={s} />
            ))}
          </ul>
        )}
        <ServicesForm clientId={clientId} data={data} actifs={actifs} />
      </div>

      {comptaActive && (
        <div className={`mt-4 ${CARD}`}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Paramètres comptables
          </h3>
          <ParamComptableForm clientId={clientId} param={data.param_comptable} />
        </div>
      )}
    </section>
  );
}
