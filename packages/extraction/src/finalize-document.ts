// Finalisation d'un doc.document à partir d'une proposition classée (Bloc B4).
//
// Chemin PARTAGÉ par les deux issues de la décision flow-a §4 :
//  - validation humaine (server action validerPropositionAction, acteur cabinet_membre) ;
//  - auto-classement (classify-document, acteur ia).
//
// Centralise les effets B3 pour qu'ils restent identiques quelle que soit l'origine :
//  1. appariement à une attente crm.document_attendu (scopé cabinet+client, anti-fuite) ;
//  2. INSERT doc.document (le trigger fn_check_client_cabinet vérifie l'appartenance),
//     avec nom_fichier_standardise (B6, doc.md §8) — convention ZARYA imposée, nom
//     logique seul (pas de déplacement physique du blob) ;
//  3. l'attente couverte passe à `recu` (le balayage manquant→en_retard relève de
//     Calendar/Bloc C, pas de la finalisation) ;
//  4. recalcul du risque client crm.risque (B5, ADR 0015) — applicatif (pas trigger,
//     cohérent B3), upsert ; barème provisoire v1 (cf. ADR 0015) ;
//  5. événement crm.evenement `document_recu` (toujours émis) ;
//  6. événement `score_recalcule` uniquement si le niveau de risque change (anti-bruit).

