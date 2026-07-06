// Builds the Google Sheet row in the EXACT ORDER of FORM_COLUMNS.
// The site writes ONLY the columns coming from the form (contiguous block from
// column A). Positional write (some headers are duplicated) → array.

import { AIDS, FORM_COLUMNS, PASSEPORT_FFK, PASSEPORT_SHIDOKAN, getOffer } from './config.js';
import { formatEuros } from './pricing.js';

const oui = (b) => (b ? 'Oui' : 'Non');

/**
 * @param {object} s submission sent by the front
 * @param {object} pay payment summary:
 *   { date, netTotalCents, onlineAmountCents, onlinePaymentId, onlinePlanLabel,
 *     offlinePayments:[{label,amountCents}], offlineTotalCents, familyDiscountCents,
 *     passeportCents, passeportFfkCents }
 * @returns {(string|number)[]} exactly FORM_COLUMNS.length values
 */
export function buildSheetRow(s, pay) {
  const offer = getOffer(s.offerId);
  const sectionLabel = offer ? offer.label : s.offerId || '';
  const addr = s.adresse || {};
  const cc = s.contactConfiance || {};
  const aid = s.aid || {};
  const p = pay || {};
  const offline = p.offlinePayments || [];

  // Summary of the chosen payment methods.
  const methods = [];
  if (p.onlineAmountCents > 0) methods.push('CB (HelloAsso)');
  for (const o of offline) methods.push(o.label);
  const modeReglement = methods.length ? methods.join(' + ') : 'Aucun (cotisation nulle)';

  // Total fee (mentioning the family discount if it applies).
  const totalCell =
    formatEuros(p.netTotalCents || 0) +
    (p.familyDiscountCents ? ` (remise famille −${formatEuros(p.familyDiscountCents)} incluse)` : '');

  // Amount actually paid online.
  const paiementCell =
    p.onlineAmountCents > 0
      ? `En ligne ${formatEuros(p.onlineAmountCents)} (${p.onlinePlanLabel || 'CB'})` +
        (p.onlinePaymentId ? ` — paiement ${p.onlinePaymentId}` : '')
      : 'Aucun paiement en ligne';

  // Breakdown of offline payments (to be collected at the office).
  const horsLigneCell = offline.length
    ? offline.map((o) => `${o.label} : ${formatEuros(o.amountCents)}`).join(' ; ') +
      ' — à encaisser au bureau'
    : '';

  // Passeport Shidokan (optional karate add-on).
  const passeportCell =
    p.passeportCents > 0
      ? `Oui — ${formatEuros(p.passeportCents)} (valable ${PASSEPORT_SHIDOKAN.validityYears} ans)`
      : '';

  // Passeport FFK (optional competition add-on).
  const passeportFfkCell =
    p.passeportFfkCents > 0
      ? `Oui — ${formatEuros(p.passeportFfkCents)} (valable ${PASSEPORT_FFK.validityYears} ans)`
      : '';

  const aidCell = (type) => {
    if (aid.type !== type) return '';
    const a = AIDS[type];
    const codePart = a?.requiresCode ? ` — code ${aid.code || '?'}` : '';
    return `Déduit ${a ? a.amount + ' €' : ''}${codePart} — À VÉRIFIER`;
  };

  // Order = FORM_COLUMNS.
  const row = [
    p.date || new Date().toISOString(),                    // Submission date
    s.nouvelAdherent || '',                                // New member
    s.prenom || '',                                        // First name
    s.nom || '',                                           // Last name
    s.dateNaissance || '',                                 // Date of birth
    s.lieuNaissance || '',                                 // Place of birth
    s.nomParents || '',                                    // Parents' name
    addr.numeroRue || '',                                  // Address - Number and street
    addr.complement || '',                                 // Address - Complement
    addr.ville || '',                                      // Address - City
    addr.codePostal || '',                                 // Address - Postal code
    addr.pays || '',                                       // Address - Country
    s.email || '',                                         // Email
    s.telephone || '',                                     // Phone number
    oui(s.reseauxSociaux === 'Oui' || s.reseauxSociaux === true), // Social media
    cc.prenom || '',                                       // Trusted contact - First name
    cc.nom || '',                                          // Trusted contact - Last name
    cc.telephone || '',                                    // Trusted contact - Phone
    sectionLabel,                                          // Section
    Array.isArray(s.motivations) ? s.motivations.join(', ') : (s.motivations || ''), // Motivations
    s.gradeShidokan || '',                                 // Shidokan grade
    passeportCell,                                         // Passeport Shidokan
    passeportFfkCell,                                      // Passeport FFK
    Array.isArray(s.cardioJours) ? s.cardioJours.join(', ') : (s.cardioJours || ''), // Cardio days
    modeReglement,                                         // Payment method
    totalCell,                                             // Total fee
    paiementCell,                                          // PAYMENT (paid online)
    horsLigneCell,                                         // Offline payments
    aidCell('peps'),                                       // PEPS aid
    aidCell('passsport'),                                  // Pass'Sport aid
  ];

  if (row.length !== FORM_COLUMNS.length) {
    throw new Error(
      `buildSheetRow: ${row.length} values for ${FORM_COLUMNS.length} columns.`,
    );
  }
  return row;
}

/** Index (0-based) of the "Paiement en ligne" column, for deduplication. */
export const PAIEMENT_COL_INDEX = FORM_COLUMNS.indexOf('Paiement en ligne');
