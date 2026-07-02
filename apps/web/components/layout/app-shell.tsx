"use client";

import { useCallback, useEffect, useState } from "react";
import { HelpModeProvider } from "@/components/help-mode";
import { CommandPalette } from "@/components/layout/command-palette";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "zarya-sidebar-collapsed";

/**
 * Coquille du dashboard fiduciaire (client) : porte l'état « sidebar repliée »
 * (persisté) et le provider du mode guide, partagés entre la sidebar (toggle)
 * et les pages (HelpHint). Le décalage du contenu suit la largeur de la sidebar.
 */
export function AppShell({
  cabinetName,
  userEmail,
  userRole,
  children,
}: {
  cabinetName: string;
  userEmail: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(COLLAPSE_KEY) === "1") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  return (
    <HelpModeProvider>
      <div className="min-h-screen bg-slate-50">
        <CommandPalette />
        <Sidebar
          cabinetName={cabinetName}
          userEmail={userEmail}
          userRole={userRole}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
        <main
          className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-16" : "lg:pl-60")}
        >
          {/* Espace pour la topbar mobile */}
          <div className="h-14 lg:hidden" />
          {children}
        </main>
      </div>
    </HelpModeProvider>
  );
}
