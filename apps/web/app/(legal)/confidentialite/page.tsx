// CONTENU PROVISOIRE — validation juridique requise avant bêta (cf. PLAN-MVP-BETA DPA/CGU).
// Les marqueurs [à compléter] signalent les points nécessitant une décision founder/juriste.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — ZARYA",
  description:
    "Politique de confidentialité de ZARYA : données traitées, sous-traitants, résidence des données en Suisse/UE, droits nLPD et RGPD.",
};

export default function ConfidentialitePage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p className="mt-2 text-xs text-gray-400">
        Version du 2 juillet 2026 — projet en cours de validation. Ce document est provisoire et
        sera finalisé avec un conseil juridique avant l&apos;ouverture commerciale du service.
      </p>

      <p>
        La présente politique décrit comment la plateforme ZARYA (le « Service ») traite les données
        personnelles, conformément à la loi fédérale suisse sur la protection des données (nLPD) et,
        lorsque celui-ci s&apos;applique, au Règlement général sur la protection des données de
        l&apos;UE (RGPD).
      </p>

      <h2>1. Responsable du traitement et rôles</h2>
      <p>
        L&apos;éditeur du Service est CONDERE, société en cours de création, 1207 Genève, Suisse
        (contact : contact@condere.ch). Ces mentions seront complétées (forme juridique, IDE) dès
        l&apos;inscription au registre du commerce.
      </p>
      <p>Deux situations sont à distinguer :</p>
      <ul>
        <li>
          <strong>Données des comptes cabinet</strong> (identité et coordonnées des utilisateurs,
          données de facturation, journaux de connexion) : l&apos;éditeur agit en qualité de{" "}
          <strong>responsable du traitement</strong>.
        </li>
        <li>
          <strong>Données confiées par les cabinets</strong> (documents, factures, salaires et
          données de leurs clients PME) : le cabinet fiduciaire est responsable du traitement et
          l&apos;éditeur agit en qualité de <strong>sous-traitant</strong>, sur instruction du
          cabinet. Un accord de traitement des données (DPA) encadre cette relation [DPA à établir —
          à compléter].
        </li>
      </ul>

      <h2>2. Catégories de données traitées</h2>
      <ul>
        <li>
          <strong>Données de compte</strong> : nom, prénom, adresse email professionnelle, rôle, mot
          de passe (haché), préférences.
        </li>
        <li>
          <strong>Données des clients finaux des cabinets</strong> : identité des entreprises et de
          leurs contacts, documents comptables et administratifs, factures (y compris coordonnées
          bancaires figurant sur les QR-factures), données du workflow salaires (y compris, le cas
          échéant, numéro AVS et IBAN des employés).
        </li>
        <li>
          <strong>Données d&apos;intégration email</strong> (uniquement si le cabinet connecte sa
          messagerie Microsoft 365) : jetons d&apos;accès OAuth, métadonnées et contenus des emails
          traités via le Service.
        </li>
        <li>
          <strong>Données techniques et d&apos;audit</strong> : journaux de connexion et
          d&apos;actions sensibles, adresses IP, identifiants de session.
        </li>
      </ul>
      <p>
        Les champs particulièrement sensibles (IBAN, numéro AVS, jetons OAuth, identifiants
        d&apos;API) sont chiffrés au repos dans un coffre-fort dédié, en complément du chiffrement
        de l&apos;infrastructure.
      </p>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li>fournir le Service : gestion documentaire, échéances, factures, salaires ;</li>
        <li>
          assister les utilisateurs par des propositions d&apos;intelligence artificielle
          (classement de documents, extraction de champs), toujours soumises à validation humaine ;
        </li>
        <li>permettre l&apos;envoi de relances et d&apos;emails si le cabinet l&apos;active ;</li>
        <li>assurer la sécurité, la traçabilité (journal d&apos;audit) et le support ;</li>
        <li>gérer la relation contractuelle et la facturation avec les cabinets ;</li>
        <li>respecter les obligations légales de l&apos;éditeur.</li>
      </ul>
      <p>
        Les données confiées ne sont <strong>pas</strong> utilisées pour entraîner des modèles
        d&apos;intelligence artificielle, ni vendues ou louées à des tiers.
      </p>

      <h2>4. Base légale</h2>
      <ul>
        <li>
          <strong>Exécution du contrat</strong> : fourniture du Service au cabinet abonné (art. 6
          par. 1 let. b RGPD lorsque celui-ci s&apos;applique).
        </li>
        <li>
          <strong>Instructions du responsable du traitement</strong> : pour les données confiées,
          l&apos;éditeur traite en qualité de sous-traitant sur la base du DPA conclu avec le
          cabinet.
        </li>
        <li>
          <strong>Intérêt légitime</strong> : sécurité du Service, prévention des abus, amélioration
          du produit sur la base de données techniques.
        </li>
        <li>
          <strong>Obligation légale</strong> : conservation de certaines données (audit, pièces
          comptables) imposée par le droit applicable.
        </li>
      </ul>

      <h2>5. Sous-traitants et destinataires</h2>
      <p>
        L&apos;éditeur fait appel aux sous-traitants suivants, chacun lié par des engagements
        contractuels de protection des données :
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — hébergement de la base de données, de l&apos;authentification
          et du stockage de fichiers. Données au repos en{" "}
          <strong>Suisse (Zurich, région eu-central-2)</strong>.
        </li>
        <li>
          <strong>Vercel</strong> — hébergement applicatif et traitements planifiés (compute).
          Région <strong>Francfort, Union européenne (fra1)</strong>.
        </li>
        <li>
          <strong>Infomaniak</strong> — services d&apos;intelligence artificielle (classement,
          extraction, recherche sémantique). Société et infrastructure situées en{" "}
          <strong>Suisse</strong>.
        </li>
        <li>
          <strong>Microsoft</strong> — intégration de messagerie (Microsoft 365 / Graph),{" "}
          <strong>uniquement si le cabinet connecte lui-même sa messagerie</strong>. Le traitement
          est alors régi également par le contrat liant le cabinet à Microsoft.
        </li>
      </ul>
      <p>
        Aucun autre destinataire n&apos;a accès aux données confiées, hormis les autorités
        lorsqu&apos;une obligation légale l&apos;impose.
      </p>

      <h2>6. Résidence des données et transferts</h2>
      <p>
        Les données au repos sont hébergées en <strong>Suisse (Zurich)</strong>. Certains
        traitements applicatifs s&apos;exécutent dans l&apos;
        <strong>Union européenne (Francfort)</strong>. La couche d&apos;intelligence artificielle
        est opérée en <strong>Suisse</strong> (Infomaniak).
      </p>
      <p>
        Aucune donnée n&apos;est stockée ou traitée en dehors de la Suisse et de l&apos;Union
        européenne. La Suisse est reconnue par l&apos;UE comme un pays tiers offrant un niveau de
        protection <strong>adéquat</strong> (décision d&apos;adéquation, RGPD art. 45) ;
        réciproquement, la Suisse reconnaît l&apos;adéquation des pays de l&apos;UE/EEE au sens de
        la nLPD.
      </p>

      <h2>7. Durées de conservation</h2>
      <ul>
        <li>
          <strong>Journaux d&apos;audit</strong> (actions sensibles, traçabilité) :{" "}
          <strong>6 ans minimum</strong>, en append-only (aucune modification ni suppression).
        </li>
        <li>
          <strong>Pièces comptables et documents assimilés</strong> : jusqu&apos;à{" "}
          <strong>10 ans</strong>, conformément aux obligations suisses de conservation des livres
          (CO art. 958f), selon les instructions du cabinet responsable du traitement.
        </li>
        <li>
          <strong>Données de compte</strong> : pendant la durée du contrat, puis suppression ou
          anonymisation dans un délai de [délai à compléter], sous réserve des obligations légales.
        </li>
        <li>
          <strong>Jetons d&apos;intégration</strong> (Microsoft) : supprimés à la déconnexion de
          l&apos;intégration par le cabinet.
        </li>
      </ul>

      <h2>8. Sécurité</h2>
      <p>
        L&apos;éditeur met en œuvre des mesures techniques et organisationnelles appropriées :
        chiffrement en transit et au repos, chiffrement renforcé des champs ultra-sensibles (IBAN,
        numéro AVS, jetons), cloisonnement strict des données par cabinet (isolation multi-tenant
        testée en continu), contrôle d&apos;accès par rôles, journal d&apos;audit inviolable et
        caviardage des données sensibles dans les journaux techniques.
      </p>

      <h2>9. Vos droits</h2>
      <p>
        Conformément à la nLPD et, le cas échéant, au RGPD, toute personne concernée dispose des
        droits suivants :
      </p>
      <ul>
        <li>
          <strong>Accès</strong> : obtenir la confirmation que des données la concernant sont
          traitées et en recevoir copie ;
        </li>
        <li>
          <strong>Rectification</strong> : faire corriger des données inexactes ;
        </li>
        <li>
          <strong>Effacement</strong> : demander la suppression des données, sous réserve des
          obligations légales de conservation ;
        </li>
        <li>
          <strong>Portabilité</strong> : recevoir ses données dans un format structuré et couramment
          utilisé — le portail client du Service propose notamment un <strong>export JSON</strong>{" "}
          des données ;
        </li>
        <li>
          <strong>Opposition et limitation</strong> : s&apos;opposer à certains traitements ou en
          demander la limitation, dans les cas prévus par la loi.
        </li>
      </ul>
      <p>
        Pour les données confiées par un cabinet fiduciaire, les demandes doivent être adressées en
        premier lieu au cabinet concerné (responsable du traitement) ; l&apos;éditeur lui apporte
        son assistance en qualité de sous-traitant.
      </p>
      <p>
        Toute personne concernée peut également saisir l&apos;autorité de contrôle compétente : en
        Suisse, le Préposé fédéral à la protection des données et à la transparence (PFPDT).
      </p>

      <h2>10. Contact</h2>
      <p>
        Pour toute question relative à la protection des données ou pour exercer vos droits :
        contact@condere.ch, ou par courrier : CONDERE, 1207 Genève, Suisse.
      </p>

      <p className="mt-10 text-xs text-gray-400">
        Document provisoire — les mentions [à compléter] seront arrêtées avec un conseil juridique
        avant l&apos;ouverture du service.
      </p>
    </>
  );
}
