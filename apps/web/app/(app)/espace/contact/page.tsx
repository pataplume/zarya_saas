import { cabinet, cabinetMembre, client, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { getEspaceClientContext } from "@/lib/espace-context";

// F8 / Run I4 — Contact cabinet (dashboard-client.md §10). Coordonnées de la fiduciaire
// (email, téléphone, adresse, site) + gestionnaire assigné. Lecture seule. Scopé cabinet/client
// via getEspaceClientContext (app_metadata serveur).
export default async function EspaceContactPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();

  const [cab] = await db
    .select({
      raison_sociale: cabinet.raison_sociale,
      email_contact: cabinet.email_contact,
      telephone: cabinet.telephone,
      site_web: cabinet.site_web,
      adresse_rue: cabinet.adresse_rue,
      adresse_npa: cabinet.adresse_npa,
      adresse_ville: cabinet.adresse_ville,
      adresse_canton: cabinet.adresse_canton,
    })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);

  // Gestionnaire assigné au client (responsable_id), s'il existe.
  const [cli] = await db
    .select({ responsable_id: client.responsable_id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);

  let gestionnaire: { prenom: string | null; nom: string | null; telephone: string | null } | null =
    null;
  if (cli?.responsable_id) {
    const [membre] = await db
      .select({
        prenom: cabinetMembre.prenom,
        nom: cabinetMembre.nom,
        telephone: cabinetMembre.telephone,
      })
      .from(cabinetMembre)
      .where(
        and(eq(cabinetMembre.id, cli.responsable_id), eq(cabinetMembre.cabinet_id, cabinet_id)),
      )
      .limit(1);
    gestionnaire = membre ?? null;
  }

  const adresse = [
    cab?.adresse_rue,
    [cab?.adresse_npa, cab?.adresse_ville].filter(Boolean).join(" "),
    cab?.adresse_canton,
  ]
    .filter((p) => p && p.trim().length > 0)
    .join(", ");

  const gestionnaireNom = [gestionnaire?.prenom, gestionnaire?.nom].filter(Boolean).join(" ");

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Contact</h1>
      <p className="mt-1 text-sm text-gray-500">
        Votre fiduciaire est votre interlocuteur pour toute question.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">Fiduciaire</p>
        <p className="text-lg font-medium text-gray-900">{cab?.raison_sociale ?? "—"}</p>

        <dl className="mt-4 space-y-2 text-sm">
          {cab?.email_contact && (
            <Ligne label="Email">
              <a className="text-blue-600 hover:underline" href={`mailto:${cab.email_contact}`}>
                {cab.email_contact}
              </a>
            </Ligne>
          )}
          {cab?.telephone && (
            <Ligne label="Téléphone">
              <a className="text-blue-600 hover:underline" href={`tel:${cab.telephone}`}>
                {cab.telephone}
              </a>
            </Ligne>
          )}
          {adresse && <Ligne label="Adresse">{adresse}</Ligne>}
          {cab?.site_web && (
            <Ligne label="Site web">
              <a
                className="text-blue-600 hover:underline"
                href={cab.site_web}
                target="_blank"
                rel="noopener noreferrer"
              >
                {cab.site_web}
              </a>
            </Ligne>
          )}
        </dl>
      </div>

      {gestionnaireNom && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Votre gestionnaire</p>
          <p className="text-base font-medium text-gray-900">{gestionnaireNom}</p>
          {gestionnaire?.telephone && (
            <p className="mt-1 text-sm">
              <a className="text-blue-600 hover:underline" href={`tel:${gestionnaire.telephone}`}>
                {gestionnaire.telephone}
              </a>
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        La messagerie intégrée arrivera dans une prochaine version. En attendant, contactez votre
        fiduciaire par les moyens ci-dessus.
      </p>
    </section>
  );
}

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}
