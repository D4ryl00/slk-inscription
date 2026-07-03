// Règles « pièces à rapporter au bureau », affichées par le formulaire selon la
// catégorie (mineur / majeur) et la discipline. Aucun fichier n'est uploadé :
// on informe seulement, et le bureau valide physiquement.
//
// On LIE les PDF officiels FFKarate plutôt que de figer les règles médicales
// (elles évoluent d'une saison à l'autre).

import { getOffer, offerIsContact } from './config.js';

export const DOC_LINKS = {
  attestationMineur:
    'https://www.ffkarate.fr/wp-content/uploads/2024/08/Annexe-N%C2%B01-QUESTIONNAIRE-A-DESTINATION-DES-LICENCIES-MINEURS_vf_2.pdf',
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
      id: 'attestation-mineur',
      label: 'Attestation sur l\'honneur (responsable légal)',
      help:
        'Remplace le certificat médical pour les mineurs. Le questionnaire de santé, lui, ' +
        'reste à la maison (confidentiel) et n\'est PAS à rapporter.',
      link: DOC_LINKS.attestationMineur,
      linkLabel: 'Document FFKarate',
    });
  } else {
    docs.push({
      id: 'certificat-medical',
      label: 'Certificat médical de non contre-indication',
      help: 'Obligatoire pour les majeurs.',
      link: DOC_LINKS.noteCertificatMedical,
      linkLabel: 'Note FFKarate 2025-2026',
    });
    if (contact) {
      docs.push({
        id: 'fond-oeil-ecg',
        label: 'Fond d\'œil + électrocardiogramme (ECG)',
        help:
          'Exigés en plus pour les disciplines de contact (Shido-Boxing, Shido-Mix-Martial/MMA). ' +
          'Voir la note FFKarate pour les modalités.',
        link: DOC_LINKS.noteCertificatMedical,
        linkLabel: 'Note FFKarate 2025-2026',
      });
    }
  }

  if (aid?.type === 'peps') {
    docs.push({
      id: 'peps',
      label: 'Formulaire PEPS complété',
      help: 'À rapporter au bureau : le club en a besoin pour obtenir le remboursement de l\'aide.',
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
