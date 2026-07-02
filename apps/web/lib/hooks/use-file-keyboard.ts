"use client";

import { useEffect } from "react";

type FileKeyboardOptions = {
  /** Nombre d'items visibles dans la file. */
  count: number;
  cursor: number;
  setCursor: (next: number) => void;
  /** V — action principale sur l'item courant (valider / envoyer). */
  onAction?: (index: number) => void;
  /** C — corriger / modifier l'item courant. */
  onCorriger?: (index: number) => void;
  /** R — rejeter l'item courant. */
  onRejeter?: (index: number) => void;
  /** false quand une modal est ouverte (les raccourcis sont suspendus). */
  enabled?: boolean;
};

function estChampDeSaisie(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Raccourcis clavier communs des files de travail ZARYA
 * (documents, factures, relances) :
 *   J = début · N = suivant · P = précédent · V = agir · C = corriger · R = rejeter
 * Inactifs quand le focus est dans un champ de saisie, quand une modal est
 * ouverte (`enabled: false`) ou quand un modificateur (⌘/Ctrl/Alt) est enfoncé.
 */
export function useFileKeyboard({
  count,
  cursor,
  setCursor,
  onAction,
  onCorriger,
  onRejeter,
  enabled = true,
}: FileKeyboardOptions) {
  useEffect(() => {
    if (!enabled || count === 0) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (estChampDeSaisie(e.target)) return;

      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          setCursor(0);
          break;
        case "n":
          e.preventDefault();
          setCursor(Math.min(cursor + 1, count - 1));
          break;
        case "p":
          e.preventDefault();
          setCursor(Math.max(cursor - 1, 0));
          break;
        case "v":
          if (onAction) {
            e.preventDefault();
            onAction(cursor);
          }
          break;
        case "c":
          if (onCorriger) {
            e.preventDefault();
            onCorriger(cursor);
          }
          break;
        case "r":
          if (onRejeter) {
            e.preventDefault();
            onRejeter(cursor);
          }
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, count, cursor, setCursor, onAction, onCorriger, onRejeter]);
}
