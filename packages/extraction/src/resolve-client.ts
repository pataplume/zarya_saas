// Rattachement client multi-signal (Bloc B2, ADR 0014).
//
// Détermine quel client du cabinet un document concerne, à partir de signaux
// déterministes — par ordre de force (doc.md §5.1) :
//   1. IDE (CHE-XXX.XXX.XXX) trouvé dans le texte/nom  → match exact `crm.client.ide`
//   2. email expéditeur                                 → `crm.contact.email`
//   3. email expéditeur                                 → `crm.client.email_contact`
//   4. raison sociale / nom court présent dans le texte → substring/token-overlap
//
// Sortie = top-3 candidats classés + palier de confiance (doc.md §5.2, ADR 0014) :
//   ≥ 0.90 → `auto` ; 0.60–0.90 → `proposer` ; < 0.60 → `manuel` (pas de rattachement).
//
// ANTI-FUITE (règle absolue) : la récupération est TOUJOURS scopée `cabinet_id`.
// Aucun candidat ne peut provenir d'un autre cabinet — par construction de la requête.
// La logique de scoring est PURE (testable sans DB) ; seul `resolveClientCandidates`
// touche la base.
//
// Le signal « domaine expéditeur » (`crm.client.domaines_emails`) et l'inférence
// sémantique pure sont différés (ADR 0014 §4) : colonne absente / faible valeur MVP.

import { and, client, contact, db, eq, isNull } from "@zarya/db";

export const SEUIL_RATTACHEMENT_AUTO = 0.9;
export const SEUIL_RATTACHEMENT_PROPOSER = 0.6;

export type ClientPalier = "auto" | "proposer" | "manuel";

// Lignes minimales nécessaires au scoring (projection explicite, pas de SELECT *).
export interface ClientRow {
  id: string;
  raison_sociale: string;
  nom_court: string | null;
  ide: string | null;
  email_contact: string | null;
}
export interface ContactRow {
  client_id: string;
  email: string | null;
}

export interface ClientCandidat {
  client_id: string;
  score: number;
  raison: string;
}

export interface ClientResolution {
  client_id_propose: string | null;
  confiance: number | null;
  palier: ClientPalier;
  candidats: ClientCandidat[];
}

export interface ClientSignals {
  ide: string | null;
  expediteur_email: string | null;
  texte: string;
}

// IDE suisse : CHE-XXX.XXX.XXX. On tolère séparateurs variables (espace, point, rien)
// et normalise vers la forme canonique pour comparer à `crm.client.ide`.
const IDE_RE = /CHE[-\s]?(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})/i;

export function extractIde(texte: string | null | undefined): string | null {
  if (!texte) return null;
  const m = IDE_RE.exec(texte);
  if (!m) return null;
  return `CHE-${m[1]}.${m[2]}.${m[3]}`;
}

export function normalizeIde(ide: string | null | undefined): string | null {
  return extractIde(ide);
}

// Minuscule, sans accents, alphanumérique séparé par espaces simples.
function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 3);
}

// Score d'apparition d'un nom (raison sociale / nom court) dans le texte du document.
// 0 si non détecté. Substring complet = fort ; couverture partielle des tokens = dégradé.
function scoreNomDansTexte(
  nom: string | null,
  texteNorm: string,
  texteTokens: Set<string>,
): number {
  const n = normalize(nom);
  if (!n) return 0;
  if (n.length >= 4 && texteNorm.includes(n)) return 0.78;
  const nomTokens = tokens(n);
  if (nomTokens.length === 0) return 0;
  const presents = nomTokens.filter((t) => texteTokens.has(t)).length;
  const ratio = presents / nomTokens.length;
  if (ratio === 1) return 0.7;
  if (ratio >= 0.5) return 0.6 + (ratio - 0.5) * 0.2; // 0.60 → 0.70
  return 0;
}

