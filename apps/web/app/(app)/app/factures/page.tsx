import { redirect } from "next/navigation";

// Run A1 — le segment /app/factures redirige vers sa sous-page canonique (validation).
export default function FacturesIndexPage() {
  redirect("/app/factures/validation");
}
