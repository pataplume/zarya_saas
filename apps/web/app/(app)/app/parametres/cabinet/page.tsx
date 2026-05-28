import { getCurrentUser } from "@zarya/auth";
import { cabinet, db } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CabinetClient } from "./cabinet-client";

export default async function CabinetPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const userRole = (user?.app_metadata.role as string | undefined) ?? "collaborateur";
  const isResponsable = userRole === "responsable";

  const [cab] = await db
    .select({
      raison_sociale: cabinet.raison_sociale,
      ide: cabinet.ide,
      forme_juridique: cabinet.forme_juridique,
      email_contact: cabinet.email_contact,
      telephone: cabinet.telephone,
      site_web: cabinet.site_web,
      adresse_rue: cabinet.adresse_rue,
      adresse_npa: cabinet.adresse_npa,
      adresse_ville: cabinet.adresse_ville,
      adresse_canton: cabinet.adresse_canton,
      tva_numero: cabinet.tva_numero,
      langue_principale: cabinet.langue_principale,
      devise: cabinet.devise,
      fuseau_horaire: cabinet.fuseau_horaire,
    })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);

  if (!cab) redirect("/onboarding");

  return <CabinetClient cabinet={cab} isResponsable={isResponsable} />;
}
