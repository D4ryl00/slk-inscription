// Price computation — SOURCE OF TRUTH, run server-side (create-checkout).
// The front imports the same module for DISPLAY, but never decides the amount
// actually charged. All internal amounts are in CENTS.

import {
  AIDS,
  NEW_MEMBER_FEE,
  PAYMENT_METHODS,
  PAYMENT_PLANS,
  ageInSeason,
  familyIncrementalDiscount,
  getOffer,
  lateSeasonDiscount,
  licenseFeesForOffer,
  normalizeAids,
  offerPriceAnnual,
  tariffForAge,
} from './config.js';

// Errors the front can attribute to a precise part of the form, to show them
// where the amount was typed instead of only in the summary further down.
export const OFFLINE_FIELD = 'offlinePayments';

const toCents = (euros) => Math.round(euros * 100);
export const centsToEuros = (c) => c / 100;
export const formatEuros = (c) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);

/**
 * Computes the price of a membership.
 *
 * @param {object} selection
 * @param {string} selection.offerId
 * @param {string} [selection.dateNaissance] 'YYYY-MM-DD'; sets the tariff band
 * @param {'1x'|'3x'} selection.paymentPlan
 * @param {number} [selection.familyAlreadyRegistered=0] household members already registered
 * @param {string} [selection.nouvelAdherent] 'Oui' → the flat new-member fee applies
 * @param {{type: 'passsport'|'peps', code?: string}[]} [selection.aids] cumulative; the
 *        pre-cumulation `selection.aid` object is still accepted (cf. normalizeAids)
 * @param {{method: string, amount: number}[]} [selection.offlinePayments] amounts (€) paid offline
 * @param {Date} [refDate=new Date()] reference date for the late-season proration
 * @returns {{
 *   ok: boolean, error?: string, errorField?: 'offlinePayments',
 *   offer?: object, plan?: object, tariff?: 'youth'|'adult'|null,
 *   baseCents?: number, familyDiscountCents?: number, lateDiscountCents?: number,
 *   aidCents?: number, newMemberFeeCents?: number,
 *   licenseFees?: {label: string, amountCents: number}[],
 *   totalCents?: number, currency?: 'EUR',
 *   aidsApplied?: {type: string, label: string, code: string, amountCents: number}[],
 *   offlinePayments?: {method: string, label: string, amountCents: number}[],
 *   offlineTotalCents?: number, cbAmountCents?: number
 * }}
 */
export function computePrice(selection, refDate = new Date()) {
  const offer = getOffer(selection?.offerId);
  if (!offer) return { ok: false, error: 'Offre inconnue.' };

  const plan = PAYMENT_PLANS[selection?.paymentPlan];
  if (!plan) return { ok: false, error: 'Plan de paiement inconnu.' };

  // --- Tariff band, derived from the birthdate -------------------------------
  // The club charges a youth rate up to 17 included even though the 14-17 train
  // with the adults, so the age is what sets the price — never a chosen category.
  const age = ageInSeason(selection?.dateNaissance, refDate);
  const tariff = tariffForAge(age);
  const priceAnnual = offerPriceAnnual(offer, age);
  if (priceAnnual == null) {
    return {
      ok: false,
      error: 'Renseignez votre date de naissance pour connaître le tarif de cette formule.',
    };
  }
  const baseCents = toCents(priceAnnual);

  // --- Family discount (incremental flat amount based on already-registered members) --
  const familyDiscountCents = toCents(
    familyIncrementalDiscount(selection.familyAlreadyRegistered || 0),
  );

  // --- Late-season proration (−20 € from Nov 1st, +20 € each month start) -----
  const lateDiscountCents = toCents(lateSeasonDiscount(refDate));

  // --- Licence fees already included in the price (informational breakdown) ----
  const licenseFees = licenseFeesForOffer(offer).map((l) => ({
    label: l.label,
    amountCents: toCents(l.amount),
  }));

  // --- Aids (PEPS / Pass'Sport) ----------------------------------------------
  // They CUMULATE: a member entitled to both has both deducted. The total is
  // floored at 0 below, so aids worth more than the fee cost the club nothing.
  let aidCents = 0;
  const aidsApplied = [];
  for (const { type, code } of normalizeAids(selection)) {
    const aid = AIDS[type];
    if (aid.requiresCode && !code) {
      return { ok: false, error: `Un code/référence est requis pour l'aide ${aid.label}.` };
    }
    const amountCents = toCents(aid.amount);
    aidCents += amountCents;
    aidsApplied.push({ type, label: aid.label, code, amountCents });
  }

  // --- New-member fee (automatic flat fee for first-time registrations) -------
  const newMemberFeeCents =
    selection?.nouvelAdherent === 'Oui' ? toCents(NEW_MEMBER_FEE.amount) : 0;

  // Total due — net fee (discounts floored at 0) plus the flat new-member fee.
  const totalCents =
    Math.max(0, baseCents - familyDiscountCents - lateDiscountCents - aidCents) +
    newMemberFeeCents;

  // --- Offline payments (cheque, holiday vouchers, cash) ----------------------
  // Each amount is deducted from what remains to be paid by card on HelloAsso.
  const offlinePayments = [];
  let offlineTotalCents = 0;
  for (const p of selection?.offlinePayments || []) {
    const method = PAYMENT_METHODS[p.method];
    if (!method) {
      return { ok: false, error: `Moyen de paiement inconnu : ${p.method}.`, errorField: OFFLINE_FIELD };
    }
    const cents = Math.round((Number(p.amount) || 0) * 100);
    if (cents < 0) {
      return { ok: false, error: 'Un montant hors ligne est négatif.', errorField: OFFLINE_FIELD };
    }
    if (cents > 0) {
      offlinePayments.push({ method: p.method, label: method.label, amountCents: cents });
      offlineTotalCents += cents;
    }
  }
  if (offlineTotalCents > totalCents) {
    return {
      ok: false,
      error: 'Les règlements hors ligne dépassent le total dû.',
      errorField: OFFLINE_FIELD,
    };
  }
  const cbAmountCents = totalCents - offlineTotalCents; // paid online (may be 0)

  return {
    ok: true,
    offer,
    plan,
    tariff,
    baseCents,
    familyDiscountCents,
    lateDiscountCents,
    aidCents,
    aidsApplied,
    newMemberFeeCents,
    licenseFees,
    totalCents,
    currency: 'EUR',
    offlinePayments,
    offlineTotalCents,
    cbAmountCents,
  };
}

/**
 * Builds the installments for the HelloAsso Checkout.
 * 1x → a single term today. 3x → 3 monthly terms whose sum is EXACTLY the total
 * (the rounding remainder goes on the first installment).
 *
 * @returns {{ initialAmount: number, terms: {amount:number, date:string}[] }}
 *          amounts in cents; ISO dates (YYYY-MM-DD).
 */
export function buildInstallments(totalCents, paymentPlan, startDate = new Date()) {
  const n = PAYMENT_PLANS[paymentPlan]?.installments || 1;
  if (n <= 1) {
    return {
      initialAmount: totalCents,
      terms: [{ amount: totalCents, date: isoDate(startDate) }],
    };
  }
  const even = Math.floor(totalCents / n);
  const remainder = totalCents - even * n;
  const terms = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    // The first installment absorbs the remainder so the sum = exact total.
    terms.push({ amount: i === 0 ? even + remainder : even, date: isoDate(d) });
  }
  return { initialAmount: terms[0].amount, terms };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
