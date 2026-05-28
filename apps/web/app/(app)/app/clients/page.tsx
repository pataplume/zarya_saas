import { getCurrentUser } from "@zarya/auth";
import { client, db } from "@zarya/db";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClientsClient } from "./clients-client";

const ROLES_ECRITURE = ["responsable", "gestionnaire_salaires", "collaborateur"];

export default async function ClientsPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutEcrire = ROLES_ECRITURE.includes(role);
  const isResponsable = role === "responsable";

  const clients = await db
    .select({
      id: client.id,
      raison_sociale: client.raison_sociale,
      ide: client.ide,
      email_contact: client.email_contact,
      statut: client.statut,
      archived_at: client.archived_at,
    })
    .from(client)
    .where(eq(client.cabinet_id, cabinet_id))
    .orderBy(asc(client.raison_sociale));

  return <ClientsClient clients={clients} peutEcrire={peutEcrire} isResponsable={isResponsable} />;
}
