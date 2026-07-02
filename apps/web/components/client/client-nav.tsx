"use client";

import {
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  type LucideIcon,
  Mail,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_CLIENT } from "@/lib/client-space";
import { cn } from "@/lib/utils";

// Icônes lucide par onglet — la présentation vit ici, NAV_CLIENT reste la source
// des libellés/href (helpers purs testés).
const ICONES: Record<string, LucideIcon> = {
  "/espace": Home,
  "/espace/entreprise": Building2,
  "/espace/employes": Users,
  "/espace/validations": ClipboardCheck,
  "/espace/documents": FileText,
  "/espace/contact": Mail,
  "/espace/parametres": Settings,
};

// Navigation du mini-dashboard client (F2). Mobile-first : bottom-tab fixe en bas sur
// mobile, barre latérale sur desktop. L'onglet actif est dérivé du pathname.
export function ClientNav() {
  const pathname = usePathname();
  const estActif = (href: string) =>
    href === "/espace" ? pathname === "/espace" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navigation espace client"
      className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-border bg-card lg:inset-y-0 lg:left-0 lg:w-56 lg:flex-col lg:justify-start lg:border-t-0 lg:border-r lg:pt-20"
    >
      {NAV_CLIENT.map((item) => {
        const actif = estActif(item.href);
        const Icone = ICONES[item.href] ?? Home;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={actif ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors lg:flex-none lg:flex-row lg:gap-3 lg:px-6 lg:py-2.5 lg:text-sm",
              actif
                ? "font-medium text-[var(--couleur-primaire)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="h-5 w-5 lg:h-4 lg:w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
