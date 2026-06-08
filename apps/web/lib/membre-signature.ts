import { cabinetMembre, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";

// Résout la signature email du membre acteur (cabinet_membre.signature_email, Run I2) pour
// l'apposer aux emails envoyés depuis sa boîte (relances doc/salaire). Scopé (user_id, cabinet_id).
// Retourne undefined si non renseignée → l'envoi se fait alors sans signature (corps inchangé).
export async function getMembreSignature(
  userId: string,
  cabinetId: string,
): Promise<string | undefined> {
  const [membre] = await db
    .select({ signature_email: cabinetMembre.signature_email })
    .from(cabinetMembre)
    .where(and(eq(cabinetMembre.user_id, userId), eq(cabinetMembre.cabinet_id, cabinetId)))
    .limit(1);
  const sig = membre?.signature_email?.trim();
  return sig && sig.length > 0 ? sig : undefined;
}
