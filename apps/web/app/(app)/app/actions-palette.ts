"use server";

import { requireAuth } from "@zarya/auth";
import { client, db } from "@zarya/db";
import { and, eq, ilike, ne } from "drizzle-orm";
import { z } from "zod";

export type ClientPaletteResult = { id: string; raison_sociale: string };

const RechercheSchema = z.string().trim().min(2).max(120);

/**
 * Recherche de clients pour la palette ⌘K — scopée cabinet (ADR 0005 :
 * le filtre cabinet_id est la frontière réelle sur le chemin service-role).
 * Lecture seule, autorisée à tous les rôles du cabinet (y compris lecteur).
 */
export async function rechercherClientsPaletteAction(q: string): Promise<ClientPaletteResult[]> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return [];

  const parsed = RechercheSchema.safeParse(q);
  if (!parsed.success) return [];

  return db
    .select({ id: client.id, raison_sociale: client.raison_sociale })
    .from(client)
    .where(
      and(
        eq(client.cabinet_id, cabinet_id),
        ne(client.statut, "archive"),
        ilike(client.raison_sociale, `%${parsed.data}%`),
      ),
    )
    .orderBy(client.raison_sociale)
    .limit(8);
}
