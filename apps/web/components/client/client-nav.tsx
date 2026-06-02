"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_CLIENT } from "@/lib/client-space";

// Navigation du mini-dashboard client (F2). Mobile-first : bottom-tab fixe en bas sur
// mobile, barre latérale sur desktop. L'onglet actif est dérivé du pathname.
export function ClientNav() {
  const pathname = usePathname();
  const estActif = (href: string) =>
    href === "/espace" ? pathname === "/espace" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navigation espace client"
      className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-gray-200 bg-white lg:inset-y-0 lg:left-0 lg:w-56 lg:flex-col lg:justify-start lg:border-t-0 lg:border-r lg:pt-20"
    >
      {NAV_CLIENT.map((item) => {
        const actif = estActif(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={actif ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs lg:flex-none lg:flex-row lg:gap-3 lg:px-6 lg:py-3 lg:text-sm ${
              actif ? "font-semibold text-[var(--couleur-primaire)]" : "text-gray-500"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            <span className="hidden sm:inline lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