import { randomUUID } from "node:crypto";
import {
  client,
  db,
  document,
  documentAttendu,
  echeance,
  evenement,
  fichierPhysique,
  risque,
} from "@zarya/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { buildNomStandardise } from "./build-nom-standardise";
import type { CategorieDocument } from "./classifier";
import { computeScoreRisque, type RisqueSignals } from "./compute-risque";
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
  // Nom standardisé (B6, doc.md §8) : logique seul — le blob physique reste opaque (clé de
  // dédup), le nom est appliqué à l'export/download. L'id est généré côté app pour alimenter
  // le suffixe anti-collision AVANT l'insert (un seul INSERT, pas d'UPDATE de rattrapage).
  const documentId = randomUUID();
  const nomStandardise = await buildNomFichierStandardise(input, documentId);

  const [doc] = await db
    .insert(document)
    .values({
      id: documentId,
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      fichier_physique_id: input.fichier_physique_id,
      proposition_classement_id: input.proposition_classement_id,
      type: input.type,
      categorie: input.categorie,
      document_attendu_id: attenduId,
      periode: input.periode,
      libelle: input.libelle,
      nom_fichier_standardise: nomStandardise,
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

  // 4. Recalcul du risque client (B5, ADR 0015). Applicatif (pas trigger DB, cohérent B3),
  // chemin partagé humain/IA. Upsert : provisionne la ligne crm.risque à la 1ʳᵉ finalisation.
  // Fait AVANT l'événement document_recu pour que le trigger trg_touch_derniere_activite
  // (0018) trouve la ligne et propage derniere_activite dès la 1ʳᵉ finalisation.
  const now = new Date();
  const [prev] = await db
    .select({ niveau: risque.niveau })
    .from(risque)
    .where(eq(risque.client_id, input.client_id))
    .limit(1);
  const niveauAvant = prev?.niveau ?? null;

  const signals = await countRisqueSignals(input.cabinet_id, input.client_id);
  const r = computeScoreRisque(signals, now);

  await db
    .insert(risque)
    .values({
      client_id: input.client_id,
      cabinet_id: input.cabinet_id,
      score: r.score,
      niveau: r.niveau,
      facteurs: r.facteurs,
      drapeau_critique: r.drapeau_critique,
      drapeau_motif: r.drapeau_motif,
      dernier_calcul: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: risque.client_id,
      set: {
        score: r.score,
        niveau: r.niveau,
        facteurs: r.facteurs,
        drapeau_critique: r.drapeau_critique,
        drapeau_motif: r.drapeau_motif,
        dernier_calcul: now,
        updated_at: now,
      },
    });

  // 5. Événement d'activité `document_recu` (crm-schema.md §18, doc-schema.md §14.3).
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

  // 6. Événement `score_recalcule` UNIQUEMENT si le niveau de risque change (anti-bruit :
  // sinon chaque document en émettrait un). null→niveau au 1er calcul compte comme un
  // changement (une trace par client à l'activation du suivi, puis seulement les transitions).
  if (niveauAvant !== r.niveau) {
    await db.insert(evenement).values({
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      type: "score_recalcule",
      acteur_type: input.acteur_type,
      acteur_id: input.acteur_id,
      ressource_type: "crm.risque",
      ressource_id: input.client_id,
      description: `Risque ${niveauAvant ?? "—"} → ${r.niveau} (score ${r.score})`,
      metadata: { niveau_avant: niveauAvant, ...r.facteurs },
    });
  }

  return { document_id: doc.id, document_attendu_id: attenduId };
}

// Compte les signaux de risque (B5) scopés cabinet + client (anti-fuite : jamais
// cross-cabinet). Une requête agrégée par table source ; `::int` coerce le bigint de
// count() en number pour le cœur pur.
async function countRisqueSignals(cabinet_id: string, client_id: string): Promise<RisqueSignals> {
  const [docs] = await db
    .select({
      en_retard: sql<number>`count(*) filter (where ${documentAttendu.statut_periode_courante} = 'en_retard')::int`,
      manquant: sql<number>`count(*) filter (where ${documentAttendu.statut_periode_courante} = 'manquant')::int`,
    })
    .from(documentAttendu)
    .where(
      and(
        eq(documentAttendu.cabinet_id, cabinet_id),
        eq(documentAttendu.client_id, client_id),
        eq(documentAttendu.actif, true),
        isNull(documentAttendu.archived_at),
      ),
    );

  const [ech] = await db
    .select({
      en_retard: sql<number>`count(*) filter (where ${echeance.statut} = 'en_retard')::int`,
    })
    .from(echeance)
    .where(
      and(
        eq(echeance.cabinet_id, cabinet_id),
        eq(echeance.client_id, client_id),
        isNull(echeance.archived_at),
      ),
    );

  return {
    nb_echeances_en_retard: ech?.en_retard ?? 0,
    nb_documents_en_retard: docs?.en_retard ?? 0,
    nb_documents_manquants: docs?.manquant ?? 0,
  };
}

// Résout le nom de fichier standardisé (B6) : récupère le nom court du client et
// l'extension du blob (toutes deux scopées cabinet_id, anti-fuite) puis délègue au cœur
// pur. Tolérant : si le client ou le fichier est introuvable, on retombe sur des
// fallbacks déterministes plutôt que d'échouer la finalisation (le nom est de la
// métadonnée d'affichage, pas une donnée critique).
async function buildNomFichierStandardise(
  input: FinaliserDocumentInput,
  documentId: string,
): Promise<string> {
  const [cli] = await db
    .select({ nom_court: client.nom_court, raison_sociale: client.raison_sociale })
    .from(client)
    .where(and(eq(client.id, input.client_id), eq(client.cabinet_id, input.cabinet_id)))
    .limit(1);

  const [fichier] = await db
    .select({ storage_path: fichierPhysique.storage_path })
    .from(fichierPhysique)
    .where(
      and(
        eq(fichierPhysique.id, input.fichier_physique_id),
        eq(fichierPhysique.cabinet_id, input.cabinet_id),
      ),
    )
    .limit(1);

  const { nom_fichier } = buildNomStandardise({
    type: input.type,
    periode: input.periode,
    client_nom: cli?.nom_court ?? cli?.raison_sociale ?? "",
    libelle: input.libelle,
    extension: extensionDepuisPath(fichier?.storage_path),
    document_id: documentId,
  });
  return nom_fichier;
}

// Extrait l'extension d'un storage_path (`{cabinet}/{upload}.{ext}`, posé à l'upload).
// Pas de point ou chemin absent → "" (le cœur pur retombe sur "bin").
function extensionDepuisPath(storagePath: string | undefined): string {
  if (!storagePath?.includes(".")) return "";
  return storagePath.split(".").pop() ?? "";
}
