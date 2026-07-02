"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRANDING_DEFAUT } from "@/lib/client-space";
import { type SauvegarderBrandingState, sauvegarderBrandingAction } from "./actions";

const HEX = /^#[0-9a-fA-F]{6}$/;

type BrandingData = {
  logo_url: string | null;
  couleur_primaire: string | null;
  couleur_secondaire: string | null;
};

type Props = {
  raisonSociale: string;
  branding: BrandingData;
  isResponsable: boolean;
};

/** Sélecteur de couleur + champ hex synchronisés (le champ texte porte le `name` soumis). */
function ChampCouleur({
  label,
  name,
  value,
  onChange,
  defaut,
  disabled,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  defaut: string;
  disabled?: boolean | undefined;
  error?: string | undefined;
}) {
  // <input type="color"> n'accepte qu'un hex #RRGGBB valide — repli sur le défaut ZARYA sinon.
  const pickerValue = HEX.test(value) ? value : defaut;
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} — sélecteur`}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaut}
          disabled={disabled}
          maxLength={7}
          className="w-32 font-mono"
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">Vide = couleur ZARYA par défaut ({defaut})</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function BrandingClient({ raisonSociale, branding, isResponsable }: Props) {
  const [state, formAction, isPending] = useActionState<SauvegarderBrandingState, FormData>(
    sauvegarderBrandingAction,
    {},
  );

  const [primaire, setPrimaire] = useState(branding.couleur_primaire ?? "");
  const [secondaire, setSecondaire] = useState(branding.couleur_secondaire ?? "");
  const [logoUrl, setLogoUrl] = useState(branding.logo_url ?? "");

  useEffect(() => {
    if (state.success) toast.success("Branding enregistré");
  }, [state]);

  // Aperçu : même logique de fallback que resolveBranding (lib/client-space.ts) —
  // trim, vide → défauts ZARYA ; logo affiché seulement si l'URL https est valide.
  const clean = (v: string) => {
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  const apercuPrimaire = clean(primaire) ?? BRANDING_DEFAUT.couleurPrimaire;
  const apercuSecondaire = clean(secondaire) ?? BRANDING_DEFAUT.couleurSecondaire;
  const apercuLogo = clean(logoUrl);
  const logoValide =
    apercuLogo !== null &&
    (() => {
      try {
        return new URL(apercuLogo).protocol === "https:";
      } catch {
        return false;
      }
    })();

  return (
    <Card>
      <form action={formAction}>
        <CardHeader>
          <CardTitle className="uppercase tracking-wide text-slate-500">
            Personnalisation du portail client
          </CardTitle>
          <CardDescription>
            Ces réglages s'appliquent à l'espace client /espace de vos clients PME.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ChampCouleur
              label="Couleur principale"
              name="couleur_primaire"
              value={primaire}
              onChange={setPrimaire}
              defaut={BRANDING_DEFAUT.couleurPrimaire}
              disabled={!isResponsable}
              error={state.fieldErrors?.couleur_primaire}
            />
            <ChampCouleur
              label="Couleur secondaire"
              name="couleur_secondaire"
              value={secondaire}
              onChange={setSecondaire}
              defaut={BRANDING_DEFAUT.couleurSecondaire}
              disabled={!isResponsable}
              error={state.fieldErrors?.couleur_secondaire}
            />
            <div className="sm:col-span-2">
              <Label htmlFor="logo_url">URL du logo</Label>
              <Input
                id="logo_url"
                name="logo_url"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://cabinet.ch/logo.png"
                disabled={!isResponsable}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-400">
                https:// uniquement. Vide = nom du cabinet affiché à la place du logo.
              </p>
              {state.fieldErrors?.logo_url && (
                <p className="mt-1 text-xs text-red-600">{state.fieldErrors.logo_url}</p>
              )}
            </div>
          </div>

          {/* ── Aperçu live du header du portail client ─────────────────────── */}
          <div>
            <p className="mb-1 text-sm font-medium text-secondary-foreground">Aperçu</p>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
                <div className="flex items-center gap-3">
                  {logoValide && apercuLogo ? (
                    // biome-ignore lint/performance/noImgElement: aperçu d'un logo externe, pas d'optimisation Next requise.
                    <img src={apercuLogo} alt={raisonSociale} className="h-8 w-auto" />
                  ) : (
                    <span className="font-semibold" style={{ color: apercuPrimaire }}>
                      {raisonSociale}
                    </span>
                  )}
                  <span className="text-sm text-slate-500">· Votre client PME</span>
                </div>
                <span className="text-sm text-slate-400">contact@client.ch</span>
              </div>
              <div className="flex gap-4 bg-white px-4 py-2 text-sm">
                <span className="font-medium" style={{ color: apercuPrimaire }}>
                  Accueil
                </span>
                <span style={{ color: apercuSecondaire }}>Documents</span>
                <span style={{ color: apercuSecondaire }}>Validations</span>
              </div>
            </div>
          </div>

          {isResponsable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Enregistrement…" : "Enregistrer le branding"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="reset"
                variant="secondary"
                disabled={isPending}
                onClick={() => {
                  setPrimaire("");
                  setSecondaire("");
                  setLogoUrl("");
                }}
              >
                Réinitialiser aux couleurs ZARYA
              </Button>
              {state.error && !state.fieldErrors && (
                <p className="text-sm text-red-600">{state.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </form>
    </Card>
  );
}
