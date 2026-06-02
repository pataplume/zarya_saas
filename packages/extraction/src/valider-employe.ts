// F6c — Cœur PUR de validation des employés : checksum AVS + détection de doublons.
// Réf : docs/modules/onboarding-client.md §7.6-7.8 ; salaire-schema.md §3 ; ADR 0007.

import { CHAMPS_OBLIGATOIRES_SWISSDEC, type NomChamp } from "./employe-fields";

/**
 * Valide un numéro AVS suisse (nouveau format 756.XXXX.XXXX.XX = EAN-13).
 * PUR. Règles : 13 chiffres, préfixe 756, chiffre de contrôle EAN-13 (mod-10).
 */
export function isValidAvs(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const d = raw.replace(/\D/g, "");
  if (d.length !== 13) return false;
  if (!d.startsWith("756")) return false;
  // EAN-13 : somme pondérée des 12 premiers (poids 1,3,1,3… depuis la gauche),
  // chiffre de contrôle = (10 - somme mod 10) mod 10.
  let somme = 0;
  for (let i = 0; i < 12; i++) {
    const chiffre = Number(d[i]);
    somme += i % 2 === 0 ? chiffre : chiffre * 3;
  }
  const contrôle = (10 - (somme % 10)) % 10;
  return contrôle === Number(d[12]);
}

/** Identité minimale d'un employé pour la détection de doublons (champs NON sensibles). */
export interface IdentiteEmploye {
  id: string;
  nom?: string | null;
  prenom?: string | null;
  date_naissance?: string | null;
}

function normaliserTexte(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Détecte les doublons potentiels d'un candidat par IDENTITÉ (nom + prénom + date de naissance).
 * PUR. NB : le match par AVS (doc §7.7) est DIFFÉRÉ — l'AVS est chiffré au Vault (anti-clair),
 * un match nécessiterait un déchiffrement transverse ou un hash dédié (non au schéma). Le signal
 * identité couvre le cas courant (contrat PDF + ligne Excel du même employé).
 */
export function detectDoublonsParIdentite(
  candidat: Omit<IdentiteEmploye, "id">,
  existants: IdentiteEmploye[],
): string[] {
  const nom = normaliserTexte(candidat.nom);
  const prenom = normaliserTexte(candidat.prenom);
  const naissance = (candidat.date_naissance ?? "").trim();
  if (!nom || !prenom) return [];
  return existants
    .filter(
      (e) =>
        normaliserTexte(e.nom) === nom &&
        normaliserTexte(e.prenom) === prenom &&
        // si les deux ont une date de naissance, elle doit coïncider ; sinon nom+prénom suffit
        (!naissance || !e.date_naissance || (e.date_naissance ?? "").trim() === naissance),
    )
    .map((e) => e.id);
}

/** Un champ proposé tel que lu en base pour décider de la finalisation. */
export interface ChampPourFinalisation {
  nom_champ: NomChamp;
  statut: "propose" | "valide" | "modifie" | "rejete" | "manquant";
  obligatoire_swissdec: boolean;
}

/**
 * Détermine si une proposition est finalisable : TOUS les champs obligatoires-Swissdec doivent
 * être en statut `valide` ou `modifie` (validation granulaire stricte, ADR 0007 — aucun raccourci).
 * Retourne la liste des champs bloquants (vide = finalisable).
 */
export function champsBloquants(champs: ChampPourFinalisation[]): NomChamp[] {
  const valideParChamp = new Map<NomChamp, ChampPourFinalisation["statut"]>();
  for (const c of champs) valideParChamp.set(c.nom_champ, c.statut);
  const bloquants: NomChamp[] = [];
  for (const nom of Array.from(CHAMPS_OBLIGATOIRES_SWISSDEC)) {
    const statut = valideParChamp.get(nom as NomChamp);
    if (statut !== "valide" && statut !== "modifie") bloquants.push(nom as NomChamp);
  }
  return bloquants;
}
