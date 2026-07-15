// Business configuration shared between the front (browser) and the functions
// (Node). Pure ESM module, no dependency: do not import anything Node-specific.
//
// ⚠️ VALUES TO CONFIRM every season — see the "À CONFIRMER" comments.

/**
 * Disciplines offered by the club.
 * `contact: true` triggers the stricter medical requirement (fundus exam + ECG)
 * for ADULTS who fight with KO — cf. FFKarate note. Shidokan karate is a
 * full-contact (KO) karate, just like Shido-Boxing / Shido-Mix-Martial.
 */
export const DISCIPLINES = {
  karate: { label: 'Karaté Shidokan', contact: true },
  mma: { label: 'Shido-Mix-Martial', contact: true },
  boxing: { label: 'Shido-Boxing', contact: true },
  // TODO CONFIRM: does Cardio Budo (fitness) require a fundus exam + ECG?
  // Treated as NON-contact by default (no sparring / competition).
  cardio: { label: 'Cardio Budo Kick-Boxing', contact: false },
};

/**
 * Membership offers = what is actually sold (mirrors the current campaign).
 * `priceAnnual` in euros (total amount for the season).
 * ⚠️ TO CONFIRM / COMPLETE: list and prices taken from the HelloAsso 2025-2026
 * screenshot; add a possible "Karaté seul" price if one exists.
 */
export const OFFERS = [
  {
    id: 'karate-mix-boxing-enfant',
    label: 'Karaté Shidokan + Shidokan Triathlon — Enfant / Ado',
    category: 'enfant',
    disciplines: ['karate', 'mma', 'boxing'],
    priceAnnual: 265,
  },
  {
    id: 'karate-mix-boxing-adulte',
    label: 'Karaté Shidokan + Shidokan Triathlon — Adulte',
    category: 'adulte',
    disciplines: ['karate', 'mma', 'boxing'],
    priceAnnual: 330,
  },
  {
    id: 'mix-boxing-enfant',
    label: 'Shidokan Triathlon — Enfant / Ado',
    category: 'enfant',
    disciplines: ['mma', 'boxing'],
    priceAnnual: 265,
  },
  {
    id: 'mix-boxing-adulte',
    label: 'Shidokan Triathlon — Adulte',
    category: 'adulte',
    disciplines: ['mma', 'boxing'],
    priceAnnual: 280,
  },
  {
    id: 'cardio-1',
    label: 'Cardio Budo Kick-Boxing — 1 cours / semaine',
    category: 'na',
    disciplines: ['cardio'],
    priceAnnual: 180,
    sessions: 1,
  },
  {
    id: 'cardio-2',
    label: 'Cardio Budo Kick-Boxing — 2 cours / semaine',
    category: 'na',
    disciplines: ['cardio'],
    priceAnnual: 265,
    sessions: 2,
  },
  {
    id: 'cardio-3',
    label: 'Cardio Budo Kick-Boxing — 3 cours / semaine',
    category: 'na',
    disciplines: ['cardio'],
    priceAnnual: 320,
    sessions: 3,
  },
];

/** Payment plans supported by the HelloAsso Checkout. */
export const PAYMENT_PLANS = {
  '1x': { label: 'Paiement en 1 fois', installments: 1 },
  '3x': { label: 'Paiement en 3 fois', installments: 3 },
};

/**
 * Financial aids deducted online.
 * `amount` in euros. ⚠️ TO CONFIRM every season (the scales change).
 */
export const AIDS = {
  passsport: {
    label: "Pass'Sport",
    amount: 70,
    requiresCode: true,
    column: "Aide Pass'Sport",
  },
  peps: {
    // PEPS is also called "Prime Enfant" (it's an aid, not a payment method).
    // No online code: the member brings the PEPS form + documents to the office.
    label: 'PEPS (Prime Enfant)',
    amount: 30,
    requiresCode: false,
    column: 'Aide PEPS',
  },
};

/**
 * New-member fee — a flat `amount` € added AUTOMATICALLY (no opt-out) to every
 * first-time registration (`nouvelAdherent === 'Oui'`), whatever the discipline.
 * (Replaces the former optional "Passeport Shidokan" add-on.)
 * No dedicated Sheet column: the "Nouvel adhérent" column already flags who pays it.
 * ⚠️ TO CONFIRM every season (price).
 */
export const NEW_MEMBER_FEE = {
  label: 'Frais nouvel adhérent',
  amount: 6,
};

