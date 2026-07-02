"use client";

import {
  Briefcase,
  Building2,
  Calendar,
  FileCheck,
  FileText,
  LayoutDashboard,
  Mail,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  type ClientPaletteResult,
  rechercherClientsPaletteAction,
} from "@/app/(app)/app/actions-palette";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/** Événement custom : permet à la sidebar (autre composant client) d'ouvrir la palette. */
export const OPEN_PALETTE_EVENT = "zarya:open-palette";

const NAVIGATION = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard, motsCles: "accueil home" },
  { label: "Clients", href: "/app/clients", icon: Users, motsCles: "pme dossier" },
  { label: "Documents", href: "/app/documents", icon: FileText, motsCles: "upload depot" },
  {
    label: "Documents à valider",
    href: "/app/documents/validation",
    icon: FileCheck,
    motsCles: "file validation classement",
  },
  {
    label: "Échéances",
    href: "/app/calendrier/echeances",
    icon: Calendar,
    motsCles: "calendrier deadline",
  },
  {
    label: "Relances à valider",
    href: "/app/calendrier/relances",
    icon: Mail,
    motsCles: "email rappel",
  },
  {
    label: "Factures à valider",
    href: "/app/factures/validation",
    icon: Receipt,
    motsCles: "fournisseur qr",
  },
  { label: "Salaires", href: "/app/salaire", icon: Briefcase, motsCles: "paie periode" },
  {
    label: "Recherche documentaire (IA)",
    href: "/app/recherche",
    icon: Search,
    motsCles: "rag question semantique",
  },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientPaletteResult[]>([]);
  const [, startTransition] = useTransition();

  // Ouverture : ⌘K / Ctrl+K, ou événement custom (bouton sidebar).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  // Recherche clients (débouncée) dès 2 caractères.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setClients([]);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        setClients(await rechercherClientsPaletteAction(query));
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  function aller(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Recherche rapide">
      <CommandInput
        placeholder="Aller à… ou chercher un client…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        {clients.length > 0 && (
          <>
            <CommandGroup heading="Clients">
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`client-${c.raison_sociale}`}
                  onSelect={() => aller(`/app/clients/${c.id}`)}
                >
                  <Building2 aria-hidden />
                  {c.raison_sociale}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Navigation">
          {NAVIGATION.map((n) => (
            <CommandItem
              key={n.href}
              value={`${n.label} ${n.motsCles}`}
              onSelect={() => aller(n.href)}
            >
              <n.icon aria-hidden />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
