"use client";

import { useActionState, useEffect, useState } from "react";
import type {
  ClientEditAdresse,
  ClientEditContact,
  ClientEditData,
  ClientEditIdentite,
  ClientEditMembre,
} from "@/lib/dossier-client-edit-data";
import { type ClientActionState, updateClientAction } from "../actions";
import {
  type AdresseActionState,
  createAdresseAction,
  supprimerAdresseAction,
  updateAdresseAction,
} from "../adresses/actions";
import {
  type ContactActionState,
  createContactAction,
  supprimerContactAction,
  updateContactAction,
} from "../contacts/actions";

// Lot 1 (ADR 0025) — Dossier client ÉDITABLE : identité étendue + CRUD contacts + CRUD
// adresses. RBAC : `peutEcrire=false` (lecteur) ⇒ lecture seule (aucun formulaire rendu).
// Toute mutation passe par les server actions scopées cabinet_id (Zod + audit côté serveur).

const TYPES_CLIENT = [
  { value: "pme", label: "PME" },
  { value: "independant", label: "Indépendant" },
  { value: "prive", label: "Privé" },
  { value: "association", label: "Association" },
];

const LANGUES = [
  { value: "fr", label: "Français" },
  { value: "de", label: "Allemand" },
  { value: "it", label: "Italien" },
  { value: "en", label: "Anglais" },
];

const STATUTS = [
  { value: "prospect", label: "Prospect" },
  { value: "actif", label: "Actif" },
  { value: "inactif", label: "Inactif" },
];

const TYPES_ADRESSE = [
  { value: "siege", label: "Siège" },
  { value: "facturation", label: "Facturation" },
  { value: "postale", label: "Postale" },
];

const LABEL_TYPE_ADRESSE: Record<string, string> = {
  siege: "Siège",
  facturation: "Facturation",
  postale: "Postale",
};

const FIELD =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:ring-blue-500";
const LABEL = "block text-xs font-medium text-slate-600";
const BTN_PRIMARY =
  "inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
const CARD = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

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
  return <p className="mt-2 text-sm text-emerald-600">Enregistré.</p>;
}

// Champ texte dont le <input> est imbriqué dans le <label> : associe explicitement
// le contrôle au libellé (a11y) sans devoir générer des id uniques pour les listes.
function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  type,
  required,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        name={name}
        type={type ?? "text"}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className={FIELD}
      />
    </label>
  );
}

// ─── Section identité ─────────────────────────────────────────────────────────

