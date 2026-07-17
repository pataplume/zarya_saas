// P0-7 — statuts du cycle de vie d'une demande d'accès (crm.demande_acces).
// La colonne `statut` est du text libre en DB (migration 0045, pas d'enum ni de
// CHECK, défaut 'nouvelle') : on la contraint côté app aux 4 valeurs du cycle de
// vie déjà documenté dans le repo (statut_demande_suppression, migration 0046).
// Fichier séparé : un fichier "use server" ne peut exporter que des fonctions async.

export const STATUTS_DEMANDE_ACCES = ["nouvelle", "en_cours", "traitee", "rejetee"] as const;

export type StatutDemandeAcces = (typeof STATUTS_DEMANDE_ACCES)[number];

export const LIBELLE_STATUT_DEMANDE_ACCES: Record<StatutDemandeAcces, string> = {
  nouvelle: "Nouvelle",
  en_cours: "En cours",
  traitee: "Traitée",
  rejetee: "Rejetée",
};
