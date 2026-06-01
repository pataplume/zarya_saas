// Types publics du wrapper Microsoft Graph (Bloc D2). Surface volontairement minimale
// et frenchie côté ZARYA ; les formes brutes Graph restent internes à client.ts.

// ─── Email ──────────────────────────────────────────────────────────────────

export interface EmailFilter {
  /** Dossier Outlook (défaut : 'Inbox'). */
  folder?: string;
  /** Nombre max de messages ($top, défaut 25). */
  top?: number;
  /** Ne remonter que les non lus. */
  unreadOnly?: boolean;
  /** Messages reçus à partir de cette date (ISO 8601). */
  since?: string;
  /** Champs $select (défaut : projection standard). */
  select?: string[];
}

export interface EmailSummary {
  id: string;
  subject: string | null;
  from: string | null;
  receivedDateTime: string | null;
  hasAttachments: boolean;
  bodyPreview: string | null;
}

export interface EmailDetail extends EmailSummary {
  bodyContentType: string | null;
  body: string | null;
  toRecipients: string[];
}

export interface SendEmailParams {
  subject: string;
  body: string;
  bodyType?: "Text" | "HTML";
  to: string[];
  cc?: string[];
  /** Conserver une copie dans Éléments envoyés (défaut true). */
  saveToSentItems?: boolean;
}

// ─── Calendrier ───────────────────────────────────────────────────────────────

export interface EventFilter {
  top?: number;
  /** Début de fenêtre (ISO 8601). */
  since?: string;
  /** Fin de fenêtre (ISO 8601). */
  until?: string;
}

export interface CalendarEvent {
  id: string;
  subject: string | null;
  start: string | null;
  end: string | null;
  isAllDay: boolean;
}

export interface CreateEventParams {
  subject: string;
  /** Début (ISO 8601). */
  start: string;
  /** Fin (ISO 8601). */
  end: string;
  /** Fuseau (défaut 'UTC'). */
  timeZone?: string;
  body?: string;
  attendees?: string[];
  isAllDay?: boolean;
}
