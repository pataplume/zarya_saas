import { getCurrentUser } from "@zarya/auth";
import { buildExportXlsx, genererExportPeriode } from "@zarya/extraction";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// G6a — Téléchargement de l'export salaire d'une période (Excel humain ou CSV générique).
// Route handler (download de fichier). auth + RBAC + scope cabinet. ?format=csv|xlsx (défaut csv).
const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodeId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  const role = user?.app_metadata.role as string | undefined;
  if (!user || !cabinet_id || !role || !ROLES_ECRITURE.has(role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { periodeId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const format_code = format === "xlsx" ? "excel_humain" : "csv_generique";

  try {
    const res = await genererExportPeriode({
      cabinet_id,
      periode_id: periodeId,
      format_code,
      genere_par: user.id,
    });
    if (format === "csv") {
      return new NextResponse(res.contenu_csv ?? "", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${res.nom_fichier}"`,
        },
      });
    }
    const xlsx = await buildExportXlsx(res.lignes, `Salaires`);
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${res.nom_fichier}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'export" },
      { status: 400 },
    );
  }
}
