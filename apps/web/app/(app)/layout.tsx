import { requireAuth, type User } from "@zarya/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: User;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }

  // Si l'utilisateur n'a pas encore de cabinet, il doit passer par l'onboarding
  const cabinetId = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinetId) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
