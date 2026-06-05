import { redirect } from "next/navigation";

// Run A1 — le segment /app/calendrier redirige vers sa sous-page canonique (échéances).
export default function CalendrierIndexPage() {
  redirect("/app/calendrier/echeances");
}
