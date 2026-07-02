import { getCurrentUser } from "@zarya/auth";
import { cabinet, client as clientTable, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ClientNav } from "@/components/client/client-nav";
import { UserMenu } from "@/components/client/user-menu";
import { resolveBranding } from "@/lib/client-space";

/**
 * Coquille du mini-dashboard CLIENT (Bloc F2, dashboard-client.md §4).
 * Réservée au rôle `client_contact` (sinon → dashboard fiduciaire). Le parent
 * (app)/layout.tsx a déjà vérifié l'authentification. Header aux couleurs du cabinet
 * (CSS vars, défauts ZARYA si non configuré) ; navigation mobile-first ; footer ZARYA.
 * Périmètre strict : le contact ne voit QUE son client (scope app_metadata.client_id).
 */
export default async function EspaceClientLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const role = user?.app_metadata.role as string | undefined;
  const client_id = user?.app_metadata.client_id as string | undefined;
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (role !== "client_contact" || !client_id || !cabinet_id) {
    redirect("/app");
  }

  const [[cab], [cli]] = await Promise.all([
    db
      .select({
        raison_sociale: cabinet.raison_sociale,
        logo_url: cabinet.logo_url,
        couleur_primaire: cabinet.couleur_primaire,
        couleur_secondaire: cabinet.couleur_secondaire,
      })
      .from(cabinet)
      .where(eq(cabinet.id, cabinet_id))
      .limit(1),
    db
      .select({ raison_sociale: clientTable.raison_sociale })
      .from(clientTable)
      .where(and(eq(clientTable.id, client_id), eq(clientTable.cabinet_id, cabinet_id)))
      .limit(1),
  ]);

  const branding = resolveBranding(cab);
  const cssVars = {
    "--couleur-primaire": branding.couleurPrimaire,
    "--couleur-secondaire": branding.couleurSecondaire,
  } as CSSProperties;

  return (
    <div style={cssVars} className="min-h-screen bg-slate-50">
      <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: logo cabinet externe, pas d'optimisation Next requise (MVP).
            <img
              src={branding.logoUrl}
              alt={cab?.raison_sociale ?? "Cabinet"}
              className="h-8 w-auto"
            />
          ) : (
            <span className="font-semibold" style={{ color: "var(--couleur-primaire)" }}>
              {cab?.raison_sociale ?? "Cabinet"}
            </span>
          )}
          {cli?.raison_sociale ? (
            <span className="text-sm text-gray-500">· {cli.raison_sociale}</span>
          ) : null}
        </div>
        <UserMenu email={user?.email ?? ""} />
      </header>

      <ClientNav />

      <main className="px-4 pb-20 pt-20 lg:pl-60">{children}</main>

      <footer className="px-4 pb-24 pt-4 text-center text-xs text-gray-400 lg:pb-4 lg:pl-60">
        Propulsé par{" "}
        <a href="https://zarya.ch" className="underline">
          ZARYA
        </a>
      </footer>
    </div>
  );
}
