// Calcul du prix — SOURCE DE VÉRITÉ, exécutée côté serveur (create-checkout).
// Le front importe le même module pour l'AFFICHAGE, mais ne décide jamais du
// montant réellement facturé. Tous les montants internes sont en CENTIMES.

import {
  AIDS,
  FAMILY_DISCOUNT,
  PAYMENT_PLANS,
  familyDiscountEuros,
  getOffer,
} from './config.js';

const toCents = (euros) => Math.round(euros * 100);
export const centsToEuros = (c) => c / 100;
export const formatEuros = (c) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);

/**
 * Calcule le prix d'une adhésion.
 *
 * @param {object} selection
 * @param {string} selection.offerId
 * @param {'1x'|'3x'} selection.paymentPlan
 * @param {number} [selection.familyMembers=1] nb de membres de la même famille
 * @param {{type?: 'passsport'|'peps'|null, code?: string}} [selection.aid]
 * @returns {{
 *   ok: boolean, error?: string,
 *   offer?: object, plan?: object,
 *   baseCents?: number, familyDiscountCents?: number, aidCents?: number,
 *   totalCents?: number, currency?: 'EUR',
 *   aidApplied?: {type: string, label: string, code: string, amountCents: number}|null
 * }}
 */
export function computePrice(selection) {
  const offer = getOffer(selection?.offerId);
  if (!offer) return { ok: false, error: 'Offre inconnue.' };

  const plan = PAYMENT_PLANS[selection?.paymentPlan];
  if (!plan) return { ok: false, error: 'Plan de paiement inconnu.' };

  const baseCents = toCents(offer.priceAnnual);

  // --- Réduction famille (forfait par nombre de membres, cf. config) ---------
  // ⚠️ N'est appliquée que si FAMILY_DISCOUNT.enabled (panier multi-adhérents).
  let familyDiscountCents = 0;
  if (FAMILY_DISCOUNT.enabled) {
    familyDiscountCents = toCents(familyDiscountEuros(selection.familyMembers || 1));
  }

  // --- Aide (PEPS / Pass'Sport), déduite uniquement si un code est saisi ------
  let aidCents = 0;
  let aidApplied = null;
  const aidType = selection?.aid?.type;
  if (aidType && AIDS[aidType]) {
    const aid = AIDS[aidType];
    const code = (selection.aid.code || '').trim();
    if (aid.requiresCode && !code) {
      return { ok: false, error: `Un code/référence est requis pour l'aide ${aid.label}.` };
    }
    aidCents = toCents(aid.amount);
    aidApplied = { type: aidType, label: aid.label, code, amountCents: aidCents };
  }

  // Le total ne peut jamais passer sous 0.
  const totalCents = Math.max(0, baseCents - familyDiscountCents - aidCents);

  return {
    ok: true,
    offer,
    plan,
    baseCents,
    familyDiscountCents,
    aidCents,
    aidApplied,
    totalCents,
    currency: 'EUR',
  };
}

/**
 * Construit les échéances pour le Checkout HelloAsso.
 * 1x → un seul terme aujourd'hui. 3x → 3 termes mensuels dont la somme est
 * EXACTEMENT le total (le reliquat d'arrondi va sur la 1re échéance).
 *
 * @returns {{ initialAmount: number, terms: {amount:number, date:string}[] }}
 *          montants en centimes ; dates ISO (AAAA-MM-JJ).
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
    // La 1re échéance absorbe le reliquat pour que la somme = total exact.
    terms.push({ amount: i === 0 ? even + remainder : even, date: isoDate(d) });
  }
  return { initialAmount: terms[0].amount, terms };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
