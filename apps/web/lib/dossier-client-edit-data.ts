// Lot 1 (ADR 0025) — Données d'ÉDITION du dossier client (identité étendue, contacts,
// adresses + membres du cabinet pour le sélecteur de gestionnaire). Distinct du lecteur
// d'affichage `dossier-client-data.ts` : ici on projette les champs éditables bruts.
//
// Sécurité : `db` service role BYPASSE la RLS (ADR 0005 addendum). La frontière réelle est
// le filtre (cabinet_id, client_id) discipliné dans chaque requête. `getClientEditData`
// renvoie null si le client n'appartient pas au cabinet (→ 404 indistinct).
// Aucune colonne ultra-sensible (IBAN/AVS/tokens) n'est projetée.

import { adresse, cabinetMembre, client, contact, db } from "@zarya/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

export interface ClientEditIdentite {
  id: string;
  raison_sociale: string;
  type: string;
  ide: string | null;
  numero_tva: string | null;
  forme_juridique: string | null;
  langue: string;
  statut: string;
  responsable_id: string | null;
  email_contact: string | null;
  tags: string[];
  notes_commerciales: string | null;
}

export interface ClientEditContact {
  id: string;
  prenom: string | null;
  nom: string;
  role: string | null;
  email: string | null;
  telephone: string | null;
  est_principal: boolean;
  est_contact_rh: boolean;
  est_signataire: boolean;
}

export interface ClientEditAdresse {
  id: string;
  type: string;
  rue: string | null;
  complement: string | null;
  code_postal: string | null;
  ville: string | null;
  canton: string | null;
  pays: string;
  est_principale: boolean;
}

export interface ClientEditMembre {
  id: string;
  nom_complet: string;
}

export interface ClientEditData {
  identite: ClientEditIdentite;
  contacts: ClientEditContact[];
  adresses: ClientEditAdresse[];
  membres: ClientEditMembre[];
}

export async function getClientEditData(
  cabinet_id: string,
  client_id: string,
): Promise<ClientEditData | null> {
  const [ident] = await db
    .select({
      id: client.id,
      raison_sociale: client.raison_sociale,
      type: client.type,
      ide: client.ide,
      numero_tva: client.numero_tva,
      forme_juridique: client.forme_juridique,
      langue: client.langue,
      statut: client.statut,
      responsable_id: client.responsable_id,
      email_contact: client.email_contact,
      tags: client.tags,
      notes_commerciales: client.notes_commerciales,
    })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!ident) return null;

  const [contactsRows, adressesRows, membresRows] = await Promise.all([
    db
      .select({
        id: contact.id,
        prenom: contact.prenom,
        nom: contact.nom,
        role: contact.role,
        email: contact.email,
        telephone: contact.telephone,
        est_principal: contact.est_principal,
        est_contact_rh: contact.est_contact_rh,
        est_signataire: contact.est_signataire,
      })
      .from(contact)
      .where(
        and(
          eq(contact.cabinet_id, cabinet_id),
          eq(contact.client_id, client_id),
          isNull(contact.archived_at),
        ),
      )
      .orderBy(desc(contact.est_principal), asc(contact.nom)),
    db
      .select({
        id: adresse.id,
        type: adresse.type,
        rue: adresse.rue,
        complement: adresse.complement,
        code_postal: adresse.code_postal,
        ville: adresse.ville,
        canton: adresse.canton,
        pays: adresse.pays,
        est_principale: adresse.est_principale,
      })
      .from(adresse)
      .where(
        and(
          eq(adresse.cabinet_id, cabinet_id),
          eq(adresse.client_id, client_id),
          isNull(adresse.archived_at),
        ),
      )
      .orderBy(desc(adresse.est_principale)),
    db
      .select({ id: cabinetMembre.id, prenom: cabinetMembre.prenom, nom: cabinetMembre.nom })
      .from(cabinetMembre)
      .where(and(eq(cabinetMembre.cabinet_id, cabinet_id), eq(cabinetMembre.actif, true)))
      .orderBy(asc(cabinetMembre.nom)),
  ]);

  return {
    identite: {
      id: ident.id,
      raison_sociale: ident.raison_sociale,
      type: ident.type,
      ide: ident.ide ?? null,
      numero_tva: ident.numero_tva ?? null,
      forme_juridique: ident.forme_juridique ?? null,
      langue: ident.langue,
      statut: ident.statut,
      responsable_id: ident.responsable_id ?? null,
      email_contact: ident.email_contact ?? null,
      tags: ident.tags ?? [],
      notes_commerciales: ident.notes_commerciales ?? null,
    },
    contacts: contactsRows.map((c) => ({
      id: c.id,
      prenom: c.prenom ?? null,
      nom: c.nom,
      role: c.role ?? null,
      email: c.email ?? null,
      telephone: c.telephone ?? null,
      est_principal: c.est_principal,
      est_contact_rh: c.est_contact_rh,
      est_signataire: c.est_signataire,
    })),
    adresses: adressesRows.map((a) => ({
      id: a.id,
      type: a.type,
      rue: a.rue ?? null,
      complement: a.complement ?? null,
      code_postal: a.code_postal ?? null,
      ville: a.ville ?? null,
      canton: a.canton ?? null,
      pays: a.pays,
      est_principale: a.est_principale,
    })),
    membres: membresRows.map((m) => ({
      id: m.id,
      nom_complet: [m.prenom, m.nom].filter(Boolean).join(" ") || "Membre du cabinet",
    })),
  };
}
