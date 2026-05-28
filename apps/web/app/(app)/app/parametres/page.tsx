import { redirect } from "next/navigation";

// Paramètres n'a pas encore de page racine — redirection vers équipe pour l'instant
export default function ParametresPage() {
  redirect("/app/parametres/equipe");
}
