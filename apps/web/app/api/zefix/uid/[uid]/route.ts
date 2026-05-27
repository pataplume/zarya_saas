import { createSupabaseServerClient } from "@zarya/auth";
import { ZefixError, zefixClient } from "@zarya/integrations";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

// ADR 0009 : route handler obligatoire pour Zefix (CORS + credentials serveur)

const UidParamSchema = z
  .string()
  .regex(/^CHE-\d{3}\.\d{3}\.\d{3}$/i, "Format IDE invalide (CHE-XXX.XXX.XXX)");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  // 1. Authentification
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // 2. Validation du paramètre UID
  const { uid } = await params;
  const parsed = UidParamSchema.safeParse(decodeURIComponent(uid));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Format IDE invalide" },
      { status: 400 },
    );
  }

  // 3. Appel Zefix
  try {
    const resultat = await zefixClient.rechercherParIde(parsed.data);

    if (!resultat) {
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    return NextResponse.json({ resultat });
  } catch (err) {
    const msg = err instanceof ZefixError ? err.message : "Zefix est temporairement indisponible.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
