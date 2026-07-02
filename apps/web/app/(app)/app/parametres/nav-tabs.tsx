"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { helpAttrs } from "@/lib/help-attrs";

const TABS = [
  {
    href: "/app/parametres/cabinet",
    label: "Cabinet",
    aide: "Identité légale, adresse et préférences du cabinet, plus le branding du portail client.",
  },
  {
    href: "/app/parametres/equipe",
    label: "Équipe",
    aide: "Gérez les membres du cabinet et leurs rôles, et invitez de nouveaux collaborateurs.",
  },
  {
    href: "/app/parametres/integrations",
    label: "Intégrations",
    aide: "Connectez la messagerie Microsoft 365 du cabinet pour l'ingestion et l'envoi des emails.",
  },
  {
    href: "/app/parametres/ia",
    label: "IA",
    aide: "Activez ou désactivez l'IA du cabinet et suivez sa consommation.",
  },
  {
    href: "/app/parametres/profil",
    label: "Mon profil",
    aide: "Vos informations personnelles, votre signature email et votre mot de passe.",
  },
  {
    href: "/app/parametres/conformite",
    label: "Demandes RGPD",
    aide: "Consultez les demandes de suppression de données émises par vos clients.",
  },
  {
    href: "/app/parametres/compte",
    label: "Compte",
    aide: "Clôture et suppression du compte du cabinet, conformément à la nLPD/RGPD.",
  },
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
              {...helpAttrs(tab.label, tab.aide)}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