/**
 * Licence fees ALREADY INCLUDED in each offer's `priceAnnual`. They are NOT added
 * on top: we only surface how the annual price is composed, in the payment detail.
 * The FFK licence applies to every offer; the Shidokan licence applies to
 * everything EXCEPT Cardio-Budo.
 * ⚠️ TO CONFIRM every season (amounts).
 */
export const LICENSE_FEES = {
  ffk: { label: 'licence FFK', amount: 39 },
  shidokan: { label: 'licence Shidokan', amount: 20 },
};

/** Licences included in an offer's price (Shidokan excluded for Cardio-Budo). */
export function licenseFeesForOffer(offer) {
  if (!offer) return [];
  const list = [LICENSE_FEES.ffk];
  if (!offer.disciplines.includes('cardio')) list.push(LICENSE_FEES.shidokan);
  return list;
}

/**
 * Late-season proration. From `startDate`, the fee drops by `stepAmount` €, then
 * by an extra `stepAmount` € at the start of every following month
 * (Nov → −20 €, Dec → −40 €, Jan → −60 €, …). Applies to every offer.
 * `maxAmount` caps the deduction in € (0 = no cap).
 *
 * Season lifecycle: the discount only runs between `startDate` and `endDate`
 * (inclusive). After `endDate` (registrations usually close end of June) it is
 * back to 0, so the NEXT season's early registrations (July → October) pay full
 * price. When a new season opens (the manual title change, e.g. "2027-2028"),
 * bump `startDate`/`endDate` to that season — the July→October gap is already
 * handled by `endDate`, so the exact timing of that manual edit is not critical.
 *
 * Dates and every month boundary are read in the Europe/Paris civil calendar
 * (so a palier flips at Paris midnight, not the server's UTC midnight).
 * ⚠️ TO CONFIRM every season (startDate/endDate must point to the current season).
 */
export const LATE_SEASON_DISCOUNT = {
  enabled: true,
  startDate: '2026-11-01', // first −20 € (season start)
  endDate: '2027-06-30', // last day the discount applies (season end); after it → 0
  stepAmount: 20,
  maxAmount: 0, // 0 = no cap
  timeZone: 'Europe/Paris',
};

