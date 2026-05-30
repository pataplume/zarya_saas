// Finalisation d'un doc.document à partir d'une proposition classée (Bloc B4).
//
// Chemin PARTAGÉ par les deux issues de la décision flow-a §4 :
//  - validation humaine (server action validerPropositionAction, acteur cabinet_membre) ;
//  - auto-classement (classify-document, acteur ia).
//
// Centralise les effets B3 pour qu'ils restent identiques quelle que soit l'origine :
//  1. appariement à une attente crm.document_attendu (scopé cabinet+client, anti-fuite) ;
//  2. INSERT doc.document (le trigger fn_check_client_cabinet vérifie l'appartenance) ;
//  3. l'attente couverte passe à `recu` (le balayage manquant→en_retard relève de
//     Calendar/Bloc C, pas de la finalisation) ;
//  4. événement crm.evenement `document_recu` (toujours émis).

import { db, document, documentAttendu, evenement } from "@zarya/db";
import { and, eq, isNull } from "drizzle-orm";
import type { CategorieDocument } from "./classifier";
import { type AttenduRow, matchDocumentAttendu } from "./match-document-attendu";

export interface FinaliserDocumentInput {
  cabinet_id: string;
  client_id: string;
  fichier_physique_id: string;
  proposition_classement_id: string;
  type: string;
  categorie: CategorieDocument;
  periode: string | null;
  libelle: string;
  statut_classement: "auto" | "valide_humain" | "corrige_humain" | "manuel";
  confiance_classement: string | null;
  // Auteur de la finalisation : humain (cabinet_membre + user.id) ou IA (ia + null).
  acteur_type: "cabinet_membre" | "ia";
  acteur_id: string | null;
  cree_par: string | null;
}

export interface FinaliserDocumentResult {
  document_id: string;
  document_attendu_id: string | null;
}

export async function finaliserDocument(
  input: FinaliserDocumentInput,
): Promise<FinaliserDocumentResult> {
  // 1. Appariement à une attente (B3, doc.md §6.3). Scopé cabinet_id + client_id.
  const attendus: AttenduRow[] = await db
    .select({
      id: documentAttendu.id,
      type_document: documentAttendu.type_document,
      categorie: documentAttendu.categorie,
      frequence: documentAttendu.frequence,
    })
    .from(documentAttendu)
    .where(
      and(
        eq(documentAttendu.cabinet_id, input.cabinet_id),
        eq(documentAttendu.client_id, input.client_id),
        eq(documentAttendu.actif, true),
        isNull(documentAttendu.archived_at),
      ),
    );
  const attenduId = matchDocumentAttendu(
    {
      type: input.type,
      categorie: input.categorie,
      libelle: input.libelle,
      periode: input.periode,
    },
    attendus,
  );

  // 2. Création de l'entité finale doc.document.
  const [doc] = await db
    .insert(document)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      fichier_physique_id: input.fichier_physique_id,
      proposition_classement_id: input.proposition_classement_id,
      type: input.type,
      categorie: input.categorie,
      document_attendu_id: attenduId,
      periode: input.periode,
      libelle: input.libelle,
      statut_classement: input.statut_classement,
      confiance_classement: input.confiance_classement,
      cree_par: input.cree_par,
    })
    .returning({ id: document.id });

  if (!doc) throw new Error("Échec de la création du document");

  // 3. Attente couverte → recu. derniere_periode_recue trace la période reçue.
  if (attenduId) {
    await db
      .update(documentAttendu)
      .set({
        statut_periode_courante: "recu",
        derniere_reception: new Date().toISOString().slice(0, 10),
        derniere_periode_recue: input.periode,
        updated_at: new Date(),
      })
      .where(
        and(eq(documentAttendu.id, attenduId), eq(documentAttendu.cabinet_id, input.cabinet_id)),
      );
  }

  // 4. Événement d'activité `document_recu` (crm-schema.md §18, doc-schema.md §14.3).
  // Effets de bord en chaîne (recalcul risque, signaux modules) différés au Bloc B5.
  await db.insert(evenement).values({
    cabinet_id: input.cabinet_id,
    client_id: input.client_id,
    type: "document_recu",
    acteur_type: input.acteur_type,
    acteur_id: input.acteur_id,
    ressource_type: "doc.document",
    ressource_id: doc.id,
    description: input.libelle,
    metadata: {
      type: input.type,
      categorie: input.categorie,
      periode: input.periode,
      document_attendu_id: attenduId,
    },
  });

  return { document_id: doc.id, document_attendu_id: attenduId };
}
