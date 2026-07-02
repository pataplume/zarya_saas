"use client";

// Écran /parametres/integrations — UI Microsoft Graph : statut, connecter/déconnecter,
// bannière région hors-zone (D3) + accusé. Textes FR en dur (interface fiduciaire interne,
// pas de next-intl câblé — convention parametres/*).
import type { MicrosoftIntegrationParams, MicrosoftIntegrationStatut } from "@zarya/integrations";
import { useActionState } from "react";
import { acknowledgeRegionAction, disconnectMicrosoftAction } from "./actions";

const CONNECT_URL = "/api/integrations/microsoft/connect";

const STATUT_LABEL: Record<MicrosoftIntegrationStatut, string> = {
  actif: "Connecté",
  revoque: "Déconnecté — reconnexion requise",
  erreur: "Erreur",
  en_attente: "En attente",
};

export function IntegrationsClient({
  isResponsable,
  connected,
  statut,
  derniereErreur,
  params,
  callback,
}: {
  isResponsable: boolean;
  connected: boolean;
  statut: MicrosoftIntegrationStatut | null;
  derniereErreur: string | null;
  params: MicrosoftIntegrationParams;
  callback: { microsoft: string | null; region: string | null; detail: string | null };
}) {
  const regionHorsZone = params.region_adequate === false;
  const regionAcknowledged = Boolean(params.region_acknowledged_at);
  const showRegionBanner = connected && regionHorsZone && !regionAcknowledged;
  // H2 — connexion expirée/révoquée : l'envoi d'emails (relances, notifs salaire) est
  // suspendu tant que le cabinet n'a pas reconnecté Microsoft 365.
  const showReconnectBanner = !connected && statut === "revoque";

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Intégrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connectez la messagerie Microsoft 365 du cabinet pour l'ingestion des emails et l'envoi
          des relances depuis votre boîte.
        </p>
      </header>

      {/* Bandeau retour de callback OAuth */}
      {callback.microsoft === "connected" && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Connexion Microsoft réussie.
        </p>
      )}
      {callback.microsoft === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Échec de la connexion Microsoft{callback.detail ? ` (${callback.detail})` : ""}.
          Réessayez.
        </p>
      )}

      {showReconnectBanner && (
        <ReconnectBanner isResponsable={isResponsable} derniereErreur={derniereErreur} />
      )}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium text-slate-900">Microsoft 365</h2>
            <StatusLine connected={connected} statut={statut} params={params} />
            {statut === "erreur" && derniereErreur && (
              <p className="mt-1 text-xs text-red-600">{derniereErreur}</p>
            )}
          </div>
          <StatusBadge connected={connected} statut={statut} />
        </div>

        {showRegionBanner && <RegionBanner params={params} isResponsable={isResponsable} />}

        <div className="mt-5 flex gap-3">
          {connected ? (
            <DisconnectButton isResponsable={isResponsable} />
          ) : (
            <ConnectButton isResponsable={isResponsable} reconnect={statut === "revoque"} />
          )}
        </div>
        {!isResponsable && (
          <p className="mt-3 text-xs text-slate-400">
            Seul un responsable du cabinet peut connecter ou déconnecter une intégration.
          </p>
        )}
      </section>
    </div>
  );
}

function ReconnectBanner({
  isResponsable,
  derniereErreur,
}: {
  isResponsable: boolean;
  derniereErreur: string | null;
}) {
  return (
    <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">
        Connexion Microsoft 365 expirée — reconnexion requise
      </p>
      <p className="mt-1 text-sm text-amber-700">
        L'envoi des emails depuis votre boîte (relances documents et salaires, notifications) est
        suspendu jusqu'à la reconnexion. L'ingestion des nouveaux emails est également interrompue.
        Reconnectez-vous pour reprendre.
      </p>
      {derniereErreur && <p className="mt-1 text-xs text-amber-600">Détail : {derniereErreur}</p>}
      {isResponsable ? (
        <a
          href={CONNECT_URL}
          className="mt-3 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          Reconnecter Microsoft 365
        </a>
      ) : (
        <p className="mt-2 text-xs text-amber-600">
          Un responsable du cabinet doit effectuer la reconnexion.
        </p>
      )}
    </div>
  );
}

function StatusLine({
  connected,
  statut,
  params,
}: {
  connected: boolean;
  statut: MicrosoftIntegrationStatut | null;
  params: MicrosoftIntegrationParams;
}) {
  if (!connected && !statut) {
    return <p className="mt-1 text-sm text-slate-500">Aucune intégration configurée.</p>;
  }
  return (
    <p className="mt-1 text-sm text-slate-600">
      {statut ? STATUT_LABEL[statut] : ""}
      {params.user_principal_name ? ` · ${params.user_principal_name}` : ""}
      {params.tenant_region ? ` · région ${params.tenant_region}` : ""}
    </p>
  );
}

function StatusBadge({
  connected,
  statut,
}: {
  connected: boolean;
  statut: MicrosoftIntegrationStatut | null;
}) {
  if (connected) {
    return (
      <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        ✓ Connecté
      </span>
    );
  }
  if (statut === "revoque" || statut === "erreur") {
    return (
      <span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        ⚠ Action requise
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      Non connecté
    </span>
  );
}

function ConnectButton({
  isResponsable,
  reconnect,
}: {
  isResponsable: boolean;
  reconnect: boolean;
}) {
  const label = reconnect ? "Reconnecter Microsoft 365" : "Connecter Microsoft 365";
  if (!isResponsable) {
    return (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
      >
        {label}
      </button>
    );
  }
  return (
    <a
      href={CONNECT_URL}
      className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
    >
      {label}
    </a>
  );
}

function DisconnectButton({ isResponsable }: { isResponsable: boolean }) {
  const [state, action, pending] = useActionState(disconnectMicrosoftAction, {});
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={!isResponsable || pending}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Déconnexion…" : "Déconnecter"}
      </button>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function RegionBanner({
  params,
  isResponsable,
}: {
  params: MicrosoftIntegrationParams;
  isResponsable: boolean;
}) {
  const [state, action, pending] = useActionState(acknowledgeRegionAction, {});
  const region = params.tenant_region ?? params.region_country_code ?? "hors UE/EEE";
  return (
    <div className="mt-4 rounded-md border-l-4 border-amber-400 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">
        Votre messagerie Microsoft est hébergée hors d'Europe
      </p>
      <p className="mt-1 text-sm text-amber-700">
        Microsoft indique que les emails de votre cabinet sont stockés en dehors de l'Union
        européenne ({region}). Rien d'inquiétant pour ZARYA : toutes les données que nous traitons
        restent hébergées en Europe (Francfort). Cet avertissement concerne uniquement l'endroit où
        Microsoft conserve vos emails — un réglage qui dépend de votre compte Microsoft, pas de
        ZARYA. Vous pouvez continuer sereinement.
      </p>
      {isResponsable ? (
        <form action={action} className="mt-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? "Enregistrement…" : "J'ai compris, continuer"}
          </button>
          {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
        </form>
      ) : (
        <p className="mt-2 text-xs text-amber-600">
          Un responsable doit accuser réception de cet avertissement.
        </p>
      )}
    </div>
  );
}
