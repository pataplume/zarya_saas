"use client";

// Écran /parametres/echeances — UI catalogue calendar.template_echeance
// (RUN 7). Table listant globaux (lecture seule) + templates du cabinet
// (Modifier/Désactiver). Bouton "+ Nouveau template" réservé responsable.
// Conventions reprises de conformite-client.tsx / integrations-client.tsx :
// Dialog Radix, toast sonner, helpAttrs (mode guide), champs listes en texte
// séparé par virgules (pattern parseTags de clients/actions.ts).
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { helpAttrs } from "@/lib/help-attrs";
import { libelleTypeEcheance } from "@/lib/libelles";
import {
  creerTemplateEcheanceAction,
  desactiverTemplateEcheanceAction,
  modifierTemplateEcheanceAction,
  type TemplateEcheanceActionState,
} from "./actions";

const TYPES_ECHEANCE = [
  "fiscale",
  "tva",
  "bouclement",
  "salaire",
  "relance_documents",
  "personnalisee",
] as const;

const FREQUENCES = [
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
  "ponctuelle",
  "evenement",
] as const;

const FREQUENCE_LABELS: Record<(typeof FREQUENCES)[number], string> = {
  mensuelle: "Mensuelle",
  trimestrielle: "Trimestrielle",
  semestrielle: "Semestrielle",
  annuelle: "Annuelle",
  ponctuelle: "Ponctuelle",
  evenement: "Événement",
};

export interface TemplateEcheanceRow {
  id: string;
  cabinet_id: string | null;
  nom: string;
  type_echeance: string;
  frequence: string;
  service_requis: string[] | null;
  canton_specifique: string[] | null;
  regime_tva: string[] | null;
  jour_du_mois: number | null;
  mois_dans_annee: number[] | null;
  date_specifique: string | null;
  delai_alerte_jours: number;
  jours_entre_relances: number;
  max_relances_auto: number;
  documents_requis_types: string[] | null;
  description: string | null;
  actif: boolean;
  isGlobal: boolean;
}

function formatListe(items: string[] | number[] | null): string {
  if (!items || items.length === 0) return "—";
  return items.join(", ");
}

