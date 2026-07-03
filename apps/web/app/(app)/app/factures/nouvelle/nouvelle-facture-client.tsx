"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { helpAttrs } from "@/lib/help-attrs";
import {
  creerFactureManuelleAction,
  type DocumentEligible,
  documentsEligiblesAction,
} from "./actions";

// Formulaire de saisie manuelle de facture (RUN4 usabilité). Suit les conventions déjà en
// place dans `components/salaire/periode-fiduciaire-client.tsx` (useActionState + Button/Input
// de components/ui + helpAttrs). Le document éligible dépend du client choisi : la liste se
// recharge via `documentsEligiblesAction` (lecture) dans un useTransition.

const INITIAL: { error?: string; success?: boolean; proposition_id?: string } = {};

type ClientOption = { id: string; raison_sociale: string };

export function NouvelleFactureForm({
  clients,
  clientIdInitial,
}: {
  clients: ClientOption[];
  clientIdInitial: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(creerFactureManuelleAction, INITIAL);
  const [clientId, setClientId] = useState<string>(clientIdInitial ?? "");
  const [documents, setDocuments] = useState<DocumentEligible[]>([]);
  const [chargementDocs, startChargementDocs] = useTransition();
  const [docsCharges, setDocsCharges] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setDocuments([]);
      setDocsCharges(false);
      return;
    }
    setDocsCharges(false);
    startChargementDocs(async () => {
      const docs = await documentsEligiblesAction(clientId);
      setDocuments(docs);
      setDocsCharges(true);
    });
  }, [clientId]);

  useEffect(() => {
    if (state.success) {
      toast.success("Facture ajoutée à la file de validation.");
      router.push("/app/factures/validation");
    }
  }, [state.success, router]);

  const aucunDocument = clientId !== "" && docsCharges && documents.length === 0;
  const peutSoumettre = clientId !== "" && documents.length > 0;

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Client" htmlFor="client-select" required>
          <Select
            id="client-select"
            name="client_id"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Sélectionner…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.raison_sociale}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Document justificatif" htmlFor="document-select" required>
          <Select
            id="document-select"
            name="document_id"
            required
            disabled={!peutSoumettre}
            defaultValue=""
          >
            <option value="">Sélectionner…</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.libelle}
                {d.date_document ? ` · ${d.date_document}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {aucunDocument ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Aucun document disponible pour ce client — uploadez d'abord le justificatif depuis{" "}
          <Link href={`/app/clients/${clientId}`} className="font-medium underline">
            sa fiche
          </Link>{" "}
          ou le hub documents.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Raison sociale fournisseur" htmlFor="fournisseur_raison_sociale" required>
          <Input id="fournisseur_raison_sociale" name="fournisseur_raison_sociale" required />
        </Field>
        <Field label="IDE" htmlFor="fournisseur_ide">
          <Input id="fournisseur_ide" name="fournisseur_ide" placeholder="CHE-xxx.xxx.xxx" />
        </Field>
        <Field label="N° TVA" htmlFor="fournisseur_numero_tva">
          <Input id="fournisseur_numero_tva" name="fournisseur_numero_tva" />
        </Field>
        <Field label="BIC" htmlFor="fournisseur_bic">
          <Input id="fournisseur_bic" name="fournisseur_bic" />
        </Field>

        <Field label="N° facture" htmlFor="numero_facture" required>
          <Input id="numero_facture" name="numero_facture" required />
        </Field>
        <Field label="Catégorie" htmlFor="categorie">
          <Input id="categorie" name="categorie" />
        </Field>

        <Field label="Date d'émission" htmlFor="date_emission" required>
          <Input id="date_emission" name="date_emission" type="date" required />
        </Field>
        <Field label="Date d'échéance" htmlFor="date_echeance">
          <Input id="date_echeance" name="date_echeance" type="date" />
        </Field>

        <Field label="Total HT" htmlFor="total_ht" required>
          <Input id="total_ht" name="total_ht" type="number" step="0.01" required />
        </Field>
        <Field label="Total TVA" htmlFor="total_tva">
          <Input id="total_tva" name="total_tva" type="number" step="0.01" />
        </Field>
        <Field label="Total TTC" htmlFor="total_ttc" required>
          <Input id="total_ttc" name="total_ttc" type="number" step="0.01" required />
        </Field>
        <Field label="Montant à payer" htmlFor="montant_a_payer" required>
          <Input id="montant_a_payer" name="montant_a_payer" type="number" step="0.01" required />
        </Field>

        <Field label="Taux TVA %" htmlFor="taux_tva_principal">
          <Input id="taux_tva_principal" name="taux_tva_principal" type="number" step="0.1" />
        </Field>
        <Field label="Devise" htmlFor="devise">
          <Select id="devise" name="devise" defaultValue="CHF">
            <option>CHF</option>
            <option>EUR</option>
            <option>USD</option>
            <option value="autre">Autre</option>
          </Select>
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button
          type="submit"
          disabled={pending || chargementDocs || !peutSoumettre}
          className="disabled:cursor-not-allowed"
          {...helpAttrs(
            "Créer et envoyer à la validation",
            "Ajoute cette facture à la file de validation, exactement comme une facture extraite automatiquement. Elle ne sera définitive qu'après vérification et validation.",
          )}
        >
          {pending ? "Création…" : "Créer et envoyer à la validation"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
