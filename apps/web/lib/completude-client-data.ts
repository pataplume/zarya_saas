// Lot 3 (ADR 0025) — Lecteur DB de la complétude du dossier client.
//
// Projette l'état du client (identité, contacts, adresses, services + régimes, param_comptable,
// salaire_config) vers `CompletudeInput` (lib/completude-client.ts, cœur PUR). Le calcul lui-même
// est pur ; ici on ne fait que lire, scopé (cabinet_id, client_id).
//
// Sécurité : `db` service role BYPASSE la RLS (ADR 0005 addendum). La frontière réelle est le
// filtre (cabinet_id, client_id) discipliné dans CHAQUE requête. Renvoie null si le client
// n'appartient pas au cabinet (→ on n'affiche simplement pas l'assistant).

import {
  adresse,
  and,
  client,
  contact,
  db,
  eq,
  isNull,
  paramComptable,
  salaireConfig,
  service,
} from "@zarya/db";
import type { ServiceType } from "./checklist-onboarding";
import { type CompletudeResult, calculerCompletude } from "./completude-client";

const SERVICE_TYPES = new Set<ServiceType>([
  "comptabilite",
  "fiscalite",
  "salaires",
  "tva",
  "bouclement",
  "conseil",
]);

/**
 * Calcule la complétude d'un client à partir de la base. Retourne null si le client n'existe
 * pas dans ce cabinet (anti-fuite). Aucune écriture, aucun champ sensible projeté.
 */
export async function getCompletudeClient(
  cabinet_id: string,
  client_id: string,
): Promise<CompletudeResult | null> {
  const [ident] = await db
    .select({
      raison_sociale: client.raison_sociale,
      type: client.type,
      ide: client.ide,
    })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!ident) return null;

  const [contactsRows, adressesRows, servicesRows, paramRows, salaireRows] = await Promise.all([
    db
      .select({ est_principal: contact.est_principal })
      .from(contact)
      .where(
        and(
          eq(contact.cabinet_id, cabinet_id),
          eq(contact.client_id, client_id),
          isNull(contact.archived_at),
        ),
      ),
    db
      .select({ canton: adresse.canton })
      .from(adresse)
      .where(
        and(
          eq(adresse.cabinet_id, cabinet_id),
          eq(adresse.client_id, client_id),
          isNull(adresse.archived_at),
        ),
      ),
    db
      .select({
        type: service.type,
        frequence: service.frequence,
        parametres: service.parametres,
      })
      .from(service)
      .where(
        and(
          eq(service.cabinet_id, cabinet_id),
          eq(service.client_id, client_id),
          eq(service.actif, true),
          isNull(service.archived_at),
        ),
      ),
    db
      .select({ date_bouclement: paramComptable.date_bouclement })
      .from(paramComptable)
      .where(
        and(eq(paramComptable.cabinet_id, cabinet_id), eq(paramComptable.client_id, client_id)),
      )
      .limit(1),
    db
      .select({
        frequence_paie: salaireConfig.frequence_paie,
        date_validation_jour_du_mois: salaireConfig.date_validation_jour_du_mois,
      })
      .from(salaireConfig)
      .where(and(eq(salaireConfig.cabinet_id, cabinet_id), eq(salaireConfig.client_id, client_id)))
      .limit(1),
  ]);

  const param = paramRows[0];
  const salaire = salaireRows[0];

  const services = servicesRows
    .filter((s): s is typeof s & { type: ServiceType } => SERVICE_TYPES.has(s.type as ServiceType))
    .map((s) => {
      const params = (s.parametres ?? {}) as Record<string, unknown>;
      // Fallback legacy `regime` : clé historiquement écrite par l'action bulk d'onboarding
      // (P0-5) — même guérison à la lecture que le moteur et dossier-client-edit-data.ts.
      const regime = params.regime_tva ?? params.regime;
      return {
        type: s.type,
        frequence: s.frequence ?? null,
        regime_tva: typeof regime === "string" && regime.length > 0 ? regime : null,
      };
    });

  return calculerCompletude({
    identite: {
      raison_sociale: ident.raison_sociale,
      type: ident.type ?? null,
      ide: ident.ide ?? null,
    },
    nb_contacts: contactsRows.length,
    a_contact_principal: contactsRows.some((c) => c.est_principal),
    a_adresse_avec_canton: adressesRows.some((a) => !!a.canton),
    nb_adresses: adressesRows.length,
    services,
    param_comptable: param ? { date_bouclement: param.date_bouclement ?? null } : null,
    salaire_config: salaire
      ? {
          frequence_paie: salaire.frequence_paie ?? null,
          date_validation_jour_du_mois: salaire.date_validation_jour_du_mois ?? null,
        }
      : null,
  });
}
