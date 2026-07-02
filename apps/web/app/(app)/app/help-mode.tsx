"use client";

import { HelpCircle, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Mode guide : survol d'un élément → carte futuriste « ce que ça fait /
// comment l'utiliser ». Activable via un toggle dans le header (persisté). ────

type Placement = "haut" | "bas";

type ActiveHint = {
  left: number;
  top: number;
  placement: Placement;
  title: string;
  body: string;
};

type HelpContextValue = {
  enabled: boolean;
  toggle: () => void;
  showHint: (rect: DOMRect, title: string, body: string) => void;
  hideHint: () => void;
};

const HelpContext = createContext<HelpContextValue | null>(null);

const STORAGE_KEY = "zarya-mode-guide";
const CARD_WIDTH = 300;
const CARD_HEIGHT_EST = 130;
const MARGIN = 12;

export function useHelpMode(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelpMode doit être utilisé dans <HelpModeProvider>");
  return ctx;
}

export function HelpModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [hint, setHint] = useState<ActiveHint | null>(null);

  // Restaure la préférence (client-only pour éviter le mismatch SSR).
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1") {
      setEnabled(true);
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      if (!next) setHint(null);
      return next;
    });
  }, []);

  const showHint = useCallback((rect: DOMRect, title: string, body: string) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    if (left + CARD_WIDTH > vw - MARGIN) left = vw - CARD_WIDTH - MARGIN;
    if (left < MARGIN) left = MARGIN;
    // Sous l'élément par défaut ; au-dessus si pas la place en bas.
    const placeBas = rect.bottom + CARD_HEIGHT_EST + MARGIN < vh;
    const top = placeBas ? rect.bottom + 8 : rect.top - 8;
    setHint({ left, top, placement: placeBas ? "bas" : "haut", title, body });
  }, []);

  const hideHint = useCallback(() => setHint(null), []);

  // Le survol devient invalide dès qu'on scrolle : on masque.
  useEffect(() => {
    if (!hint) return;
    const onScroll = () => setHint(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [hint]);

  const value = useMemo(
    () => ({ enabled, toggle, showHint, hideHint }),
    [enabled, toggle, showHint, hideHint],
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      {hint && <HintCard hint={hint} />}
    </HelpContext.Provider>
  );
}

function HintCard({ hint }: { hint: ActiveHint }) {
  const style: React.CSSProperties =
    hint.placement === "bas"
      ? { left: hint.left, top: hint.top }
      : { left: hint.left, top: hint.top, transform: "translateY(-100%)" };

  return (
    <div className="pointer-events-none fixed z-[60]" style={{ ...style, width: CARD_WIDTH }}>
      <div className="zarya-hint-enter relative overflow-hidden rounded-xl p-px shadow-[0_16px_50px_-12px_rgba(79,70,229,0.65)]">
        {/* Bordure animée : conic-gradient qui tourne, révélé en anneau par p-px + overflow */}
        <div
          className="zarya-hint-spin absolute inset-[-150%] bg-[conic-gradient(from_0deg,transparent_0deg,#6366f1_60deg,#22d3ee_120deg,transparent_180deg,transparent_360deg)]"
          aria-hidden
        />
        <div className="relative rounded-[11px] bg-[#0a0d16]/95 p-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
            <Sparkles className="size-3.5 text-indigo-300" aria-hidden />
            {hint.title}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">{hint.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle du header ─────────────────────────────────────────────────────────

export function HelpModeToggle() {
  const { enabled, toggle } = useHelpMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        enabled
          ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-200"
          : "border-white/15 text-slate-400 hover:border-white/25 hover:text-slate-200",
      )}
    >
      <HelpCircle className="size-3.5" aria-hidden />
      Mode guide
      <span
        className={cn(
          "relative h-3.5 w-6 rounded-full transition-colors",
          enabled ? "bg-indigo-500" : "bg-white/15",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-2.5 rounded-full bg-white transition-all",
            enabled ? "left-3" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

// ─── Wrapper d'un élément annotable ──────────────────────────────────────────

export function HelpHint({
  title,
  body,
  className,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { enabled, showHint, hideHint } = useHelpMode();
  const descId = useId();

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: superposition d'aide non focusable ; les enfants restent interactifs
    <div
      className={cn(
        "relative cursor-help rounded-xl outline-none ring-indigo-400/0 transition-shadow hover:ring-2 hover:ring-indigo-400/40",
        className,
      )}
      aria-describedby={descId}
      onMouseEnter={(e) => showHint(e.currentTarget.getBoundingClientRect(), title, body)}
      onMouseLeave={hideHint}
      onFocusCapture={(e) => showHint(e.currentTarget.getBoundingClientRect(), title, body)}
      onBlurCapture={hideHint}
    >
      {children}
      <span id={descId} className="sr-only">
        {title}. {body}
      </span>
    </div>
  );
}
