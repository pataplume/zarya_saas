// CONTENU PROVISOIRE — validation juridique requise avant bêta (cf. PLAN-MVP-BETA DPA/CGU).
// Les marqueurs [à compléter] signalent les points nécessitant une décision founder/juriste.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — ZARYA",
  description:
    "Conditions générales d'utilisation de ZARYA, copilote opérationnel pour fiduciaires suisses.",
};

export default function CguPage() {
  return (
    <>
      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="mt-2 text-xs text-gray-400">
        Version du 2 juillet 2026 — projet en cours de validation. Ce document est provisoire et
        sera finalisé avec un conseil juridique avant l&apos;ouverture commerciale du service.
      </p>

      <h2>1. Objet</h2>
      <p>
        Les présentes conditions générales d&apos;utilisation (les « CGU ») régissent l&apos;accès
        et l&apos;utilisation de la plateforme ZARYA (le « Service »), un logiciel en tant que
        service (SaaS) édité par [Condere / raison sociale et siège à compléter] (l&apos;« Éditeur
        »). ZARYA est un copilote opérationnel destiné aux fiduciaires suisses pour la gestion
        documentaire, le suivi des échéances, le traitement des factures et le workflow salaires de
        leurs clients PME.
      </p>
      <p>
        En créant un compte ou en utilisant le Service, le cabinet utilisateur accepte les présentes
        CGU sans réserve.
      </p>

      <h2>2. Définitions</h2>
      <ul>
        <li>
          <strong>« Cabinet »</strong> : la fiduciaire ou société de services comptables cliente de
          l&apos;Éditeur, titulaire d&apos;un compte sur le Service.
        </li>
        <li>
          <strong>« Utilisateur »</strong> : toute personne physique autorisée par le Cabinet à
          accéder au Service (responsable, collaborateur, gestionnaire de salaires, lecteur).
        </li>
        <li>
          <strong>« Client final »</strong> : l&apos;entreprise cliente du Cabinet dont les données
          sont traitées dans le Service, y compris ses contacts disposant d&apos;un accès au portail
          client.
        </li>
        <li>
          <strong>« Données confiées »</strong> : l&apos;ensemble des données, documents et contenus
          que le Cabinet ou ses Clients finaux chargent ou saisissent dans le Service.
        </li>
        <li>
          <strong>« Portail client »</strong> : l&apos;espace dédié permettant aux Clients finaux du
          Cabinet de consulter et transmettre des informations.
        </li>
      </ul>

      <h2>3. Compte et accès</h2>
      <p>
        L&apos;accès au Service nécessite la création d&apos;un compte par un représentant autorisé
        du Cabinet. Le Cabinet garantit l&apos;exactitude des informations fournies lors de
        l&apos;inscription et s&apos;engage à les maintenir à jour.
      </p>
      <p>
        Les identifiants de connexion sont strictement personnels. Le Cabinet est responsable de la
        confidentialité des identifiants de ses Utilisateurs et de toute activité réalisée depuis
        leurs comptes. Le Cabinet notifie sans délai l&apos;Éditeur de toute utilisation non
        autorisée ou compromission suspectée d&apos;un compte.
      </p>
      <p>
        Le Cabinet administre lui-même les rôles et droits d&apos;accès de ses Utilisateurs et des
        contacts de ses Clients finaux, sous sa seule responsabilité.
      </p>

      <h2>4. Services fournis</h2>
      <p>Le Service comprend notamment, selon la formule souscrite :</p>
      <ul>
        <li>la gestion documentaire avec classement assisté par intelligence artificielle ;</li>
        <li>le suivi des échéances et la génération de relances ;</li>
        <li>le traitement des factures (lecture de QR-factures suisses, extraction assistée) ;</li>
        <li>le workflow de gestion des salaires (hors calcul de paie) ;</li>
        <li>un portail dédié aux Clients finaux du Cabinet ;</li>
        <li>
          en option, l&apos;intégration avec la messagerie Microsoft 365 du Cabinet, si celui-ci la
          connecte.
        </li>
      </ul>
      <p>
        Les fonctions d&apos;intelligence artificielle du Service émettent des{" "}
        <strong>propositions</strong> (classement, extraction de champs, rapprochements) qui sont
        soumises à la validation humaine des Utilisateurs. Le Cabinet demeure seul responsable de la
        validation, de l&apos;exactitude et de l&apos;usage professionnel des résultats. Le Service
        ne fournit aucun conseil comptable, fiscal ou juridique.
      </p>

      <h2>5. Obligations du cabinet utilisateur</h2>
      <p>Le Cabinet s&apos;engage à :</p>
      <ul>
        <li>utiliser le Service conformément aux lois applicables et aux présentes CGU ;</li>
        <li>
          disposer des droits et autorisations nécessaires sur les Données confiées, y compris
          vis-à-vis de ses Clients finaux et des personnes concernées ;
        </li>
        <li>
          informer ses Clients finaux du recours au Service et recueillir, le cas échéant, les
          consentements requis ;
        </li>
        <li>
          ne pas tenter de contourner les mesures de sécurité, d&apos;accéder aux données
          d&apos;autres cabinets, ni de perturber le fonctionnement du Service ;
        </li>
        <li>
          ne pas charger de contenus illicites, malveillants ou portant atteinte aux droits de tiers
          ;
        </li>
        <li>
          s&apos;acquitter des frais d&apos;abonnement convenus [conditions tarifaires à compléter].
        </li>
      </ul>

      <h2>6. Données confiées et sous-traitance</h2>
      <p>
        Le Cabinet demeure maître et responsable des Données confiées. Pour les données personnelles
        traitées via le Service, le Cabinet (ou son Client final, selon le cas) agit en qualité de
        responsable du traitement et l&apos;Éditeur en qualité de <strong>sous-traitant</strong> au
        sens de la loi fédérale suisse sur la protection des données (nLPD) et, le cas échéant, du
        RGPD.
      </p>
      <p>
        Les modalités de ce traitement (instructions, mesures de sécurité, sous-traitants
        ultérieurs, assistance) sont détaillées dans un accord de traitement des données (DPA) [DPA
        à établir — à compléter] et dans la{" "}
        <a href="/confidentialite">politique de confidentialité</a>.
      </p>
      <p>
        Les données au repos sont hébergées en Suisse (Zurich) ; certains traitements
        s&apos;exécutent dans l&apos;Union européenne (Francfort). Aucune donnée n&apos;est stockée
        ou traitée hors de Suisse ou de l&apos;UE.
      </p>
      <p>
        À la résiliation, le Cabinet peut exporter ses données pendant une période de [durée à
        compléter], après quoi elles sont supprimées, sous réserve des obligations légales de
        conservation.
      </p>

      <h2>7. Propriété intellectuelle</h2>
      <p>
        Le Service, sa structure, son code, ses interfaces, ses marques et sa documentation
        demeurent la propriété exclusive de l&apos;Éditeur ou de ses concédants. L&apos;abonnement
        confère au Cabinet un droit d&apos;utilisation personnel, non exclusif, non cessible et
        limité à la durée du contrat.
      </p>
      <p>
        Les Données confiées demeurent la propriété du Cabinet ou de ses Clients finaux.
        L&apos;Éditeur n&apos;acquiert aucun droit sur celles-ci au-delà de ce qui est strictement
        nécessaire à la fourniture du Service. Les Données confiées ne sont pas utilisées pour
        entraîner des modèles d&apos;intelligence artificielle.
      </p>

      <h2>8. Disponibilité et support</h2>
      <p>
        L&apos;Éditeur met en œuvre des moyens raisonnables pour assurer la disponibilité du
        Service, sans garantie d&apos;absence d&apos;interruption. Des maintenances planifiées
        peuvent entraîner des indisponibilités temporaires ; l&apos;Éditeur s&apos;efforce d&apos;en
        informer le Cabinet à l&apos;avance. [Niveaux de service et engagements de support éventuels
        à compléter.]
      </p>
      <p>
        Le support est accessible par [canal et horaires de support à compléter]. Pendant la phase
        bêta, le Service est fourni « en l&apos;état » et peut évoluer sans préavis.
      </p>

      <h2>9. Responsabilité</h2>
      <p>
        L&apos;Éditeur est responsable des dommages directs prouvés causés par une faute qui lui est
        imputable, dans les limites admises par le droit suisse. Sont exclus, dans la mesure permise
        par la loi, les dommages indirects ou consécutifs (perte de profit, perte de données non
        imputable à l&apos;Éditeur, atteinte à la réputation). [Plafond de responsabilité à
        compléter.]
      </p>
      <p>
        La responsabilité pour dol ou faute grave, ainsi que pour les dommages corporels, demeure
        réservée conformément au droit impératif.
      </p>
      <p>
        Le Cabinet demeure seul responsable de ses obligations professionnelles envers ses Clients
        finaux, y compris de la vérification des résultats produits avec l&apos;aide du Service.
      </p>

      <h2>10. Résiliation</h2>
      <p>
        Le contrat est conclu pour la durée prévue lors de la souscription [durées et modalités de
        renouvellement à compléter]. Chaque partie peut résilier moyennant un préavis de [préavis à
        compléter].
      </p>
      <p>
        L&apos;Éditeur peut suspendre ou résilier l&apos;accès en cas de violation grave des
        présentes CGU, de défaut de paiement persistant ou d&apos;usage compromettant la sécurité du
        Service, après mise en demeure restée sans effet sauf urgence.
      </p>
      <p>
        La résiliation ne dispense pas des obligations de restitution et de suppression des données
        prévues à l&apos;article 6.
      </p>

      <h2>11. Droit applicable et for</h2>
      <p>
        Les présentes CGU sont soumises au <strong>droit suisse</strong>, à l&apos;exclusion des
        règles de conflit de lois et de la Convention de Vienne sur la vente internationale de
        marchandises.
      </p>
      <p>
        Tout litige relatif aux présentes CGU relève de la compétence exclusive des tribunaux de
        [for juridique à compléter], Suisse, sous réserve des fors impératifs.
      </p>

      <p className="mt-10 text-xs text-gray-400">
        Document provisoire — les mentions [à compléter] seront arrêtées avec un conseil juridique
        avant l&apos;ouverture du service. Pour toute question : [email de contact à compléter].
      </p>
    </>
  );
}
