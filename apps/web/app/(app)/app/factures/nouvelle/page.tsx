import { getCurrentUser } from "@zarya/auth";
import { client, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { NouvelleFactureForm } from "./nouvelle-facture-client";

// Saisie manuelle de facture — RUN4 usabilité (PLAN-USABILITE-MVP.md). Formulaire qui crée
// une facture.proposition_facture (origine_saisie='saisie_manuelle') rejoignant la MÊME file
// de validation que l'extraction IA (arbitrage founder "double validation").

export default async function NouvelleFacturePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  if (role === "lecteur") redirect("/app/factures/validation");

  const clients = await db
    .select({ id: client.id, raison_sociale: client.raison_sociale })
    .from(client)
    .where(and(eq(client.cabinet_id, cabinet_id), eq(client.statut, "actif")))
    .orderBy(client.raison_sociale);

  const sp = await searchParams;
  const clientParse = z.string().uuid().safeParse(sp.client);
  const clientIdInitial =
    clientParse.success && clients.some((c) => c.id === clientParse.data) ? clientParse.data : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Facture manuelle"
        description="Créez une facture depuis les informations papier ou verbales du client. Elle rejoint la même file de validation que les factures extraites automatiquement."
      />
      <NouvelleFactureForm clients={clients} clientIdInitial={clientIdInitial} />
    </main>
  );
}
