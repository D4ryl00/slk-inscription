// Règles « pièces à rapporter au bureau », affichées par le formulaire selon la
// catégorie (mineur / majeur) et la discipline. Aucun fichier n'est uploadé :
// on informe seulement, et le bureau valide physiquement.
//
// On LIE les PDF officiels FFKarate plutôt que de figer les règles médicales
// (elles évoluent d'une saison à l'autre).

import { getOffer, offerIsContact } from './config.js';

export const DOC_LINKS = {
  // Annexe 1 : questionnaire de santé à remplir par le parent AVEC l'enfant.
  questionnaireMineur:
    'https://www.ffkarate.fr/wp-content/uploads/2024/08/Annexe-N%C2%B01-QUESTIONNAIRE-A-DESTINATION-DES-LICENCIES-MINEURS_vf_2.pdf',
  // Annexe 2 : attestation sur l'honneur, si TOUTES les réponses sont négatives.
  attestationMineur:
    'https://www.ffkarate.fr/wp-content/uploads/2024/08/ATTESTATION-SUR-LHONNEUR-SPORTIF-MINEUR_ANNEXE2_2023_2024_M_2.pdf',
  noteCertificatMedical:
    'https://www.ffkarate.fr/wp-content/uploads/2025/12/Note-dinformation-Certificat-medical-saison-2025-2026-2.pdf',
  formulairePeps:
    'https://www.vbsl.fr/document-download/689a021a3ac6e_FormulairePEPS.pdf',
};

/**
 * @param {object} params
 * @param {boolean} params.isMinor  adhérent mineur au moment de l'inscription
 * @param {string}  params.offerId  offre choisie (pour savoir si discipline de contact)
 * @param {{type?: string}} [params.aid] aide sélectionnée
 * @returns {{id:string, label:string, help?:string, link?:string, linkLabel?:string}[]}
 */
export function requiredDocuments({ isMinor, offerId, aid } = {}) {
  const offer = getOffer(offerId);
  const contact = offerIsContact(offer);
  const docs = [];

  if (isMinor) {
    docs.push({
      id: 'questionnaire-mineur',
      label: 'Questionnaire de santé du licencié mineur (Annexe 1)',
      help:
        'À remplir par le responsable légal <strong>avec l\'enfant</strong>. Ce questionnaire ' +
        'reste confidentiel et n\'est PAS à rapporter au bureau — il sert uniquement à savoir ' +
        'ce qu\'il faut fournir ci-dessous.',
      link: DOC_LINKS.questionnaireMineur,
      linkLabel: 'Questionnaire FFKarate (Annexe 1)',
    });
    docs.push({
      id: 'attestation-mineur',
      label: 'Si TOUTES les réponses sont négatives : attestation sur l\'honneur (Annexe 2)',
      help:
        'Le responsable légal la complète et la <strong>rapporte au bureau</strong>. ' +
        'Elle remplace le certificat médical.',
      link: DOC_LINKS.attestationMineur,
      linkLabel: 'Attestation sur l\'honneur FFKarate (Annexe 2)',
    });
    docs.push({
      id: 'certificat-mineur',
      label: 'Si au moins une réponse est positive : certificat médical',
      help:
        'Un certificat médical de non contre-indication à la pratique, établi par le médecin, ' +
        'est alors obligatoire (à la place de l\'attestation sur l\'honneur).',
      link: DOC_LINKS.noteCertificatMedical,
      linkLabel: 'Note FFKarate 2025-2026',
    });
  } else {
    docs.push({
      id: 'certificat-medical',
      label: 'Certificat médical de non contre-indication',
      help:
        'Obligatoire pour les majeurs. <strong>Obligatoire pour tous les compétiteurs</strong> : ' +
        'le certificat doit alors mentionner explicitement la pratique <strong>en compétition</strong>.',
      link: DOC_LINKS.noteCertificatMedical,
      linkLabel: 'Note FFKarate 2025-2026',
    });
    if (contact) {
      docs.push({
        id: 'ko',
        label: 'Si vous souhaitez combattre au KO — pièces supplémentaires',
        help:
          'En plus du certificat, pour les combats avec KO autorisé :' +
          '<ul>' +
          '<li>Certificat médical de non contre-indication aux sports de combat <strong>avec KO autorisé</strong> — valable 1 an ;</li>' +
          '<li>Examen clinique avec <strong>électrocardiogramme de repos</strong> (avec interprétation) — valable 3 ans ;</li>' +
          '<li>Examen <strong>ophtalmologique</strong> : acuité visuelle, champ visuel, tonus oculaire et fond d\'œil — valable 3 ans.</li>' +
          '</ul>',
        link: DOC_LINKS.noteCertificatMedical,
        linkLabel: 'Note FFKarate 2025-2026',
      });
    }
  }

  if (aid?.type === 'peps') {
    docs.push({
      id: 'peps',
      label: 'Formulaire PEPS complété + pièces demandées',
      help:
        'Aucun code à saisir en ligne. Remplissez le formulaire PEPS et rapportez-le au bureau, ' +
        'accompagné des documents qui y sont demandés — le club en a besoin pour obtenir le remboursement de l\'aide.',
      link: DOC_LINKS.formulairePeps,
      linkLabel: 'Formulaire PEPS',
    });
  }
  if (aid?.type === 'passsport') {
    docs.push({
      id: 'passsport',
      label: 'Justificatif Pass\'Sport (courrier/code officiel)',
      help: 'À rapporter au bureau pour permettre au club de percevoir l\'aide.',
    });
  }

  return docs;
}

/**
 * Détermine si l'adhérent est mineur à partir d'une date de naissance (AAAA-MM-JJ).
 * `refDate` = date de référence (par défaut aujourd'hui).
 */
export function isMinorFromBirthdate(birthdate, refDate = new Date()) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  let age = refDate.getFullYear() - b.getFullYear();
  const m = refDate.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < b.getDate())) age--;
  return age < 18;
}
