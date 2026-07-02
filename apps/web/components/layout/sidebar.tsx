"use client";

import {
  Briefcase,
  Calendar,
  FileText,
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
};

// ─── Navigation items ─────────────────────────────────────────────────────────

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

// ─── Composant principal ──────────────────────────────────────────────────────

export function Sidebar({ cabinetName, userEmail, userRole }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const roleLabel: Record<string, string> = {
    responsable: "Responsable",
    gestionnaire_salaires: "Gestionnaire salaires",
    collaborateur: "Collaborateur",
    lecteur: "Lecteur",
  };

  const renderItem = (item: NavItem) => {
    if (item.locked) {
      return (
        <span className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-slate-600">
          <item.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">{item.label}</span>
          <Lock className="h-3 w-3" aria-hidden />
        </span>
      );
    }
    const actif = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
          actif
            ? "bg-sidebar-active font-medium text-white"
            : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-slate-200",
        )}
      >
        {/* Barre d'accent de l'item actif */}
        {actif && (
          <span className="absolute inset-y-1 -left-2 w-0.5 rounded-full bg-blue-400" aria-hidden />
        )}
        <item.icon
          className={cn("h-4 w-4", actif ? "text-blue-300" : "")}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="flex-1">{item.label}</span>
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar text-slate-100">
      {/* Wordmark */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <span
          className="flex size-6 items-center justify-center rounded bg-blue-600 text-[11px] font-bold text-white"
          aria-hidden
        >
          Z
        </span>
        <span className="text-sm font-semibold tracking-[0.14em] text-white">ZARYA</span>
        <span className="rounded border border-sidebar-border px-1 py-px text-[10px] font-medium text-slate-400">
          Beta
        </span>
      </div>

      {/* Cabinet */}
      <div className="border-b border-sidebar-border px-4 py-2.5">
        <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Cabinet
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-slate-200">{cabinetName}</p>
      </div>

      {/* Recherche rapide (palette ⌘K) */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            document.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
          }}
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          <span className="flex-1 text-left">Recherche rapide</span>
          <kbd className="rounded border border-sidebar-border bg-white/[0.04] px-1 py-px font-mono text-[10px] text-slate-500">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation principale */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-px">
          {NAV_MAIN.map((item) => (
            <li key={item.href}>{renderItem(item)}</li>
          ))}
        </ul>
      </nav>

      {/* Navigation bas */}
      <div className="border-t border-sidebar-border px-3 py-2">
        <ul className="space-y-px">
          {NAV_BOTTOM.map((item) => (
            <li key={item.href}>{renderItem(item)}</li>
          ))}
        </ul>
      </div>

      {/* Utilisateur + déconnexion */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-slate-200"
            aria-hidden
          >
            {(userEmail[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-slate-200">{userEmail}</p>
            <p className="truncate text-[11px] text-slate-500">{roleLabel[userRole] ?? userRole}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — toujours visible */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-black/20">
        {sidebarContent}
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
            className="flex size-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white"
            aria-hidden
          >
            Z
          </span>
          ZARYA
        </span>
      </div>

      {/* Mobile — overlay + drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
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
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