/** Civil { year, month (0-based), day } of `date` as seen in `timeZone`. */
function civilPartsIn(date, timeZone) {
  // en-CA formats as YYYY-MM-DD, easy to split back into numbers.
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Parse 'YYYY-MM-DD' into civil { year, month (0-based), day }, or null if malformed. */
function parseCivilDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

/** Sign of (a − b) for civil {year,month,day} triples: -1, 0 or 1. */
function compareCivil(a, b) {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/** Number of −stepAmount steps in effect at `refDate` (Nov = 1, Dec = 2, …); 0 outside the season. */
export function lateSeasonDiscountSteps(refDate = new Date()) {
  if (!LATE_SEASON_DISCOUNT.enabled) return 0;
  const start = parseCivilDate(LATE_SEASON_DISCOUNT.startDate);
  if (!start) return 0; // malformed startDate
  const now = civilPartsIn(refDate, LATE_SEASON_DISCOUNT.timeZone);
  if (compareCivil(now, start) < 0) return 0; // before the season's discount start
  const end = parseCivilDate(LATE_SEASON_DISCOUNT.endDate);
  if (end && compareCivil(now, end) > 0) return 0; // season over → no discount until the next one
  const months = (now.year - start.year) * 12 + (now.month - start.month);
  return months + 1; // the start month itself already grants one step
}

/** Late-season discount in EUROS at `refDate` (capped by `maxAmount` when > 0). */
export function lateSeasonDiscount(refDate = new Date()) {
  const raw = lateSeasonDiscountSteps(refDate) * LATE_SEASON_DISCOUNT.stepAmount;
  const cap = LATE_SEASON_DISCOUNT.maxAmount;
  return cap > 0 ? Math.min(raw, cap) : raw;
}

/**
 * OFFLINE payment methods (collected at the office). The amount entered for each
 * is DEDUCTED from what remains to be paid by card on HelloAsso. If the offline
 * total covers the whole fee, no online payment happens.
 * NB: "Prime Enfant" is not a payment method — it's the PEPS aid (cf. AIDS).
 */
export const PAYMENT_METHODS = {
  cheque: { label: 'Chèque(s)' },
  cheques_vacances: { label: 'Chèques vacances (ANCV)' },
  especes: { label: 'Espèces' },
};

/**
 * Family discount — flat amount based on the TOTAL NUMBER of household members.
 * Source: Jotform 2025-2026 form.
 *   2 members → −50 € · 3 → −70 € · 4 (and +) → −100 €
 *
 * ⚠️ This flat amount applies ONCE for the whole family. It can therefore only
 * be applied correctly on an order covering ALL members (a single payment for N
 * members). In a "one member = one payment" flow, leave `enabled: false` to
 * avoid deducting the discount several times.
 */
export const FAMILY_DISCOUNT = {
  enabled: true,
  // CUMULATIVE flat amount for the whole family based on the total number of
  // registered members. Applied once, spread incrementally across registrations
  // (1 member = 1 form; we ask how many members are already registered).
  tiers: [
    { members: 2, total: 50 },
    { members: 3, total: 70 },
    { members: 4, total: 100 }, // 4 members or more (cap)
  ],
};

/** CUMULATIVE family flat amount for `members` members total (0 / 50 / 70 / 100). */
export function familyDiscountTotal(members) {
  let total = 0;
  for (const t of FAMILY_DISCOUNT.tiers) if (members >= t.members) total = t.total;
  return total;
}

/**
 * Discount to apply for ONE new member, given how many of their family members
 * are ALREADY registered. = cumulative(after) − cumulative(before), so the total
 * family discount matches the scale and is counted only once.
 */
export function familyIncrementalDiscount(alreadyRegistered) {
  if (!FAMILY_DISCOUNT.enabled) return 0;
  const before = Math.max(0, Math.trunc(alreadyRegistered || 0));
  return familyDiscountTotal(before + 1) - familyDiscountTotal(before);
}

/**
 * Shidokan grades (dropdown conditional on the Karate section), from beginner to
 * highest grade. Order provided by the club.
 */
export const GRADES_SHIDOKAN = [
  '10e kyu — ceinture blanche',
  '9e kyu — ceinture orange',
  '8e kyu — ceinture bleue',
  '7e kyu — ceinture bleue (2 barrettes)',
  '6e kyu — ceinture jaune',
  '5e kyu — ceinture jaune (2 barrettes)',
  '4e kyu — ceinture verte',
  '3e kyu — ceinture verte (2 barrettes)',
  '2e kyu — ceinture marron',
  '1er kyu — ceinture marron (2 barrettes)',
  '1er Dan',
  '2e Dan',
  '3e Dan',
  '4e Dan',
  '5e Dan',
  '6e Dan',
];

/**
 * Offered motivations (checkboxes, multiple choice).
 * Shown for Karate AND for Boxing/MMA; the entries listed in
 * `MOTIVATIONS_KARATE_ONLY` are reserved for offers that include karate.
 */
export const MOTIVATIONS = [
  'Sport Loisir',
  'Karaté loisir ceinture noire',
  'Compétition',
];

/** Motivations reserved for offers including karate (hidden for Boxing/MMA). */
export const MOTIVATIONS_KARATE_ONLY = ['Karaté loisir ceinture noire'];

/**
 * Columns WRITTEN BY THE SITE, in order, starting at column A of the Sheet.
 * The webhook `append`s these columns only.
 * ⚠️ DO NOT REORDER: the write is POSITIONAL (by index, not by name).
 * The labels are free/cosmetic (human readability of the Sheet); only the ORDER
 * matters. The first row of the Google Sheet uses these headers.
 * ⚠️ If you rename "Paiement en ligne", update `PAIEMENT_COL_INDEX` in
 * sheet-row.js (webhook deduplication).
 */
export const FORM_COLUMNS = [
  'Date de soumission',
  'Nouvel adhérent',
  'Prénom',
  'Nom',
  'Date de naissance',
  'Lieu de naissance',
  'Nom des parents (si différent)',
  'Adresse',
  'Complément d\'adresse',
  'Ville',
  'Code postal',
  'Pays',
  'Email',
  'Téléphone',
  'Autorisation réseaux sociaux',
  'Contact de confiance — Prénom',
  'Contact de confiance — Nom',
  'Contact de confiance — Téléphone',
  'Section',
  'Motivations',
  'Grade Shidokan',
  'Cardio-Budo — Jours',
  'Mode de règlement',
  'Total cotisation',
  'Paiement en ligne',
  'Règlements hors ligne',
  'Aide PEPS',
  'Aide Pass\'Sport',
  'Photo', // lien Drive de la photo d'identité (vide si non fournie)
];

/** Days offered for Cardio Budo. */
export const CARDIO_DAYS = ['Lundi', 'Vendredi', 'Samedi'];

/** Utility: find an offer by its id. */
export function getOffer(offerId) {
  return OFFERS.find((o) => o.id === offerId) || null;
}

/** An offer is a "contact discipline" if any of its disciplines is. */
export function offerIsContact(offer) {
  if (!offer) return false;
  return offer.disciplines.some((d) => DISCIPLINES[d]?.contact);
}
