"use client";

// Indicateur de force du mot de passe (signup + activation de compte).
// Barre 4 segments + symbole + libellé — jamais la couleur seule (a11y).
// Règles : longueur ≥ 12 requise, puis bonus longueur ≥ 16, mélange de casse,
// chiffres, symboles. État local uniquement, mise à jour au fil de la frappe.

type Niveau = {
  label: string;
  symbole: string;
  segments: number;
  barClass: string;
  textClass: string;
};

const TROP_COURT: Niveau = {
  label: "Trop court (12 caractères minimum)",
  symbole: "✕",
  segments: 1,
  barClass: "bg-rose-500",
  textClass: "text-rose-600",
};

const FAIBLE: Niveau = {
  label: "Faible",
  symbole: "!",
  segments: 2,
  barClass: "bg-amber-500",
  textClass: "text-amber-600",
};

const BON: Niveau = {
  label: "Bon",
  symbole: "✓",
  segments: 3,
  barClass: "bg-lime-500",
  textClass: "text-lime-600",
};

const FORT: Niveau = {
  label: "Fort",
  symbole: "✓✓",
  segments: 4,
  barClass: "bg-emerald-600",
  textClass: "text-emerald-700",
};

function evaluerNiveau(password: string): Niveau {
  if (password.length < 12) return TROP_COURT;
  let bonus = 0;
  if (password.length >= 16) bonus += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) bonus += 1;
  if (/\d/.test(password)) bonus += 1;
  if (/[^a-zA-Z0-9]/.test(password)) bonus += 1;
  if (bonus >= 4) return FORT;
  if (bonus >= 2) return BON;
  return FAIBLE;
}

export function PasswordStrength({ password }: { password: string }) {
  const niveau = evaluerNiveau(password);
  return (
    <div aria-live="polite" className="mt-2">
      {password.length > 0 && (
        <>
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i < niveau.segments ? niveau.barClass : "bg-border"
                }`}
              />
            ))}
          </div>
          <p className={`mt-1 text-xs font-medium ${niveau.textClass}`}>
            <span aria-hidden="true">{niveau.symbole} </span>
            Force : {niveau.label}
          </p>
        </>
      )}
    </div>
  );
}
