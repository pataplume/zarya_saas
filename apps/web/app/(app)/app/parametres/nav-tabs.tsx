"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/parametres/cabinet", label: "Cabinet" },
  { href: "/app/parametres/equipe", label: "Équipe" },
  { href: "/app/parametres/integrations", label: "Intégrations" },
  { href: "/app/parametres/ia", label: "IA" },
  { href: "/app/parametres/profil", label: "Mon profil" },
  { href: "/app/parametres/conformite", label: "Demandes RGPD" },
  { href: "/app/parametres/compte", label: "Compte" },
];

export function ParametresTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