function IdentiteSection({
  identite,
  membres,
}: {
  identite: ClientEditIdentite;
  membres: ClientEditMembre[];
}) {
  const [state, formAction, pending] = useActionState<ClientActionState, FormData>(
    updateClientAction,
    {},
  );

  return (
    <section id="identite" className="scroll-mt-20">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Identité</h2>
      <form action={formAction} className={CARD}>
        <input type="hidden" name="id" value={identite.id} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="raison_sociale">
              Raison sociale
            </label>
            <input
              id="raison_sociale"
              name="raison_sociale"
              defaultValue={identite.raison_sociale}
              className={FIELD}
              required
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="type">
              Type
            </label>
            <select id="type" name="type" defaultValue={identite.type} className={FIELD}>
              {TYPES_CLIENT.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="statut">
              Statut
            </label>
            <select id="statut" name="statut" defaultValue={identite.statut} className={FIELD}>
              {STATUTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="ide">
              IDE
            </label>
            <input
              id="ide"
              name="ide"
              defaultValue={identite.ide ?? ""}
              placeholder="CHE-123.456.789"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="numero_tva">
              Numéro de TVA
            </label>
            <input
              id="numero_tva"
              name="numero_tva"
              defaultValue={identite.numero_tva ?? ""}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="forme_juridique">
              Forme juridique
            </label>
            <input
              id="forme_juridique"
              name="forme_juridique"
              defaultValue={identite.forme_juridique ?? ""}
              placeholder="SA, Sàrl…"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="langue">
              Langue
            </label>
            <select id="langue" name="langue" defaultValue={identite.langue} className={FIELD}>
              {LANGUES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="responsable_id">
              Gestionnaire référent
            </label>
            <select
              id="responsable_id"
              name="responsable_id"
              defaultValue={identite.responsable_id ?? ""}
              className={FIELD}
            >
              <option value="">— Non assigné</option>
              {membres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom_complet}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="email_contact">
              Email de contact
            </label>
            <input
              id="email_contact"
              name="email_contact"
              type="email"
              defaultValue={identite.email_contact ?? ""}
              className={FIELD}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="tags">
              Tags (séparés par des virgules)
            </label>
            <input
              id="tags"
              name="tags"
              defaultValue={identite.tags.join(", ")}
              placeholder="VIP, dossier sensible…"
              className={FIELD}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="notes_commerciales">
              Notes commerciales
            </label>
            <textarea
              id="notes_commerciales"
              name="notes_commerciales"
              defaultValue={identite.notes_commerciales ?? ""}
              rows={3}
              className={FIELD}
            />
          </div>
        </div>
        <Erreur message={state.error} />
        <Succes visible={!!state.success} />
        <div className="mt-4 flex gap-2">
          <button type="submit" className={BTN_PRIMARY} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer l'identité"}
          </button>
          {/* Annuler explicite (UX Lot 4) : la section identité est un formulaire toujours
              ouvert (pas de bascule lecture/édition comme EditRow) — le reset natif restaure
              les valeurs enregistrées (defaultValue) sans sauvegarder. */}
          <button type="reset" className={BTN_SECONDARY}>
            Annuler
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Section contacts ─────────────────────────────────────────────────────────

function ContactForm({
  contact,
  onDone,
}: {
  contact?: ClientEditContact;
  clientId: string;
  onDone?: () => void;
}) {
  const action = contact ? updateContactAction : createContactAction;
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(action, {});

  // Ferme le formulaire d'édition au succès (effet, pas pendant le render).
  useEffect(() => {
    if (state.success && onDone) onDone();
  }, [state.success, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Prénom" name="prenom" defaultValue={contact?.prenom ?? ""} />
        <TextField label="Nom" name="nom" defaultValue={contact?.nom ?? ""} required />
        <TextField
          label="Rôle"
          name="role"
          defaultValue={contact?.role ?? ""}
          placeholder="Dirigeant, Comptable…"
        />
        <TextField label="Email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        <TextField label="Téléphone" name="telephone" defaultValue={contact?.telephone ?? ""} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="est_principal" defaultChecked={contact?.est_principal} />
          Principal
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="est_contact_rh" defaultChecked={contact?.est_contact_rh} />
          Contact RH
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="est_signataire" defaultChecked={contact?.est_signataire} />
          Signataire
        </label>
      </div>
      <Erreur message={state.error} />
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "…" : contact ? "Enregistrer" : "Ajouter le contact"}
        </button>
        {contact && onDone && (
          <button type="button" className={BTN_SECONDARY} onClick={onDone}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function ContactLigne({ contact, clientId }: { contact: ClientEditContact; clientId: string }) {
  const [edition, setEdition] = useState(false);
  const [, supprimerAction, pendingSuppr] = useActionState<ContactActionState, FormData>(
    supprimerContactAction,
    {},
  );

  const badges: string[] = [];
  if (contact.est_principal) badges.push("Principal");
  if (contact.est_contact_rh) badges.push("RH");
  if (contact.est_signataire) badges.push("Signataire");

  if (edition) {
    return (
      <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <ContactForm contact={contact} clientId={clientId} onDone={() => setEdition(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">
            {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
          </span>
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
            >
              {b}
            </span>
          ))}
        </div>
        {contact.role && <p className="text-xs text-slate-500">{contact.role}</p>}
        <p className="mt-0.5 text-xs text-slate-500">
          {[contact.email, contact.telephone].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={() => setEdition(true)}>
          Modifier
        </button>
        <form action={supprimerAction}>
          <input type="hidden" name="id" value={contact.id} />
          <button
            type="submit"
            className="inline-flex items-center rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            disabled={pendingSuppr}
          >
            Supprimer
          </button>
        </form>
      </div>
    </li>
  );
}

function ContactsSection({
  contacts,
  clientId,
}: {
  contacts: ClientEditContact[];
  clientId: string;
}) {
  const [ajout, setAjout] = useState(false);
  return (
    <section id="contacts" className="mt-10 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Contacts</h2>
        {!ajout && (
          <button type="button" className={BTN_SECONDARY} onClick={() => setAjout(true)}>
            + Ajouter un contact
          </button>
        )}
      </div>
      <div className={CARD}>
        {ajout && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <ContactCreateInline clientId={clientId} onDone={() => setAjout(false)} />
          </div>
        )}
        {contacts.length === 0 && !ajout ? (
          <p className="text-sm text-slate-400">Aucun contact enregistré.</p>
        ) : (
          <ul className="space-y-3">
            {contacts.map((c) => (
              <ContactLigne key={c.id} contact={c} clientId={clientId} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// Formulaire de création inline : embarque client_id en champ caché.
function ContactCreateInline({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(
    createContactAction,
    {},
  );
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Prénom" name="prenom" />
        <TextField label="Nom" name="nom" required />
        <TextField label="Rôle" name="role" placeholder="Dirigeant, Comptable…" />
        <TextField label="Email" name="email" type="email" />
        <TextField label="Téléphone" name="telephone" />
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="est_principal" />
          Principal
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="est_contact_rh" />
          Contact RH
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="est_signataire" />
          Signataire
        </label>
      </div>
      <Erreur message={state.error} />
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "…" : "Ajouter le contact"}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  );
}

// ─── Section adresses ─────────────────────────────────────────────────────────

function AdresseFields({ adresse }: { adresse?: ClientEditAdresse }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Type</span>
          <select name="type" defaultValue={adresse?.type ?? "siege"} className={FIELD}>
            {TYPES_ADRESSE.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Rue" name="rue" defaultValue={adresse?.rue ?? ""} />
        <TextField label="Complément" name="complement" defaultValue={adresse?.complement ?? ""} />
        <TextField
          label="Code postal"
          name="code_postal"
          defaultValue={adresse?.code_postal ?? ""}
        />
        <TextField label="Ville" name="ville" defaultValue={adresse?.ville ?? ""} />
        <TextField
          label="Canton"
          name="canton"
          defaultValue={adresse?.canton ?? ""}
          placeholder="VD"
          maxLength={2}
        />
        <TextField
          label="Pays"
          name="pays"
          defaultValue={adresse?.pays ?? "CH"}
          placeholder="CH"
          maxLength={2}
        />
      </div>
      <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="est_principale" defaultChecked={adresse?.est_principale} />
        Adresse principale
      </label>
    </>
  );
}

function AdresseCreateInline({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<AdresseActionState, FormData>(
    createAdresseAction,
    {},
  );
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <AdresseFields />
      <Erreur message={state.error} />
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "…" : "Ajouter l'adresse"}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function AdresseLigne({ adresse }: { adresse: ClientEditAdresse }) {
  const [edition, setEdition] = useState(false);
  const [stateEdit, editAction, pendingEdit] = useActionState<AdresseActionState, FormData>(
    updateAdresseAction,
    {},
  );
  const [, supprimerAction, pendingSuppr] = useActionState<AdresseActionState, FormData>(
    supprimerAdresseAction,
    {},
  );
  useEffect(() => {
    if (stateEdit.success) setEdition(false);
  }, [stateEdit.success]);

  const lignes = [
    adresse.rue,
    adresse.complement,
    [adresse.code_postal, adresse.ville].filter(Boolean).join(" "),
    [adresse.canton, adresse.pays].filter(Boolean).join(" · "),
  ].filter((l) => l && l.length > 0);

  if (edition) {
    return (
      <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <form action={editAction} className="space-y-3">
          <input type="hidden" name="id" value={adresse.id} />
          <AdresseFields adresse={adresse} />
          <Erreur message={stateEdit.error} />
          <div className="flex gap-2">
            <button type="submit" className={BTN_PRIMARY} disabled={pendingEdit}>
              {pendingEdit ? "…" : "Enregistrer"}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => setEdition(false)}>
              Annuler
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">
            {LABEL_TYPE_ADRESSE[adresse.type] ?? adresse.type}
          </span>
          {adresse.est_principale && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
              Principale
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{lignes.join(", ") || "—"}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={() => setEdition(true)}>
          Modifier
        </button>
        <form action={supprimerAction}>
          <input type="hidden" name="id" value={adresse.id} />
          <button
            type="submit"
            className="inline-flex items-center rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            disabled={pendingSuppr}
          >
            Supprimer
          </button>
        </form>
      </div>
    </li>
  );
}

function AdressesSection({
  adresses,
  clientId,
}: {
  adresses: ClientEditAdresse[];
  clientId: string;
}) {
  const [ajout, setAjout] = useState(false);
  return (
    <section id="adresses" className="mt-10 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Adresses</h2>
        {!ajout && (
          <button type="button" className={BTN_SECONDARY} onClick={() => setAjout(true)}>
            + Ajouter une adresse
          </button>
        )}
      </div>
      <div className={CARD}>
        {ajout && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <AdresseCreateInline clientId={clientId} onDone={() => setAjout(false)} />
          </div>
        )}
        {adresses.length === 0 && !ajout ? (
          <p className="text-sm text-slate-400">Aucune adresse enregistrée.</p>
        ) : (
          <ul className="space-y-3">
            {adresses.map((a) => (
              <AdresseLigne key={a.id} adresse={a} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Bloc éditable complet ────────────────────────────────────────────────────

export function DossierEditClient({
  data,
  peutEcrire,
}: {
  data: ClientEditData;
  peutEcrire: boolean;
}) {
  if (!peutEcrire) {
    // Lecteur : lecture seule. Le dossier d'affichage (page.tsx) rend déjà les données ;
    // on signale juste que l'édition n'est pas permise pour ce rôle.
    return (
      <section id="identite" className="mt-10 scroll-mt-20">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          Votre rôle est en lecture seule : l'édition du dossier client n'est pas disponible.
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-2">
      <IdentiteSection identite={data.identite} membres={data.membres} />
      <ContactsSection contacts={data.contacts} clientId={data.identite.id} />
      <AdressesSection adresses={data.adresses} clientId={data.identite.id} />
    </div>
  );
}
