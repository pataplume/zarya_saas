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
        <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500">
          <item.icon className="h-5 w-5 text-slate-600" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">{item.label}</span>
          <Lock className="h-3.5 w-3.5" aria-hidden />
        </span>
      );
    }
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
          isActive(item.href)
            ? "bg-slate-700 font-medium text-white"
            : "text-slate-300 hover:bg-slate-800 hover:text-white",
        )}
      >
        <item.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">{item.label}</span>
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-700/60 px-5">
        <span className="text-lg font-bold tracking-tight text-white">ZARYA</span>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-300">
          Beta
        </span>
      </div>

      {/* Cabinet name */}
      <div className="border-b border-slate-700/60 px-5 py-3">
        <p className="truncate text-xs font-medium text-slate-400 uppercase tracking-wider">
          Cabinet
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-white">{cabinetName}</p>
      </div>

      {/* Recherche rapide (palette ⌘K) */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            document.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
          }}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="flex-1 text-left">Recherche rapide</span>
          <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation principale */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_MAIN.map((item) => (
            <li key={item.href}>{renderItem(item)}</li>
          ))}
        </ul>
      </nav>

      {/* Navigation bas */}
      <div className="border-t border-slate-700/60 px-3 py-2">
        <ul className="space-y-0.5">
          {NAV_BOTTOM.map((item) => (
            <li key={item.href}>{renderItem(item)}</li>
          ))}
        </ul>
      </div>

      {/* Utilisateur + déconnexion */}
      <div className="border-t border-slate-700/60 px-4 py-4">
        <div className="mb-3">
          <p className="truncate text-sm font-medium text-slate-200">{userEmail}</p>
          <p className="mt-0.5 text-xs text-slate-500">{roleLabel[userRole] ?? userRole}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — toujours visible */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        {sidebarContent}
      </div>

      {/* Mobile — bouton hamburger */}
      <div className="fixed top-0 left-0 z-40 flex h-14 w-full items-center border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
        <span className="ml-3 text-sm font-bold text-slate-800">ZARYA</span>
      </div>

      {/* Mobile — overlay + drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col">
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:text-white"
                aria-label="Fermer le menu"
              >
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
