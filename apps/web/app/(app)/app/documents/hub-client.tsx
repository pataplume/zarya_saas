"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { helpAttrs } from "@/lib/help-attrs";
import { archiverDocumentAction, reclasserDocumentAction } from "./actions";

// Hub Documents — interactivité client minimale : onglets pilotés par ?tab=
// (replaceState superficiel, pas de re-fetch serveur) + bouton « Reclasser ».
// Tout le contenu des onglets est rendu côté serveur et passé en ReactNode.

export type HubTab = "documents" | "emails";

function urlPourOnglet(tab: HubTab): string {
  return tab === "emails" ? "/app/documents?tab=emails" : "/app/documents";
}

// Next.js synchronise useSearchParams avec window.history.replaceState :
// l'URL reflète l'onglet (lien direct partageable) sans navigation serveur.
// Exception : si une pagination est active (?page=), changer d'onglet remet
// page=1 via une vraie navigation serveur, pour que les panneaux (rendus
// serveur par ?page=, onglet inactif = page 1) restent cohérents avec l'URL.
function useChangerOnglet(): (tab: HubTab) => void {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aPagination = searchParams.has("page");
  return (tab: HubTab) => {
    const url = urlPourOnglet(tab);
    if (aPagination) router.push(url);
    else window.history.replaceState(null, "", url);
  };
}

export function HubTabs({
  initialTab,
  nbDocuments,
  nbEmails,
  documentsPanel,
  emailsPanel,
}: {
  initialTab: HubTab;
  nbDocuments: number;
  nbEmails: number;
  documentsPanel: ReactNode;
  emailsPanel: ReactNode;
}) {
  const searchParams = useSearchParams();
  const changerOnglet = useChangerOnglet();
  const param = searchParams.get("tab");
  const tab: HubTab =
    param === "emails" ? "emails" : param === "documents" ? "documents" : initialTab;

  const classeOnglet = (actif: boolean) =>
    `-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      actif
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Documents et emails reçus"
        className="flex items-center gap-1 border-b border-border"
      >
        <button
          type="button"
          role="tab"
          id="onglet-documents"
          aria-selected={tab === "documents"}
          aria-controls="panneau-documents"
          onClick={() => changerOnglet("documents")}
          className={classeOnglet(tab === "documents")}
          {...helpAttrs(
            "Documents reçus",
            "Affiche vos dépôts et les pièces jointes captées par email, avec leur classement. Cliquez pour ouvrir cet onglet.",
          )}
        >
          Documents reçus ({nbDocuments})
        </button>
        <button
          type="button"
          role="tab"
          id="onglet-emails"
          aria-selected={tab === "emails"}
          aria-controls="panneau-emails"
          onClick={() => changerOnglet("emails")}
          className={classeOnglet(tab === "emails")}
          {...helpAttrs(
            "Emails reçus",
            "Liste les emails captés depuis votre boîte Microsoft connectée. Cliquez pour ouvrir cet onglet et suivre les pièces jointes classées.",
          )}
        >
          Emails reçus ({nbEmails})
        </button>
      </div>
      <div
        id="panneau-documents"
        role="tabpanel"
        aria-labelledby="onglet-documents"
        hidden={tab !== "documents"}
        className="mt-4"
      >
        {documentsPanel}
      </div>
      <div
        id="panneau-emails"
        role="tabpanel"
        aria-labelledby="onglet-emails"
        hidden={tab !== "emails"}
        className="mt-4"
      >
        {emailsPanel}
      </div>
    </div>
  );
}

// Lien « → N documents » dans l'onglet Emails : bascule sur l'onglet Documents
// sans navigation serveur (même mécanisme replaceState que les onglets).
export function LienOngletDocuments({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const changerOnglet = useChangerOnglet();
  return (
    <button
      type="button"
      onClick={() => changerOnglet("documents")}
      className={className}
      {...helpAttrs(
        "Voir ces documents",
        "Bascule sur l'onglet Documents pour retrouver les pièces jointes classées de cet email.",
      )}
    >
      {children}
    </button>
  );
}

// Bouton « Reclasser » : relance la classification d'un upload bloqué
// (statut 'recu' ou 'erreur') via la server action, puis rafraîchit la liste.
export function ReclasserButton({ uploadBrutId }: { uploadBrutId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);

  function onClick() {
    setRetour(null);
    startTransition(async () => {
      const r = await reclasserDocumentAction(uploadBrutId);
      if (r.success) {
        setRetour({ ok: true, message: "Reclassement relancé." });
        router.refresh();
      } else {
        setRetour({ ok: false, message: r.error ?? "Le reclassement a échoué." });
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={isPending}
        className="disabled:cursor-wait"
        {...helpAttrs(
          "Relancer le classement",
          "Redemande à ZARYA d'analyser un dépôt bloqué ou en erreur. Le document repart en classement et réapparaît à valider si l'IA réussit.",
        )}
      >
        {isPending ? "Reclassement…" : "Reclasser"}
      </Button>
      {retour && (
        <span className={`text-xs ${retour.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {retour.message}
        </span>
      )}
    </span>
  );
}

// RUN 3 — Bouton « Archiver » (soft-delete) avec confirmation (action destructive).
// Retire un document validé mal classé / en double des listes. Bloqué s'il a déjà produit
// une facture (le garde-fou vit dans archiverDocumentAction). Sur succès, retour au hub :
// le document n'apparaît plus dans les listings (`redirectTo` par défaut = /app/documents).
export function ArchiverButton({
  documentId,
  redirectTo = "/app/documents",
}: {
  documentId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function confirmer() {
    setErreur(null);
    startTransition(async () => {
      const r = await archiverDocumentAction(documentId);
      if (r.success) {
        setOuvert(false);
        router.push(redirectTo);
        router.refresh();
      } else {
        setErreur(r.error ?? "L'archivage a échoué.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => {
          setErreur(null);
          setOuvert(true);
        }}
        {...helpAttrs(
          "Archiver le document",
          "Retire ce document mal classé ou en double des listes. Bloqué s'il a déjà produit une facture.",
        )}
      >
        Archiver
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archiver ce document ?</DialogTitle>
            <DialogDescription>
              Le document sera retiré des listes (dépôts, dossier client). Utile pour un document
              mal classé ou en double. Un document ayant déjà produit une facture ne peut pas être
              archivé.
            </DialogDescription>
          </DialogHeader>
          {erreur && <p className="text-sm text-rose-600">{erreur}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOuvert(false)}
              disabled={isPending}
            >
              Retour
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmer}
              disabled={isPending}
              className="disabled:cursor-wait"
            >
              {isPending ? "Archivage…" : "Archiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
