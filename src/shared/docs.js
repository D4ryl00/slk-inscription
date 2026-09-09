// "Documents to bring to the office" rules, shown by the form depending on the
// category (minor / adult) and the discipline. No file is uploaded: we only
// inform, and the office validates physically.
//
// We LINK the official FFKarate PDFs rather than hardcoding the medical rules
// (they change from one season to the next).

import { getOffer, normalizeAids, offerIsContact } from './config.js';

export const DOC_LINKS = {
  // Annex 1: health questionnaire to be filled in by the parent WITH the child.
  questionnaireMineur:
    'https://www.ffkarate.fr/wp-content/uploads/2024/08/Annexe-N%C2%B01-QUESTIONNAIRE-A-DESTINATION-DES-LICENCIES-MINEURS_vf_2.pdf',
  // Annex 2: sworn statement, if ALL answers are negative.
  attestationMineur:
    'https://www.ffkarate.fr/wp-content/uploads/2024/08/ATTESTATION-SUR-LHONNEUR-SPORTIF-MINEUR_ANNEXE2_2023_2024_M_2.pdf',
  noteCertificatMedical:
    'https://www.ffkarate.fr/wp-content/uploads/2025/12/Note-dinformation-Certificat-medical-saison-2025-2026-2.pdf',
  // Season-dated: the club publishes a new PEPS form every season.
  formulairePeps:
    'https://www.vbsl.fr/document-download/6a7f3adf190f4_FormulairePEPS20262027.pdf',
};

/**
 * The checklists of a minor and of an adult are mutually exclusive: minority is
 * a LEGAL fact, read at registration time, so it is what decides here — never
 * the tariff, which the club counts by civil year and which therefore turns
 * adult a few months earlier for anyone born late in the year.
 *
 * @param {object} params
 * @param {boolean} params.isMinor  member is a minor at registration time
 * @param {string}  params.offerId  chosen offer (to know if it's a contact discipline)
 * @param {'youth'|'adult'|null} [params.tariff] tariff band applied to the fee
 * @param {{type?: string}[]} [params.aids] selected aids (they cumulate); the
 *        pre-cumulation `params.aid` object is still accepted
 * @returns {{id:string, label:string, help?:string, link?:string, linkLabel?:string}[]}
 */
export function requiredDocuments({ isMinor, offerId, tariff, aids, aid } = {}) {
  const offer = getOffer(offerId);
  const contact = offerIsContact(offer);
  const disciplines = offer?.disciplines || [];
  const hasKarate = disciplines.includes('karate');
  const hasStriking = disciplines.includes('boxing') || disciplines.includes('mma');
  // Aids cumulate, so these are memberships, not one exclusive choice: a member
  // holding both gets both checklists.
  const claimed = new Set(normalizeAids({ aids, aid }).map((a) => a.type));
  const docs = [];

  // ID photo: mandatory for karate; for the Shidokan Triathlon, only for
  // competitors.
  if (hasKarate || hasStriking) {
    const who = hasKarate
      ? 'Obligatoire pour le karaté.' +
        (hasStriking ? ' (Également requise pour les compétiteurs en Shidokan Triathlon.)' : '')
      : 'Obligatoire pour les compétiteurs en Shidokan Triathlon.';
    docs.push({
      id: 'photo-identite',
      label: "1 photo d'identité",
      // The online upload serves the digital licence, not the paper file: the
      // office needs the printed photo either way. The form used to imply the
      // upload spared the member from bringing one.
      help:
        `${who} À rapporter au bureau <strong>même si vous l'avez déjà envoyée en ligne</strong> ` +
        "— l'envoi ne la remplace pas.",
    });
  }

  if (isMinor) {
    // A member who turns 18 during the season pays the adult fee while still
    // being a minor today. Left unsaid, the checklist below reads like a bug to
    // someone who has just been quoted the adult price.
    if (tariff === 'adult') {
      docs.push({
        id: 'mineur-tarif-adulte',
        label: 'Encore mineur : les pièces ci-dessous restent obligatoires',
        help:
          'L\'adhérent aura 18 ans dans l\'année, ce qui fixe le tarif adulte, mais il est ' +
          'encore mineur aujourd\'hui : la FFKarate demande donc le questionnaire de santé et ' +
          'l\'attestation du responsable légal.',
      });
    }
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
  } else if (hasKarate || hasStriking) {
    // Adults: the medical certificate is mandatory ONLY for competitors
    // (for leisure, no certificate is required).
    docs.push({
      id: 'certificat-medical',
      label: 'Compétiteurs : certificat médical de non contre-indication',
      help:
        'Obligatoire <strong>uniquement pour les compétiteurs</strong> — en loisir, aucun certificat ' +
        'n\'est requis. Le certificat doit mentionner explicitement la pratique <strong>en compétition</strong>.',
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

  if (claimed.has('peps')) {
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
  if (claimed.has('passsport')) {
    docs.push({
      id: 'passsport',
      label: 'Justificatif Pass\'Sport (courrier/code officiel)',
      help: 'À rapporter au bureau pour permettre au club de percevoir l\'aide.',
    });
  }

  return docs;
}

/**
 * Determines whether the member is a minor from a date of birth (YYYY-MM-DD).
 * `refDate` = reference date (defaults to today).
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
