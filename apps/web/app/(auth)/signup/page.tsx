import { inviteGatingActif } from "@/lib/beta-invite";
import { SignupForm } from "./signup-form";

// P0-7 — server component : décide si le gating bêta est actif (BETA_INVITE_CODE
// définie et non vide) et ne passe QUE ce booléen au formulaire client — le code
// lui-même ne quitte jamais le serveur (vérification dans actions.ts).
export default function SignupPage() {
  const inviteRequis = inviteGatingActif(process.env.BETA_INVITE_CODE);
  return <SignupForm inviteRequis={inviteRequis} />;
}
