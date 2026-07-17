// P0-8 — Self-heal du provisioning (AUDIT-MVP.md §8).
//
// Un utilisateur authentifié SANS cabinet_id dans app_metadata (provisionNewCabinet
// échoué au signup) bouclait login ↔ onboarding sans issue. Les layouts onboarding
// redirigent désormais ici : on répare de façon idempotente (décision pure dans
// lib/provisioning-decision.ts), on rafraîchit la session pour recharger les claims
// (possible uniquement dans un Route Handler — écriture cookies), puis on rend la
// main au flux normal. En cas d'échec : page d'erreur /compte-incomplet + alerte ops.

import { createSupabaseAdminClient, createSupabaseServerClient } from "@zarya/auth";
import { cabinetMembre, db } from "@zarya/db";
import { logger, sendOpsAlert } from "@zarya/logger";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { provisionNewCabinet } from "@/lib/provisioning";
import { deciderReparationProvisioning } from "@/lib/provisioning-decision";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // État observé : claim JWT + lignes cabinet_membre existantes (provisioning partiel ?)
  const membres = await db
    .select({
      cabinet_id: cabinetMembre.cabinet_id,
      role: cabinetMembre.role,
      actif: cabinetMembre.actif,
    })
    .from(cabinetMembre)
    .where(eq(cabinetMembre.user_id, user.id));

  const decision = deciderReparationProvisioning({
    cabinet_id_claim: (user.app_metadata.cabinet_id as string | undefined) ?? null,
    email: user.email ?? null,
    membres,
  });

  if (decision.action === "erreur") {
    // Contexte minimal (ids techniques), jamais de PII.
    logger.error(
      { user_id: user.id, raison: decision.raison },
      "[reparer] compte non réparable automatiquement",
    );
    await sendOpsAlert("Provisioning — compte non réparable automatiquement", {
      user_id: user.id,
      raison: decision.raison,
    });
    return NextResponse.redirect(new URL("/compte-incomplet", origin));
  }

  try {
    if (decision.action === "reparer_metadata") {
      // Provisioning partiel : le membre existe, on ré-injecte seulement les claims.
      const admin = createSupabaseAdminClient();
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { cabinet_id: decision.cabinet_id, role: decision.role },
      });
      if (error) {
        throw new Error(`updateUserById: ${error.message}`);
      }
    } else if (decision.action === "provisionner") {
      // Aucune trace : re-provisionner via la logique existante du signup.
      await provisionNewCabinet({ userId: user.id, email: decision.email });
    }
    // "rien_a_faire" : claim déjà présent (ex. réparé dans un autre onglet) — on
    // rafraîchit quand même pour repartir avec des claims à jour.

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error(`refreshSession: ${refreshError.message}`);
    }
    const cabinetIdApres = refreshed.session?.user.app_metadata.cabinet_id as string | undefined;
    if (!cabinetIdApres) {
      // Garde anti-boucle : ne JAMAIS renvoyer vers /onboarding sans claim réparé.
      throw new Error("cabinet_id absent des claims après réparation");
    }

    logger.info(
      { user_id: user.id, action: decision.action, cabinet_id: cabinetIdApres },
      "[reparer] provisioning auto-réparé",
    );
    return NextResponse.redirect(new URL("/onboarding", origin));
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logger.error(
      { user_id: user.id, action: decision.action, error: message },
      "[reparer] échec du self-heal provisioning",
    );
    await sendOpsAlert("Provisioning — échec du self-heal au login", {
      user_id: user.id,
      action: decision.action,
      error: message,
    });
    return NextResponse.redirect(new URL("/compte-incomplet", origin));
  }
}
