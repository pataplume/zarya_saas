import { createSupabaseServerClient } from "@zarya/auth";
import { db, zefixRechercheCabinet } from "@zarya/db";
import type { ZefixResultat } from "@zarya/integrations";
import { ZefixError, zefixClient } from "@zarya/integrations";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

// ADR 0009 : route handler obligatoire pour Zefix (CORS + credentials serveur)
// Credentials (ZEFIX_USERNAME, ZEFIX_PASSWORD) jamais exposés côté client

const SearchBodySchema = z.object({
  requete: z.string().min(2, "Saisissez au moins 2 caractères").max(200),
  consentement: z.literal(true, {
    errorMap: () => ({ message: "Le consentement nLPD est requis" }),
  }),
  canton: z.string().max(2).optional(),
  maxEntries: z.number().int().min(1).max(50).default(20),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authentification (session cookie Supabase)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // 2. cabinet_id — nullable autorisé à l'étape A onboarding (ADR 0009 §2)
  const cabinet_id = (user.app_metadata.cabinet_id as string | undefined) ?? null;

  // 3. Validation Zod du corps de la requête
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = SearchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Données invalides" },
      { status: 400 },
    );
  }

  const { requete, canton, maxEntries } = parsed.data;

  // 4. Détection IDE vs nom (CHE-XXX.XXX.XXX)
  const estIde = /^CHE-\d{3}\.\d{3}\.\d{3}$/i.test(requete.trim());

  let resultats: ZefixResultat[] = [];
  let reponse_brute: string | null = null;

  try {
    if (estIde) {
      const res = await zefixClient.rechercherParIde(requete.trim());
      if (res) {
        resultats = [res];
        reponse_brute = JSON.stringify(res);
      }
    } else {
      resultats = await zefixClient.rechercherParNom(requete.trim(), {
        ...(canton !== undefined ? { canton } : {}),
        maxEntries,
      });
      reponse_brute = JSON.stringify(resultats);
    }
  } catch (err) {
    // 5. Log d'audit même en cas d'erreur (traçabilité nLPD)
    if (cabinet_id) {
      await db.insert(zefixRechercheCabinet).values({
        cabinet_id,
        requete,
        nb_resultats: "0",
        consentement_donne: true,
      });
    }

    const msg =
      err instanceof ZefixError
        ? err.message
        : "Zefix est temporairement indisponible. Saisissez les informations manuellement.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 5. Log d'audit nLPD (consentement explicite reçu dans le corps)
  if (cabinet_id) {
    await db.insert(zefixRechercheCabinet).values({
      cabinet_id,
      requete,
      nb_resultats: String(resultats.length),
      reponse_brute,
      consentement_donne: true,
    });
  }

  return NextResponse.json({ resultats });
}
