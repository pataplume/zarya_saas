import { getCurrentUser } from "@zarya/auth";
import { cabinetMembre, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ProfilClient } from "./profil-client";

export default async function ProfilPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id || !user) redirect("/onboarding");

  const [membre] = await db
    .select({
      prenom: cabinetMembre.prenom,
      nom: cabinetMembre.nom,
      role: cabinetMembre.role,
      telephone: cabinetMembre.telephone,
      signature_email: cabinetMembre.signature_email,
    })
    .from(cabinetMembre)
    .where(and(eq(cabinetMembre.user_id, user.id), eq(cabinetMembre.cabinet_id, cabinet_id)))
    .limit(1);

  return (
    <ProfilClient
      email={user.email ?? ""}
      prenom={membre?.prenom ?? ""}
      nom={membre?.nom ?? ""}
      role={membre?.role ?? "collaborateur"}
      telephone={membre?.telephone ?? ""}
      signatureEmail={membre?.signature_email ?? ""}
    />
  );
}
