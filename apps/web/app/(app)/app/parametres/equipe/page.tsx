import { getCurrentUser } from "@zarya/auth";
import { cabinetMembre, db, invitationMembre } from "@zarya/db";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { EquipeClient } from "./equipe-client";

export default async function EquipePage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const userRole = (user?.app_metadata.role as string | undefined) ?? "collaborateur";
  const isResponsable = userRole === "responsable";

  // Membres actifs avec email via la jointure invitation_membre
  const membresRaw = await db
    .select({
      id: cabinetMembre.id,
      user_id: cabinetMembre.user_id,
      role: cabinetMembre.role,
      prenom: cabinetMembre.prenom,
      nom: cabinetMembre.nom,
      email: invitationMembre.email,
      created_at: cabinetMembre.created_at,
    })
    .from(cabinetMembre)
    .leftJoin(invitationMembre, eq(invitationMembre.cabinet_membre_id, cabinetMembre.id))
    .where(
      and(
        eq(cabinetMembre.cabinet_id, cabinet_id),
        eq(cabinetMembre.actif, true),
        isNull(cabinetMembre.archived_at),
      ),
    )
    .orderBy(cabinetMembre.created_at);

  const membres = membresRaw.map((m) => ({
    ...m,
    isSelf: m.user_id === user?.id,
  }));

  // Invitations en attente (envoyée ou lue, non expirées)
  const invitations = await db
    .select({
      id: invitationMembre.id,
      email: invitationMembre.email,
      prenom: invitationMembre.prenom,
      nom: invitationMembre.nom,
      role_propose: invitationMembre.role_propose,
      date_envoi: invitationMembre.date_envoi,
      token_expire_at: invitationMembre.token_expire_at,
    })
    .from(invitationMembre)
    .where(
      and(
        eq(invitationMembre.cabinet_id, cabinet_id),
        inArray(invitationMembre.statut, ["envoyee", "lue"]),
        gt(invitationMembre.token_expire_at, new Date()),
      ),
    )
    .orderBy(invitationMembre.date_envoi);

  return <EquipeClient membres={membres} invitations={invitations} isResponsable={isResponsable} />;
}
