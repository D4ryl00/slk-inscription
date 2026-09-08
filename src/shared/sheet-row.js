// Builds the Google Sheet row in the EXACT ORDER of FORM_COLUMNS.
// The site writes ONLY the columns coming from the form (contiguous block from
// column A). Positional write (some headers are duplicated) → array.

import { AIDS, FORM_COLUMNS, getOffer } from './config.js';
import { formatEuros } from './pricing.js';

const oui = (b) => (b ? 'Oui' : 'Non');

/**
 * @param {object} s submission sent by the front
 * @param {object} pay payment summary:
 *   { date, netTotalCents, onlineAmountCents, onlinePaymentId, onlinePlanLabel,
 *     offlinePayments:[{label,amountCents}], offlineTotalCents, familyDiscountCents,
 *     lateDiscountCents, photoUrl,
 *     installments, firstInstallment:{installmentNumber,amountCents,date,paymentId} }
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

  // Total fee (mentioning the family / late-season discounts if they apply).
  const discountNotes = [];
  if (p.familyDiscountCents) discountNotes.push(`remise famille −${formatEuros(p.familyDiscountCents)}`);
  if (p.lateDiscountCents) discountNotes.push(`remise saison entamée −${formatEuros(p.lateDiscountCents)}`);
  const totalCell =
    formatEuros(p.netTotalCents || 0) +
    (discountNotes.length ? ` (${discountNotes.join(', ')} incluse${discountNotes.length > 1 ? 's' : ''})` : '');

  // Amount paid online. With an installment plan the online amount is what is
  // PLANNED, not what has been taken — only the first installment has arrived — so
  // the wording says so, and each installment is then listed on its own line as it
  // is collected. "En ligne 330,00 €" on day one had the office read a 3x as fully
  // collected for two months.
  // `onlinePaymentId` is the ORDER reference (cf. extractPaymentReference), so it
  // is labelled as one. Calling it "paiement" put it under the same word as the
  // real payment ids on the installment lines, for two different numbers.
  const installments = p.installments || 1;
  const ref = p.onlinePaymentId ? ` — commande ${p.onlinePaymentId}` : '';
  let paiementCell;
  if (!(p.onlineAmountCents > 0)) {
    paiementCell = 'Aucun paiement en ligne';
  } else if (installments > 1) {
    paiementCell = `Prévu ${formatEuros(p.onlineAmountCents)} en ${installments}×${ref}`;
  } else {
    paiementCell = `En ligne ${formatEuros(p.onlineAmountCents)} (${p.onlinePlanLabel || 'CB'})${ref}`;
  }
  // Only a plan gets per-installment lines: on a single payment "Échéance 1" would
  // just repeat the line above it, for the same amount on the same day.
  // Same helper as the later installments, so the lines cannot drift apart.
  if (installments > 1 && p.firstInstallment) {
    paiementCell = appendInstallmentLine(paiementCell, p.firstInstallment);
  }

  // Breakdown of offline payments (to be collected at the office).
  const horsLigneCell = offline.length
    ? offline.map((o) => `${o.label} : ${formatEuros(o.amountCents)}`).join(' ; ') +
      ' — à encaisser au bureau'
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
    Array.isArray(s.cardioJours) ? s.cardioJours.join(', ') : (s.cardioJours || ''), // Cardio days
    modeReglement,                                         // Payment method
    totalCell,                                             // Total fee
    paiementCell,                                          // PAYMENT (paid online)
    horsLigneCell,                                         // Offline payments
    aidCell('peps'),                                       // PEPS aid
    aidCell('passsport'),                                  // Pass'Sport aid
    p.photoUrl || '',                                      // ID photo (Drive link)
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

/** Words a reference can follow in the cell: an order (3x summary) or a payment. */
const REFERENCE_WORDS = new Set(['paiement', 'commande']);

/**
 * True if a "Paiement en ligne" cell records EXACTLY this reference.
 * References appear as `— paiement <id>` or, on the summary line of an installment
 * plan, `— commande <id>` (cf. paiementCell above): we require one of those words
 * immediately followed by the full id. A substring test would false-positive on a
 * prefix (id "123" vs cell "… paiement 1234") and make the webhook drop a paid
 * member as "already recorded".
 * This is the key BOTH the deduplication and the installment row lookup search on,
 * so it must keep matching rows written before the 3x wording existed.
 * @param {unknown} cell value read from the Sheet
 * @param {string} paymentId reference to look for
 * @returns {boolean}
 */
export function paymentCellMatches(cell, paymentId) {
  if (!paymentId) return false;
  const id = String(paymentId);
  const words = String(cell ?? '').split(/\s+/);
  return words.some((w, i) => REFERENCE_WORDS.has(w) && words[i + 1] === id);
}

/** ISO date → `JJ/MM/AAAA`, or '' when there is no usable date. */
function frenchDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Adds one installment to a "Paiement en ligne" cell, on its own line.
 * HelloAsso notifies each paid installment separately, months after the first —
 * by then the submission blob is long gone, so the row is found back through the
 * order id already written in the cell and we only append to what is there.
 * Idempotent: a cell already mentioning this payment id comes back untouched, so
 * a replayed notification writes nothing.
 * @param {unknown} cell current cell content ('' for an empty cell)
 * @param {{installmentNumber:number, amountCents:number, date?:string, paymentId:string|number}} p
 * @returns {string} the cell content to write back
 */
export function appendInstallmentLine(cell, p) {
  const current = String(cell ?? '');
  if (paymentCellMatches(current, p.paymentId)) return current;
  const day = frenchDay(p.date);
  const line =
    `Échéance ${p.installmentNumber} : ${formatEuros(p.amountCents || 0)}` +
    (day ? ` le ${day}` : '') +
    ` — paiement ${p.paymentId}`;
  return current ? `${current}\n${line}` : line;
}
