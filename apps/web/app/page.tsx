import { getCurrentUser } from "@zarya/auth";
import { CalendarClock, Cpu, FileText, MapPin, Receipt, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight text-slate-900">ZARYA</span>
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Se connecter
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Bêta sur invitation
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Le co-pilote opérationnel des fiduciaires suisses
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg">
            Documents classés par IA, échéances suivies, relances préparées, salaires validés en
            ligne par vos clients. L'IA propose, vous validez — vous gardez la main sur chaque
            mandat.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/demande-acces"
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
            >
              Demander un accès
            </Link>
            <Link
              href="/login"
              className="w-full rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 sm:w-auto"
            >
              Se connecter
            </Link>
          </div>
        </section>

        {/* Bénéfices */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Ce que ZARYA fait pour vous
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
              Un fil rouge : l'IA propose, vous validez. Rien n'est classé, envoyé ou exporté sans
              contrôle humain.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {BENEFICES.map((b) => (
                <div key={b.titre} className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <b.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{b.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Confiance */}
        <section className="border-t border-slate-200">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Pensé pour la Suisse
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {CONFIANCE.map((c) => (
                <div key={c.titre} className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <c.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">{c.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Envie de voir ZARYA sur vos mandats ?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              L'accès à la bêta se fait sur invitation. Laissez-nous vos coordonnées, notre équipe
              vous recontacte.
            </p>
            <Link
              href="/demande-acces"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Demander un accès
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6">
          <span>© ZARYA 2026</span>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/cgu" className="hover:text-slate-900">
              CGU
            </Link>
            <Link href="/confidentialite" className="hover:text-slate-900">
              Confidentialité
            </Link>
            <Link href="/login" className="hover:text-slate-900">
              Se connecter
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
