import { getCurrentUser } from "@zarya/auth";
import { cabinet, db } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CompteClient } from "./compte-client";

// Run I1 — onglet Compte : zone de danger / demande de suppression du compte cabinet.
export default async function ComptePage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "collaborateur";
  const isResponsable = role === "responsable";

  const [cab] = await db
    .select({ raison_sociale: cabinet.raison_sociale, statut: cabinet.statut })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);
  if (!cab) redirect("/onboarding");

  return (
    <CompteClient
      raisonSociale={cab.raison_sociale}
      statut={cab.statut}
      isResponsable={isResponsable}
    />
  );
}
