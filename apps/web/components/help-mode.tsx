"use client";

import { Sparkles } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type HelpAttrs, helpAttrs } from "@/lib/help-attrs";
import { cn } from "@/lib/utils";

// ─── Mode guide : survol/focus d'un élément portant `data-help-title/body` →
// carte futuriste « ce que ça fait / comment l'utiliser ». Un seul écouteur
// délégué (pas de wrapper par élément). Toggle dans la sidebar. ──────────────

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
  const currentEl = useRef<Element | null>(null);

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
      return next;
    });
  }, []);

  const showForElement = useCallback((el: Element) => {
    const title = el.getAttribute("data-help-title") ?? "";
    const body = el.getAttribute("data-help-body") ?? "";
    if (!title) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    if (left + CARD_WIDTH > vw - MARGIN) left = vw - CARD_WIDTH - MARGIN;
    if (left < MARGIN) left = MARGIN;
    // Sous l'élément par défaut ; au-dessus s'il n'y a pas la place en bas.
    const placeBas = rect.bottom + CARD_HEIGHT_EST + MARGIN < vh;
    const top = placeBas ? rect.bottom + 8 : rect.top - 8;
    setHint({ left, top, placement: placeBas ? "bas" : "haut", title, body });
  }, []);

  // Écoute déléguée : active seulement quand le mode guide est ON.
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("zarya-guide-on");

    const resolve = (target: EventTarget | null): Element | null =>
      target instanceof Element ? target.closest("[data-help-title]") : null;

    const onOver = (e: PointerEvent) => {
      const el = resolve(e.target);
      if (el === currentEl.current) return;
      currentEl.current = el;
      if (el) showForElement(el);
      else setHint(null);
    };
    const onFocus = (e: FocusEvent) => {
      const el = resolve(e.target);
      currentEl.current = el;
      if (el) showForElement(el);
      else setHint(null);
    };
    const onScroll = () => {
      currentEl.current = null;
      setHint(null);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      root.classList.remove("zarya-guide-on");
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("scroll", onScroll, true);
      currentEl.current = null;
      setHint(null);
    };
  }, [enabled, showForElement]);

  const value = useMemo(() => ({ enabled, toggle }), [enabled, toggle]);

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

// ─── Wrapper de commodité (le dashboard l'utilise) : pose data-help sur un div
// englobant. Pour un élément déjà cliquable, préférer `{...helpAttrs(...)}`
// directement dessus (aucun div en plus). ────────────────────────────────────

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
  const attrs: HelpAttrs = helpAttrs(title, body);
  return (
    <div className={className} {...attrs}>
      {children}
    </div>
  );
}
