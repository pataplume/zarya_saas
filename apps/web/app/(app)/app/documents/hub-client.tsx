"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { reclasserDocumentAction } from "./actions";

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
    `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      actif
        ? "border-blue-600 text-blue-700"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
    }`;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Documents et emails reçus"
        className="flex gap-1 border-b border-slate-200"
      >
        <button
          type="button"
          role="tab"
          id="onglet-documents"
          aria-selected={tab === "documents"}
          aria-controls="panneau-documents"
          onClick={() => changerOnglet("documents")}
          className={classeOnglet(tab === "documents")}
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
    <button type="button" onClick={() => changerOnglet("documents")} className={className}>
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
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
      >
        {isPending ? "Reclassement…" : "Reclasser"}
      </button>
      {retour && (
        <span className={`text-xs ${retour.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {retour.message}
        </span>
      )}
    </span>
  );
}