export function EcheancesClient({
  templates,
  isResponsable,
}: {
  templates: TemplateEcheanceRow[];
  isResponsable: boolean;
}) {
  const [creerOuvert, setCreerOuvert] = useState(false);
  const [modifierCible, setModifierCible] = useState<TemplateEcheanceRow | null>(null);
  const [desactiverCible, setDesactiverCible] = useState<TemplateEcheanceRow | null>(null);

  return (
    <div className="mt-6 space-y-4">
      {isResponsable && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => setCreerOuvert(true)}
            {...helpAttrs(
              "Nouveau modèle d'échéance",
              "Crée un modèle de génération d'échéance propre à votre cabinet (fréquence, alertes, relances). Le catalogue fédéral ZARYA reste inchangé.",
            )}
          >
            + Nouveau template
          </Button>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Aucun modèle d'échéance.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Fréquence</TableHead>
              <TableHead>Alerte (j)</TableHead>
              <TableHead>Relances</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-slate-900">{t.nom}</TableCell>
                <TableCell>{libelleTypeEcheance(t.type_echeance)}</TableCell>
                <TableCell>
                  {FREQUENCE_LABELS[t.frequence as (typeof FREQUENCES)[number]] ?? t.frequence}
                </TableCell>
                <TableCell>{t.delai_alerte_jours}</TableCell>
                <TableCell>
                  {t.max_relances_auto} max · tous les {t.jours_entre_relances}j
                </TableCell>
                <TableCell>
                  <Badge famille={t.isGlobal ? "neutre" : "info"}>
                    {t.isGlobal ? "ZARYA (global)" : "Personnalisé"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge famille={t.actif ? "succes" : "termine"}>
                    {t.actif ? "Actif" : "Désactivé"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {t.isGlobal ? (
                    <span className="text-xs text-slate-400">Référence fédérale</span>
                  ) : (
                    isResponsable && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setModifierCible(t)}
                          {...helpAttrs(
                            "Modifier le template",
                            "Modifie ce modèle d'échéance propre à votre cabinet (fréquence, alertes, relances, critères d'application).",
                          )}
                        >
                          Modifier
                        </Button>
                        {t.actif && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-1 text-red-600 hover:text-red-700"
                            onClick={() => setDesactiverCible(t)}
                            {...helpAttrs(
                              "Désactiver le template",
                              "Arrête la génération de nouvelles échéances à partir de ce modèle. Les échéances déjà générées ne sont pas affectées.",
                            )}
                          >
                            Désactiver
                          </Button>
                        )}
                      </>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {creerOuvert && <CreerDialog onClose={() => setCreerOuvert(false)} />}
      {modifierCible && (
        <ModifierDialog template={modifierCible} onClose={() => setModifierCible(null)} />
      )}
      {desactiverCible && (
        <DesactiverDialog template={desactiverCible} onClose={() => setDesactiverCible(null)} />
      )}
    </div>
  );
}

// ─── Formulaire commun (création + modification) ──────────────────────────────

function TemplateFormFields({ template }: { template?: TemplateEcheanceRow }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="nom">Nom</Label>
        <Input
          id="nom"
          name="nom"
          required
          maxLength={200}
          defaultValue={template?.nom}
          placeholder="Ex. TVA trimestrielle — régime effectif"
        />
      </div>

      <div>
        <Label htmlFor="type_echeance">Type d'échéance</Label>
        <Select id="type_echeance" name="type_echeance" defaultValue={template?.type_echeance}>
          {TYPES_ECHEANCE.map((type) => (
            <option key={type} value={type}>
              {libelleTypeEcheance(type)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="frequence">Fréquence</Label>
        <Select id="frequence" name="frequence" defaultValue={template?.frequence}>
          {FREQUENCES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCE_LABELS[f]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="jour_du_mois">Jour du mois (1-31)</Label>
        <Input
          id="jour_du_mois"
          name="jour_du_mois"
          type="number"
          min={1}
          max={31}
          defaultValue={template?.jour_du_mois ?? undefined}
        />
      </div>

      <div>
        <Label htmlFor="mois_dans_annee">Mois dans l'année (1-12, séparés par virgule)</Label>
        <Input
          id="mois_dans_annee"
          name="mois_dans_annee"
          defaultValue={formatListe(template?.mois_dans_annee ?? null).replace("—", "")}
          placeholder="Ex. 3, 6, 9, 12"
        />
      </div>

      <div>
        <Label htmlFor="date_specifique">Date spécifique</Label>
        <Input
          id="date_specifique"
          name="date_specifique"
          type="date"
          defaultValue={template?.date_specifique ?? undefined}
        />
      </div>

      <div>
        <Label htmlFor="delai_alerte_jours">Délai d'alerte (jours)</Label>
        <Input
          id="delai_alerte_jours"
          name="delai_alerte_jours"
          type="number"
          min={0}
          max={365}
          required
          defaultValue={template?.delai_alerte_jours ?? 7}
        />
      </div>

      <div>
        <Label htmlFor="jours_entre_relances">Jours entre relances</Label>
        <Input
          id="jours_entre_relances"
          name="jours_entre_relances"
          type="number"
          min={0}
          max={365}
          required
          defaultValue={template?.jours_entre_relances ?? 3}
        />
      </div>

      <div>
        <Label htmlFor="max_relances_auto">Nombre max de relances auto</Label>
        <Input
          id="max_relances_auto"
          name="max_relances_auto"
          type="number"
          min={0}
          max={20}
          required
          defaultValue={template?.max_relances_auto ?? 3}
        />
      </div>

      <div>
        <Label htmlFor="service_requis">Services requis (séparés par virgule)</Label>
        <Input
          id="service_requis"
          name="service_requis"
          defaultValue={formatListe(template?.service_requis ?? null).replace("—", "")}
          placeholder="Ex. comptabilite, tva"
        />
      </div>

      <div>
        <Label htmlFor="canton_specifique">Cantons spécifiques (séparés par virgule)</Label>
        <Input
          id="canton_specifique"
          name="canton_specifique"
          defaultValue={formatListe(template?.canton_specifique ?? null).replace("—", "")}
          placeholder="Ex. GE, VD"
        />
      </div>

      <div>
        <Label htmlFor="regime_tva">Régimes TVA (séparés par virgule)</Label>
        <Input
          id="regime_tva"
          name="regime_tva"
          defaultValue={formatListe(template?.regime_tva ?? null).replace("—", "")}
          placeholder="Ex. effectif, forfaitaire"
        />
      </div>

      <div>
        <Label htmlFor="documents_requis_types">Documents requis (séparés par virgule)</Label>
        <Input
          id="documents_requis_types"
          name="documents_requis_types"
          defaultValue={formatListe(template?.documents_requis_types ?? null).replace("—", "")}
          placeholder="Ex. releve_bancaire, grand_livre"
        />
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={template?.description ?? undefined}
          placeholder="Note interne sur ce modèle (optionnel)."
        />
      </div>
    </div>
  );
}

function CreerDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<TemplateEcheanceActionState, FormData>(
    creerTemplateEcheanceAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Modèle d'échéance créé.");
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau modèle d'échéance</DialogTitle>
          <DialogDescription>
            Ce modèle sera propre à votre cabinet et s'ajoutera au catalogue fédéral ZARYA (ou le
            complètera pour ce type d'échéance).
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <TemplateFormFields />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer le template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModifierDialog({
  template,
  onClose,
}: {
  template: TemplateEcheanceRow;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateEcheanceActionState, FormData>(
    modifierTemplateEcheanceAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Modèle d'échéance modifié.");
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier le modèle « {template.nom} »</DialogTitle>
          <DialogDescription>
            Les échéances déjà générées ne sont pas rétroactivement modifiées.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={template.id} />
          <TemplateFormFields template={template} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DesactiverDialog({
  template,
  onClose,
}: {
  template: TemplateEcheanceRow;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateEcheanceActionState, FormData>(
    desactiverTemplateEcheanceAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Modèle d'échéance désactivé.");
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Désactiver « {template.nom} » ?</DialogTitle>
          <DialogDescription>
            Aucune nouvelle échéance ne sera générée à partir de ce modèle. Les échéances déjà
            créées restent inchangées. Vous pourrez le réactiver plus tard en le modifiant.
          </DialogDescription>
        </DialogHeader>
        <form action={action}>
          <input type="hidden" name="id" value={template.id} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Désactivation…" : "Désactiver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
