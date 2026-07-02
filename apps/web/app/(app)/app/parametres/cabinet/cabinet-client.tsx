"use client";

import { useActionState } from "react";
import { helpAttrs } from "@/lib/help-attrs";
import { type SauvegarderCabinetState, sauvegarderCabinetAction } from "./actions";

type CabinetData = {
  raison_sociale: string;
  ide: string | null;
  forme_juridique: string | null;
  email_contact: string | null;
  telephone: string | null;
  site_web: string | null;
  adresse_rue: string | null;
  adresse_npa: string | null;
  adresse_ville: string | null;
  adresse_canton: string | null;
  tva_numero: string | null;
  langue_principale: string | null;
  devise: string | null;
  fuseau_horaire: string | null;
};

type Props = {
  cabinet: CabinetData;
  isResponsable: boolean;
};

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  readOnly,
  hint,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${
          readOnly
            ? "border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
            : "border-slate-300 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        }`}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  readOnly,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  readOnly?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        disabled={readOnly}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${
          readOnly
            ? "border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
            : "border-slate-300 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function CabinetClient({ cabinet: cab, isResponsable }: Props) {
  const [state, formAction, isPending] = useActionState<SauvegarderCabinetState, FormData>(
    sauvegarderCabinetAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* ── Identité légale ──────────────────────────────────────────────────── */}
      <Section title="Identité légale">
        <div className="sm:col-span-2">
          <Field
            label="Raison sociale"
            name="raison_sociale"
            defaultValue={cab.raison_sociale}
            readOnly={!isResponsable}
            placeholder="Fiduciaire Dupont SA"
          />
        </div>
        <Field
          label="IDE (UID suisse)"
          name="ide"
          defaultValue={cab.ide ?? ""}
          readOnly
          hint="Renseigné depuis Zefix — non modifiable"
        />
        <Field
          label="Forme juridique"
          name="forme_juridique"
          defaultValue={cab.forme_juridique ?? ""}
          readOnly
          hint="Renseigné depuis Zefix — non modifiable"
        />
        <Field
          label="N° TVA"
          name="tva_numero"
          defaultValue={cab.tva_numero ?? ""}
          placeholder="CHE-XXX.XXX.XXX TVA"
          readOnly={!isResponsable}
          maxLength={20}
        />
        <Field
          label="Email de contact"
          name="email_contact"
          type="email"
          defaultValue={cab.email_contact ?? ""}
          placeholder="contact@cabinet.ch"
          readOnly={!isResponsable}
        />
      </Section>

      {/* ── Adresse ──────────────────────────────────────────────────────────── */}
      <Section title="Adresse">
        <div className="sm:col-span-2">
          <Field
            label="Rue et numéro"
            name="adresse_rue"
            defaultValue={cab.adresse_rue ?? ""}
            placeholder="Route de Lausanne 12"
            readOnly={!isResponsable}
          />
        </div>
        <Field
          label="NPA"
          name="adresse_npa"
          defaultValue={cab.adresse_npa ?? ""}
          placeholder="1200"
          readOnly={!isResponsable}
          maxLength={10}
        />
        <Field
          label="Localité"
          name="adresse_ville"
          defaultValue={cab.adresse_ville ?? ""}
          placeholder="Genève"
          readOnly={!isResponsable}
        />
        <Field
          label="Canton"
          name="adresse_canton"
          defaultValue={cab.adresse_canton ?? ""}
          placeholder="GE"
          readOnly={!isResponsable}
          maxLength={2}
        />
      </Section>

      {/* ── Contact & web ─────────────────────────────────────────────────────── */}
      <Section title="Contact & web">
        <Field
          label="Téléphone"
          name="telephone"
          type="tel"
          defaultValue={cab.telephone ?? ""}
          placeholder="+41 22 000 00 00"
          readOnly={!isResponsable}
          maxLength={30}
        />
        <Field
          label="Site web"
          name="site_web"
          type="url"
          defaultValue={cab.site_web ?? ""}
          placeholder="https://cabinet.ch"
          readOnly={!isResponsable}
        />
      </Section>

      {/* ── Préférences ───────────────────────────────────────────────────────── */}
      <Section title="Préférences">
        <SelectField
          label="Langue principale"
          name="langue_principale"
          defaultValue={cab.langue_principale ?? "fr"}
          readOnly={!isResponsable}
          options={[
            { value: "fr", label: "Français" },
            { value: "de", label: "Deutsch" },
            { value: "it", label: "Italiano" },
            { value: "en", label: "English" },
          ]}
        />
        <SelectField
          label="Devise"
          name="devise"
          defaultValue={cab.devise ?? "CHF"}
          readOnly={!isResponsable}
          options={[
            { value: "CHF", label: "CHF — Franc suisse" },
            { value: "EUR", label: "EUR — Euro" },
          ]}
        />
        <div className="sm:col-span-2">
          <SelectField
            label="Fuseau horaire"
            name="fuseau_horaire"
            defaultValue={cab.fuseau_horaire ?? "Europe/Zurich"}
            readOnly={!isResponsable}
            options={[
              { value: "Europe/Zurich", label: "Europe/Zurich (UTC+1 / UTC+2)" },
              { value: "Europe/Paris", label: "Europe/Paris (UTC+1 / UTC+2)" },
              { value: "Europe/London", label: "Europe/London (UTC+0 / UTC+1)" },
            ]}
          />
        </div>
      </Section>

      {/* ── Actions ───────────────────────────────────────────────────────────── */}
      {isResponsable && (
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-50"
            {...helpAttrs(
              "Enregistrer les modifications",
              "Sauvegarde les coordonnées et préférences du cabinet. Les champs issus de Zefix (IDE, forme juridique) ne sont pas modifiables.",
            )}
          >
            {isPending ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
          {state.success && <p className="text-sm text-green-600">Modifications enregistrées ✓</p>}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        </div>
      )}
    </form>
  );
}
