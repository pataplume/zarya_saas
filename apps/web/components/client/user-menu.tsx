"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/(app)/espace/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Menu utilisateur du header /espace (UX Lot 5). Le layout est un Server Component :
// ce petit composant client reçoit l'email en prop et porte l'interactivité (Radix).
export function UserMenu({ email }: { email: string }) {
  const initiale = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu utilisateur"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm text-gray-500 outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 sm:pr-2"
      >
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700"
        >
          {initiale}
        </span>
        <span className="hidden max-w-36 truncate sm:block">{email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-64">
        <DropdownMenuLabel className="break-all font-normal">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/espace/parametres" className="cursor-pointer">
            <Settings aria-hidden />
            Paramètres
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut aria-hidden />
              Se déconnecter
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
