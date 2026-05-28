import { redirect } from "next/navigation";

// Paramètres redirige vers le premier onglet
export default function ParametresPage() {
  redirect("/app/parametres/cabinet");
}
