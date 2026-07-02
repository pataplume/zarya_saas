import { getCurrentUser } from "@zarya/auth";
import { CalendarClock, Cpu, FileText, MapPin, Receipt, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "ZARYA — Co-pilote des fiduciaires suisses",
  description:
    "ZARYA classe les documents de vos mandats, suit les échéances, prépare les relances et fait valider les salaires par vos clients. L'IA propose, vous validez.",
};

const BENEFICES = [
  {
    icon: FileText,
    titre: "Documents",
    description:
      "Vos clients déposent leurs pièces en ligne ou par email. L'IA les classe par mandat et par type — vous validez en 1 clic.",
  },
  {
    icon: CalendarClock,
    titre: "Échéances & relances",
    description:
      "Les échéances sont générées par mandat (TVA, impôts, salaires…). Les relances arrivent en brouillon : rien ne part sans votre validation.",
  },
  {
    icon: Receipt,
    titre: "Factures",
    description:
      "QR-facture décodée, données extraites par IA avec provenance par champ. Vous contrôlez, puis exportez vers votre comptabilité.",
  },
  {
    icon: Wallet,
    titre: "Salaires",
    description:
      "Votre client saisit et valide les variables du mois dans son espace. Vous récupérez des données propres, prêtes à exporter.",
  },
] as const;

const CONFIANCE = [
  {
    icon: MapPin,
    titre: "Données hébergées en Suisse",
    description: "Vos données au repos sont stockées à Zurich, chez un hébergeur certifié.",
  },
  {
    icon: Cpu,
    titre: "IA souveraine suisse",
    description:
      "Les traitements IA passent par Infomaniak AI Services — société et infrastructure suisses.",
  },
  {
    icon: ShieldCheck,
    titre: "nLPD & RGPD",
    description:
      "Chiffrement des données sensibles, journal d'audit complet, validation humaine systématique.",
  },
] as const;

// Page d'entrée publique : landing sobre + Se connecter / Demander un accès
// (pas de signup public ; l'accès se fait sur demande / invitation).
export default async function HomePage() {
  // Un utilisateur déjà connecté est renvoyé vers son espace de travail.
  const user = await getCurrentUser();
  if (user?.app_metadata.cabinet_id) {
    redirect(user.app_metadata.role === "client_contact" ? "/espace" : "/app");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Wordmark — identique à la sidebar */}
          <span className="flex items-center gap-2">
            <span
              className="flex size-6 items-center justify-center rounded bg-blue-600 text-[11px] font-bold text-white"
              aria-hidden
            >
              Z
            </span>
            <span className="text-sm font-semibold tracking-[0.14em] text-foreground">ZARYA</span>
          </span>
          <Button asChild variant="ghost">
            <Link href="/login">Se connecter</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            Bêta sur invitation
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Le co-pilote opérationnel des fiduciaires suisses
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg">
            Documents classés par IA, échéances suivies, relances préparées, salaires validés en
            ligne par vos clients. L'IA propose, vous validez — vous gardez la main sur chaque
            mandat.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 w-full px-6 sm:w-auto">
              <Link href="/demande-acces">Demander un accès</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="h-11 w-full px-6 sm:w-auto">
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
        </section>

        {/* Bénéfices */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Ce que ZARYA fait pour vous
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
              Un fil rouge : l'IA propose, vous validez. Rien n'est classé, envoyé ou exporté sans
              contrôle humain.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {BENEFICES.map((b) => (
                <Card key={b.titre} className="p-6">
                  <div className="flex size-8 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                    <b.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                    {b.titre}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Confiance */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Pensé pour la Suisse
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {CONFIANCE.map((c) => (
                <div key={c.titre} className="text-center">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                    <c.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{c.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Envie de voir ZARYA sur vos mandats ?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              L'accès à la bêta se fait sur invitation. Laissez-nous vos coordonnées, notre équipe
              vous recontacte.
            </p>
            <Button asChild size="lg" className="mt-6 h-11 px-6">
              <Link href="/demande-acces">Demander un accès</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>© ZARYA 2026</span>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/cgu" className="transition-colors hover:text-foreground">
              CGU
            </Link>
            <Link href="/confidentialite" className="transition-colors hover:text-foreground">
              Confidentialité
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Se connecter
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
