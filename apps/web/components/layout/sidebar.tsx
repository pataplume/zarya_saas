"use client";

import {
  Briefcase,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  type LucideIcon,
  Menu,
  Receipt,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/(app)/app/actions";
import { useHelpMode } from "@/components/help-mode";
import { OPEN_PALETTE_EVENT } from "@/components/layout/command-palette";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  locked?: boolean;
};

type SidebarProps = {
  cabinetName: string;
  userEmail: string;
  userRole: string;
  /** Rail d'icônes (desktop) : labels masqués, tooltips natifs. */
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const NAV_MAIN: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/clients", label: "Clients", icon: Users },
  { href: "/app/documents", label: "Documents", icon: FileText },
  { href: "/app/calendrier", label: "Calendrier", icon: Calendar },
  { href: "/app/factures", label: "Factures", icon: Receipt },
  { href: "/app/recherche", label: "Recherche", icon: Search },
  { href: "/app/salaire", label: "Salaires", icon: Briefcase },
];

const NAV_BOTTOM: NavItem[] = [{ href: "/app/parametres", label: "Paramètres", icon: Settings }];

const ROLE_LABEL: Record<string, string> = {
  responsable: "Responsable",
  gestionnaire_salaires: "Gestionnaire salaires",
  collaborateur: "Collaborateur",
  lecteur: "Lecteur",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export function Sidebar({
  cabinetName,
  userEmail,
  userRole,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { enabled: guideOn, toggle: toggleGuide } = useHelpMode();

  const isActive = (href: string) =>
    href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem, compact: boolean) => {
    const actif = isActive(item.href);
    if (item.locked) {
      return (
        <span
          title={compact ? item.label : undefined}
          className={cn(
            "flex cursor-not-allowed items-center rounded-md text-[13px] text-slate-600",
            compact ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {!compact && (
            <>
              <span className="flex-1">{item.label}</span>
              <Lock className="h-3 w-3" aria-hidden />
            </>
          )}
        </span>
      );
    }
    return (
      <Link
        href={item.href}
        title={compact ? item.label : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "relative flex items-center rounded-md text-[13px] transition-colors",
          compact ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5",
          actif
            ? "bg-sidebar-active font-medium text-white"
            : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-slate-200",
        )}
      >
        {actif && !compact && (
          <span
            className="absolute inset-y-1 -left-2 w-0.5 rounded-full bg-indigo-400"
            aria-hidden
          />
        )}
        <item.icon
          className={cn("h-4 w-4 shrink-0", actif && "text-indigo-300")}
          strokeWidth={1.75}
          aria-hidden
        />
        {!compact && <span className="flex-1 truncate">{item.label}</span>}
      </Link>
    );
  };

  const renderBody = (compact: boolean, collapsible: boolean) => (
    <div className="flex h-full flex-col bg-sidebar text-slate-100">
      {/* Wordmark */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border",
          compact ? "justify-center px-0" : "gap-2 px-4",
        )}
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded bg-indigo-600 text-[11px] font-bold text-white"
          aria-hidden
        >
          Z
        </span>
        {!compact && (
          <>
            <span className="text-sm font-semibold tracking-[0.14em] text-white">ZARYA</span>
            <span className="rounded border border-sidebar-border px-1 py-px text-[10px] font-medium text-slate-400">
              Beta
            </span>
          </>
        )}
      </div>

      {/* Cabinet (masqué en rail) */}
      {!compact && (
        <div className="border-b border-sidebar-border px-4 py-2.5">
          <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Cabinet
          </p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-slate-200">{cabinetName}</p>
        </div>
      )}

      {/* Recherche rapide (palette ⌘K) */}
      <div className={cn("pt-3", compact ? "px-2" : "px-3")}>
        <button
          type="button"
          title={compact ? "Recherche rapide (⌘K)" : undefined}
          onClick={() => {
            setMobileOpen(false);
            document.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
          }}
          className={cn(
            "flex w-full items-center rounded-md border border-sidebar-border bg-white/[0.03] text-[13px] text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200",
            compact ? "justify-center px-0 py-2" : "gap-2 px-2.5 py-1.5",
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          {!compact && (
            <>
              <span className="flex-1 text-left">Recherche rapide</span>
              <kbd className="rounded border border-sidebar-border bg-white/[0.04] px-1 py-px font-mono text-[10px] text-slate-500">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation principale */}
      <nav className={cn("flex-1 overflow-y-auto py-3", compact ? "px-2" : "px-3")}>
        <ul className="space-y-px">
          {NAV_MAIN.map((item) => (
            <li key={item.href}>{renderItem(item, compact)}</li>
          ))}
        </ul>
      </nav>

      {/* Mode guide (toggle) + Paramètres */}
      <div className={cn("border-t border-sidebar-border py-2", compact ? "px-2" : "px-3")}>
        <button
          type="button"
          role="switch"
          aria-checked={guideOn}
          title={compact ? "Mode guide" : undefined}
          onClick={toggleGuide}
          className={cn(
            "relative flex w-full items-center rounded-md text-[13px] transition-colors",
            compact ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5",
            guideOn
              ? "text-indigo-200 hover:bg-white/[0.04]"
              : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-slate-200",
          )}
        >
          <HelpCircle
            className={cn("h-4 w-4 shrink-0", guideOn && "text-indigo-300")}
            strokeWidth={1.75}
            aria-hidden
          />
          {!compact ? (
            <>
              <span className="flex-1 text-left">Mode guide</span>
              <span
                className={cn(
                  "relative h-3.5 w-6 shrink-0 rounded-full transition-colors",
                  guideOn ? "bg-indigo-500" : "bg-white/15",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-2.5 rounded-full bg-white transition-all",
                    guideOn ? "left-3" : "left-0.5",
                  )}
                />
              </span>
            </>
          ) : (
            guideOn && (
              <span
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-indigo-400"
                aria-hidden
              />
            )
          )}
        </button>
        <ul className="mt-px space-y-px">
          {NAV_BOTTOM.map((item) => (
            <li key={item.href}>{renderItem(item, compact)}</li>
          ))}
        </ul>
      </div>

      {/* Utilisateur + déconnexion */}
      <div className={cn("border-t border-sidebar-border py-3", compact ? "px-2" : "px-3")}>
        <div className={cn("mb-2 flex items-center", compact ? "justify-center" : "gap-2.5 px-1")}>
          <span
            title={compact ? userEmail : undefined}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-slate-200"
            aria-hidden
          >
            {(userEmail[0] ?? "?").toUpperCase()}
          </span>
          {!compact && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-200">{userEmail}</p>
              <p className="truncate text-[11px] text-slate-500">
                {ROLE_LABEL[userRole] ?? userRole}
              </p>
            </div>
          )}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            title={compact ? "Se déconnecter" : undefined}
            className={cn(
              "flex w-full items-center rounded-md text-[13px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300",
              compact ? "justify-center px-0 py-2" : "gap-2 px-2.5 py-1.5",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {!compact && "Se déconnecter"}
          </button>
        </form>

        {/* Réduire / étendre (desktop) */}
        {collapsible && (
          <button
            type="button"
            title={compact ? "Étendre le menu" : undefined}
            onClick={onToggleCollapse}
            className={cn(
              "mt-1 flex w-full items-center rounded-md text-[13px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300",
              compact ? "justify-center px-0 py-2" : "gap-2 px-2.5 py-1.5",
            )}
          >
            {compact ? (
              <ChevronsRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                Réduire
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — largeur selon l'état replié */}
      <div
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col lg:border-r lg:border-black/20 lg:transition-[width] lg:duration-200",
          collapsed ? "lg:w-16" : "lg:w-60",
        )}
      >
        {renderBody(collapsed, true)}
      </div>

      {/* Mobile — bouton hamburger */}
      <div className="fixed top-0 left-0 z-40 flex h-14 w-full items-center border-b border-border bg-card px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="ml-2 flex items-center gap-1.5 text-sm font-semibold tracking-[0.14em] text-slate-800">
          <span
            className="flex size-5 items-center justify-center rounded bg-indigo-600 text-[10px] font-bold text-white"
            aria-hidden
          >
            Z
          </span>
          ZARYA
        </span>
      </div>

      {/* Mobile — overlay + drawer (toujours complet) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col animate-in slide-in-from-left duration-200">
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:text-white"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {renderBody(false, false)}
          </div>
        </div>
      )}
    </>
  );
}
