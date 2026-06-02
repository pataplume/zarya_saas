import { createSupabaseServerClient } from "@zarya/auth";
import { exporterFacturesValidees } from "@zarya/extraction";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Export comptable des factures validées — module Facture (facture.md §7, Bloc E6).
// Route handler (téléchargement de fichier = route handler, pas server action, apps/web
// CLAUDE.md). GET : génère un CSV des factures `validee` du cabinet et les bascule en
// `exportee` (mode lot). La logique vit dans @zarya/extraction (exporterFacturesValidees) ;
// ici on ajoute AUTH + SCOPE cabinet + RBAC. Anti-fuite : scope cabinet_id (service-role
// bypasse la RLS — ADR 0005 addendum).

const ROLES_EXPORT = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return NextResponse.json({ error: "Cabinet non configuré" }, { status: 403 });

  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (!ROLES_EXPORT.has(role)) {
    return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  }

  try {
    const { csv, count } = await exporterFacturesValidees(cabinet_id);
    const date = new Date().toISOString().slice(0, 10);
    logger.info({ cabinet_id, count }, "[facture.export] export comptable généré");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-factures-${date}.csv"`,
        "X-Facture-Count": String(count),
      },
    });
  } catch (err) {
    logger.error(
      { cabinet_id, error: err instanceof Error ? err.message : String(err) },
      "[facture.export] échec export",
    );
    return NextResponse.json({ error: "Échec de l'export" }, { status: 500 });
  }
}
