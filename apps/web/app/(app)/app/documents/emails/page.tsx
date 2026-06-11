import { redirect } from "next/navigation";

// L'écran « Emails reçus » est désormais intégré au hub Documents
// (onglet « Emails reçus »). On conserve la route pour les liens existants.
export default function EmailsRecusRedirect() {
  redirect("/app/documents?tab=emails");
}
