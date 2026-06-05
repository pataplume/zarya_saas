# LANDING-NOTES — page d'entrée (Run D1)

> Notes pour la page d'entrée publique de ZARYA. À compléter par le founder.
> Décision (05/06) : **pas de landing marketing** pour le MVP. Une page d'entrée sobre :
> **Login** + **Signup**, où **Signup = formulaire de demande de RDV** (accès sur invitation /
> démo, pas d'auto-inscription publique).

## Décidé
- Boutons : **Se connecter** (→ `/login`) et **Demander un accès / un RDV** (→ formulaire RDV).
- Le « signup » ne crée PAS de compte directement : il envoie une **demande de RDV/démo**.

## À préciser (founder) — déposer ici plus tard
- [ ] Destination exacte du formulaire RDV : Calendly / Typeform / formulaire interne (enregistre une
      `demande_acces` en base + notifie l'équipe) ?
- [ ] Champs du formulaire (nom, cabinet, email, taille du portefeuille, message…).
- [ ] Texte d'accroche (1–2 phrases) sur la page d'entrée.
- [ ] Logo / visuel éventuel.
- [ ] Faut-il garder le `/signup` actuel (création de cabinet self-service) ou le retirer / le
      réserver aux invités ? (aujourd'hui `/signup` crée un cabinet + onboarding.)

## Implémentation prévue (quand les détails seront là)
- Page `/` (ou `(marketing)`) : titre court + 2 CTA (Se connecter, Demander un accès).
- Route/écran formulaire RDV (selon choix ci-dessus).
- Pas de pricing, pas de hero marketing pour le MVP.