function palierFor(confiance: number): ClientPalier {
  if (confiance >= SEUIL_RATTACHEMENT_AUTO) return "auto";
  if (confiance >= SEUIL_RATTACHEMENT_PROPOSER) return "proposer";
  return "manuel";
}

// Cœur PUR du rattachement : à partir des signaux + des lignes du cabinet déjà
// récupérées, calcule la confiance par client et renvoie le top-3 + palier.
export function scoreClients(
  signals: ClientSignals,
  clients: ClientRow[],
  contacts: ContactRow[],
): ClientResolution {
  const texteNorm = normalize(signals.texte);
  const texteTokens = new Set(tokens(signals.texte));
  const ideCible = normalizeIde(signals.ide);
  const email = signals.expediteur_email ? signals.expediteur_email.trim().toLowerCase() : null;

  // email → client_id (via contacts du cabinet).
  const emailToClient = new Map<string, string>();
  if (email) {
    for (const c of contacts) {
      const e = c.email?.trim().toLowerCase();
      if (e) emailToClient.set(e, c.client_id);
    }
  }

  type Acc = { best: number; raison: string; signaux: number };
  const acc = new Map<string, Acc>();
  const bump = (clientId: string, score: number, raison: string) => {
    const cur = acc.get(clientId);
    if (!cur) {
      acc.set(clientId, { best: score, raison, signaux: 1 });
    } else {
      cur.signaux += 1;
      if (score > cur.best) {
        cur.best = score;
        cur.raison = raison;
      }
    }
  };

  for (const cli of clients) {
    if (ideCible && normalizeIde(cli.ide) === ideCible) bump(cli.id, 0.98, "ide_exact");

    if (email) {
      if (emailToClient.get(email) === cli.id) bump(cli.id, 0.95, "email_contact_exact");
      if (cli.email_contact?.trim().toLowerCase() === email) {
        bump(cli.id, 0.93, "email_client_exact");
      }
    }

    const sRaison = scoreNomDansTexte(cli.raison_sociale, texteNorm, texteTokens);
    if (sRaison > 0) bump(cli.id, sRaison, "raison_sociale_texte");
    const sCourt = scoreNomDansTexte(cli.nom_court, texteNorm, texteTokens);
    if (sCourt > 0) bump(cli.id, sCourt, "nom_court_texte");
  }

  const candidats: ClientCandidat[] = Array.from(acc.entries())
    .map(([client_id, a]) => {
      // Petit bonus si plusieurs signaux indépendants concordent (cap 0.99).
      const boost = a.signaux >= 2 ? 0.03 : 0;
      const score = Math.min(0.99, Number((a.best + boost).toFixed(2)));
      return { client_id, score, raison: a.raison };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);

  const top = candidats[0];
  if (!top) {
    return { client_id_propose: null, confiance: null, palier: "manuel", candidats: [] };
  }
  const palier = palierFor(top.score);
  return {
    client_id_propose: palier === "manuel" ? null : top.client_id,
    confiance: top.score,
    palier,
    candidats,
  };
}

// Récupère les clients + contacts du cabinet (scope strict cabinet_id, anti-fuite)
// puis délègue au scoring pur. `database` injectable pour les tests.
export async function resolveClientCandidates(
  input: { cabinet_id: string; texte: string; expediteur_email?: string | null },
  database: typeof db = db,
): Promise<ClientResolution> {
  const clients = await database
    .select({
      id: client.id,
      raison_sociale: client.raison_sociale,
      nom_court: client.nom_court,
      ide: client.ide,
      email_contact: client.email_contact,
    })
    .from(client)
    .where(and(eq(client.cabinet_id, input.cabinet_id), isNull(client.archived_at)));

  const contacts = await database
    .select({ client_id: contact.client_id, email: contact.email })
    .from(contact)
    .where(and(eq(contact.cabinet_id, input.cabinet_id), isNull(contact.archived_at)));

  return scoreClients(
    {
      ide: extractIde(input.texte),
      expediteur_email: input.expediteur_email ?? null,
      texte: input.texte,
    },
    clients,
    contacts,
  );
}
