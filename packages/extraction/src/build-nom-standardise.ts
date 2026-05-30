// Renommage standardisé + arborescence logique d'un doc.document (Bloc B6).
//
// Cœur PUR (aucune I/O) → testable isolément. Produit un nom de fichier déterministe
// et un chemin logique de rangement à partir des champs de classification.
//
// ⚠️ Convention ZARYA IMPOSÉE (MVP). La convention personnalisable par cabinet
// (`doc.cabinet_convention_nommage`) est différée Phase 4 (doc.md §17). Tant qu'elle
// n'existe pas, un seul gabarit s'applique à tous les cabinets.
//
// Le nom standardisé est une métadonnée LOGIQUE (export / download / NAS futur) : le
// blob physique `doc.fichier_physique.storage_path` reste opaque et inchangé (c'est la
// clé de déduplication, 1 fichier physique ↔ N documents). Aucun déplacement physique.
//
// Références : doc.md §8 · document-schema.md §7 (`nom_fichier_standardise`) · KICKOFF §B/B6.

export interface NomStandardiseInput {
  // Slug de type de document (ex. "releve_bancaire").
  type: string;
  // Période canonique B3 : "YYYY-MM" | "YYYY-QN" | "YYYY" | null (ponctuel/inconnu).
  periode: string | null;
  // Nom court d'affichage du client (nom_court ?? raison_sociale).
  client_nom: string;
  // Libellé du document (extrait classification).
  libelle: string;
  // Extension de fichier (sans point), résolue par l'appelant depuis storage_path/mime.
  extension: string;
  // uuid du doc.document — fournit le suffixe court anti-collision (déterministe par doc).
  document_id: string;
}

export interface NomStandardise {
  // Nom de fichier complet, ex. "2026-04_releve-bancaire_dupont-sa_ubs__a1b2c3.pdf".
  nom_fichier: string;
  // Dossier logique de rangement, ex. "2026/04/releve-bancaire/dupont-sa".
  chemin_logique: string;
}

// Fallback de segment quand un champ est vide après slugification (jamais de segment vide,
// sinon collisions de chemin "//" et noms "__").
const SEGMENT_VIDE = "sans";
const PERIODE_VIDE = "sans-periode";

// Slugifie : décompose les accents (NFD), retire les diacritiques, minuscule, ne garde
// que [a-z0-9], comprime les séparateurs en "-". Déterministe, ASCII-safe pour Storage.
export function slugify(input: string): string {
  // Plage des diacritiques combinants (U+0300–U+036F) produits par NFD. Pas de flag `u`
  // (cible TS < es6 sur ce package) ni de \p{...}.
  const sansAccents = input.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = sansAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

// Décompose la période canonique en segments annee/mois pour le chemin et le nom.
// "2026-04" → { annee:"2026", mois:"04" } ; "2026-Q1" → { annee:"2026", mois:"t1" } ;
// "2025" → { annee:"2025", mois:null } ; null/inconnu → { annee:PERIODE_VIDE, mois:null }.
function decomposePeriode(periode: string | null): { annee: string; mois: string | null } {
  if (!periode) return { annee: PERIODE_VIDE, mois: null };
  const mensuel = /^(\d{4})-(\d{2})$/.exec(periode);
  if (mensuel?.[1] && mensuel[2]) return { annee: mensuel[1], mois: mensuel[2] };
  const trimestriel = /^(\d{4})-Q([1-4])$/.exec(periode);
  if (trimestriel?.[1] && trimestriel[2])
    return { annee: trimestriel[1], mois: `t${trimestriel[2]}` };
  const annuel = /^(\d{4})$/.exec(periode);
  if (annuel?.[1]) return { annee: annuel[1], mois: null };
  // Format inattendu : on slugifie tel quel comme année, pas de mois (déterministe, pas de throw).
  return { annee: slugify(periode) || PERIODE_VIDE, mois: null };
}

// Suffixe court anti-collision : 6 premiers hex de l'uuid (sans tirets). Déterministe par
// document, garantit l'unicité du nom même si tous les autres champs coïncident.
function suffixeId(document_id: string): string {
  return document_id.replace(/-/g, "").slice(0, 6).toLowerCase();
}

// Construit le nom de fichier standardisé + le chemin logique. Tout segment vide est
// remplacé par un fallback (jamais de "//" ni "__").
export function buildNomStandardise(input: NomStandardiseInput): NomStandardise {
  const { annee, mois } = decomposePeriode(input.periode);
  const typeSlug = slugify(input.type) || SEGMENT_VIDE;
  const clientSlug = slugify(input.client_nom) || SEGMENT_VIDE;
  const libelleSlug = slugify(input.libelle) || SEGMENT_VIDE;
  const ext = slugify(input.extension) || "bin";
  const id6 = suffixeId(input.document_id);

  // Préfixe période du nom : "2026-04", "2026-t1", ou "2026" / "sans-periode".
  const prefixePeriode = mois ? `${annee}-${mois}` : annee;

  const nom_fichier = `${prefixePeriode}_${typeSlug}_${clientSlug}_${libelleSlug}__${id6}.${ext}`;

  // Chemin logique : annee/mois/type/client. Sans mois → annee/type/client.
  const segmentsChemin = mois ? [annee, mois, typeSlug, clientSlug] : [annee, typeSlug, clientSlug];
  const chemin_logique = segmentsChemin.join("/");

  return { nom_fichier, chemin_logique };
}
