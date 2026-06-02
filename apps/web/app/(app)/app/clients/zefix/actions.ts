"use server";

import { requireAuth } from "@zarya/auth";
import { adresse, client, db, zefixRechercheCabinet } from "@zarya/db";
import { zefixClient } from "@zarya/integrations";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// F3 — Identification entreprise via Zefix (onboarding-client §5). Le cabinet identifie un
// nouveau client par son IDE : consentement nLPD OBLIGATOIRE avant l'appel (§5.2, pas d'appel
// sinon), recherche Zefix côté serveur (route /api/zefix/* pour la recherche live UI), création
// crm.client + crm.adresse (siège), audit dans crm.zefix_recherche_cabinet (table dédiée,
// rétention 5 ans). Si Zefix ne renvoie rien (§5.4) → fallback formulaire manuel (createClientAction).
//
// Anti-fuite : tout est scopé cabinet_id de l'acteur. Zefix = API publique (pas de secret cabinet).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type ZefixClientActionState = {
  error?: string;
  success?: boolean;
  client_id?: string;
  /** true si Zefix n'a rien renvoyé → l'UI bascule sur le formulaire manuel (§5.4). */
  fallback_manuel?: boolean;
};

const Schema = z.object({
  ide: z.string().trim().min(1, "IDE requis"),
  consentement: z
    .union([z.literal("true"), z.literal("on"), z.literal("false")])
    .transform((v) => v === "true" || v === "on"),
});

export async function creerClientDepuisZefixAction(
  _prev: ZefixClientActionState,
  formData: FormData,
): Promise<ZefixClientActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const { ide, consentement } = parsed.data;

  // §5.2 — pas d'appel Zefix sans consentement explicite.
  if (!consentement) return { error: "Le consentement nLPD est requis pour interroger Zefix." };

  let res: Awaited<ReturnType<typeof zefixClient.rechercherParIde>>;
  try {
    res = await zefixClient.rechercherParIde(ide);
  } catch {
    return { error: "Service Zefix indisponible, réessayez ou saisissez manuellement." };
  }

  // Audit nLPD (table dédiée, rétention 5 ans) — tracé même si aucun résultat.
  await db.insert(zefixRechercheCabinet).values({
    cabinet_id,
    requete: ide,
    nb_resultats: res ? "1" : "0",
    ide_selectionne: res?.ide ?? null,
    reponse_brute: res ? JSON.stringify(res) : null,
    consentement_donne: true,
  });

  // §5.4 — Zefix ne renvoie rien (indépendant non inscrit…) → formulaire manuel.
  if (!res) return { fallback_manuel: true };

  // Création crm.client + crm.adresse (siège), scopées cabinet.
  let clientId: string;
  try {
    const [cli] = await db
      .insert(client)
      .values({
        cabinet_id,
        raison_sociale: res.raison_sociale,
        ide: res.ide,
        forme_juridique: res.forme_juridique ?? null,
        statut: "actif",
      })
      .returning({ id: client.id });
    if (!cli) return { error: "Échec de la création du client." };
    clientId = cli.id;
  } catch {
    // uniq_client_ide_per_cabinet
    return { error: "Un client avec cet IDE existe déjà dans votre cabinet." };
  }

  if (res.adresse_rue || res.adresse_ville) {
    await db.insert(adresse).values({
      cabinet_id,
      client_id: clientId,
      type: "siege",
      rue: res.adresse_rue ?? null,
      code_postal: res.adresse_npa ?? null,
      ville: res.adresse_ville ?? null,
      canton: res.adresse_canton ?? null,
      pays: "CH",
      est_principale: true,
    });
  }

  revalidatePath("/app/clients");
  return { success: true, client_id: clientId };
}
