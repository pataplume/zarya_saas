// Helpers PURS de la coquille « espace client » (Bloc F2, dashboard-client.md §4).
// Pas d'I/O — testables isolément. Le routage par rôle et le branding (défauts ZARYA si
// le cabinet n'a pas renseigné ses couleurs) sont la logique métier de la coquille.

/** Espace cible selon le rôle JWT : un contact RH va dans l'espace client, sinon fiduciaire. */
export function espaceCible(role: string | undefined): "client" | "fiduciaire" {
  return role === "client_contact" ? "client" : "fiduciaire";
}

/** Branding par défaut (ZARYA) si le cabinet n'a pas configuré le sien. */
export const BRANDING_DEFAUT = {
  couleurPrimaire: "#1e3a8a", // bleu ZARYA
  couleurSecondaire: "#475569",
  logoUrl: null as string | null,
};

export interface CabinetBranding {
  logo_url: string | null;
  couleur_primaire: string | null;
  couleur_secondaire: string | null;
}

export interface BrandingResolu {
  logoUrl: string | null;
  couleurPrimaire: string;
  couleurSecondaire: string;
}

/** Résout le branding cabinet → valeurs effectives (défauts ZARYA si null/vide). */
export function resolveBranding(c: CabinetBranding | null | undefined): BrandingResolu {
  const clean = (v: string | null | undefined) => {
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
  };
  return {
    logoUrl: clean(c?.logo_url),
    couleurPrimaire: clean(c?.couleur_primaire) ?? BRANDING_DEFAUT.couleurPrimaire,
    couleurSecondaire: clean(c?.couleur_secondaire) ?? BRANDING_DEFAUT.couleurSecondaire,
  };
}

/** Onglets de navigation du mini-dashboard client (bottom-tab mobile / nav desktop). */
export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_CLIENT: readonly NavItem[] = [
  { href: "/espace", label: "Accueil", icon: "🏠" },
  { href: "/espace/entreprise", label: "Mon entreprise", icon: "💼" },
  { href: "/espace/employes", label: "Mes employés", icon: "👥" },
  { href: "/espace/validations", label: "Validations", icon: "📅" },
  { href: "/espace/documents", label: "Documents", icon: "📄" },
  { href: "/espace/contact", label: "Contact", icon: "💬" },
  { href: "/espace/parametres", label: "Paramètres", icon: "⚙️" },
] as const;
