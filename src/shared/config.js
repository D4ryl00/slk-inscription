// Business configuration shared between the front (browser) and the functions
// (Node). Pure ESM module, no dependency: do not import anything Node-specific.
//
// ⚠️ VALUES TO CONFIRM every season — see the "À CONFIRMER" comments.

/**
 * Disciplines offered by the club.
 * `contact: true` triggers the stricter medical requirement (fundus exam + ECG)
 * for ADULTS who fight with KO — cf. FFKarate note. Shidokan karate is a
 * full-contact (KO) karate, just like the Shidokan Triathlon.
 */
export const DISCIPLINES = {
  karate: { label: 'Karaté Shidokan', contact: true },
  // `mma` + `boxing` are the two halves of what is now sold as a single
  // "Shidokan Triathlon" formula (the club's planning calls it "Triathlon des
  // arts martiaux"). The two keys survive because OFFERS and the documents
  // checklist still reference them individually; the label is shared because
  // members only ever see the combined product name.
  mma: { label: 'Shidokan Triathlon', contact: true },
  boxing: { label: 'Shidokan Triathlon', contact: true },
  // TODO CONFIRM: does Cardio Budo (fitness) require a fundus exam + ECG?
  // Treated as NON-contact by default (no sparring / competition).
  cardio: { label: 'Cardio Budo Kick-Boxing', contact: false },
};

/**
 * Membership offers = what is actually sold. ONE OFFER = ONE DISCIPLINE: the
 * member picks what they want to practise, never an age category. The tariff is
 * derived from their birthdate (cf. `tariffForAge` / `offerPriceAnnual`),
 * because the club's classes and its prices do not split at the same age: the
 * 14-17 train with the adults but still pay the youth rate.
 *
 * `priceAnnual` in euros, for the whole season. Either a flat number, or
 * `{ youth, adult }` when the offer is age-banded.
 *
 * `minAge` mirrors the floor printed on the club's planning (karate opens at 6,
 * the triathlon at 8). It NEVER blocks a registration: it only feeds the
 * advisory notice in the form (cf. `offerMinAgeWarning`), because the office has
 * the final say on borderline cases. There is no ceiling — every offer is open
 * to any older member.
 * The floor is a MINIMUM over the offer's disciplines, not a maximum: the
 * planning opens karate at 6 but the triathlon at 8, and there is no
 * "Karaté seul" offer, so a 6-year-old karateka has to buy the combined
 * formula. A floor of 8 there would flag a perfectly normal registration.
 * ⚠️ TO CONFIRM every season (prices and floors follow the planning).
 */
export const OFFERS = [
  {
    id: 'karate-mix-boxing',
    label: 'Karaté Shidokan + Shidokan Triathlon',
    disciplines: ['karate', 'mma', 'boxing'],
    priceAnnual: { youth: 265, adult: 330 },
    minAge: 6, // karaté 6 ∪ triathlon 8
  },
  {
    id: 'mix-boxing',
    label: 'Shidokan Triathlon',
    disciplines: ['mma', 'boxing'],
    priceAnnual: { youth: 265, adult: 280 },
    minAge: 8,
  },
  // Cardio-Budo: the planning prints no age band → no `minAge`, no warning, and
  // a single price per weekly session count.
  {
    id: 'cardio-1',
    label: 'Cardio Budo Kick-Boxing — 1 cours / semaine',
    disciplines: ['cardio'],
    priceAnnual: 180,
    sessions: 1,
  },
  {
    id: 'cardio-2',
    label: 'Cardio Budo Kick-Boxing — 2 cours / semaine',
    disciplines: ['cardio'],
    priceAnnual: 265,
    sessions: 2,
  },
  {
    id: 'cardio-3',
    label: 'Cardio Budo Kick-Boxing — 3 cours / semaine',
    disciplines: ['cardio'],
    priceAnnual: 320,
    sessions: 3,
  },
];

/**
 * Offer ids sold in a previous season, mapped to the discipline offer that
 * replaced them. `getOffer` resolves them, so a HelloAsso checkout opened just
 * before the switch still finds its offer when its webhook comes back.
 * Safe to drop once no pending checkout can reference them (a few days).
 */
export const OFFER_ID_ALIASES = {
  'karate-mix-boxing-enfant': 'karate-mix-boxing',
  'karate-mix-boxing-adulte': 'karate-mix-boxing',
  'mix-boxing-enfant': 'mix-boxing',
  'mix-boxing-adulte': 'mix-boxing',
};

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
    amount: 50,
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
 * Season identity, used to turn a birthdate into an age.
 * A season is named after the civil year it starts in (September 2026 opens the
 * "2026-2027" season). Registrations for the coming season open in July, so
 * July→December belongs to the current civil year and January→June to the
 * previous one — same window the late-season discount already assumes.
 */
export const SEASON = {
  firstMonth: 7, // July, 1-based
  timeZone: 'Europe/Paris',
};

/** Civil year the season in progress at `refDate` started in (August 2026 → 2026). */
export function seasonYear(refDate = new Date()) {
  const { year, month } = civilPartsIn(refDate, SEASON.timeZone);
  return month + 1 >= SEASON.firstMonth ? year : year - 1;
}

/**
 * Age of a member during the season, counted BY CIVIL YEAR (the club's rule):
 * the age they reach during the season's opening year, whatever their birthday.
 * A child born anywhere in 2020 is 6 for the 2026-2027 season.
 * Returns null if the birthdate is missing or malformed.
 */
export function ageInSeason(birthdate, refDate = new Date()) {
  const birth = parseCivilDate(birthdate);
  if (!birth) return null;
  return seasonYear(refDate) - birth.year;
}

/**
 * Tariff bands. The club charges a youth rate up to `YOUTH_TARIFF.maxAge`
 * INCLUDED, and the adult rate above. It deliberately does NOT match the age at
 * which members change class: the 14-17 already train with the adults, but the
 * club keeps them on the youth rate.
 * ⚠️ TO CONFIRM every season.
 */
export const YOUTH_TARIFF = { maxAge: 17 };

/**
 * Tariff bands, as shown to the member. No age range in the label on purpose:
 * the band is counted by civil year, so someone born late in the year is on the
 * adult tariff months before their 18th birthday — printing "18 ans et plus"
 * next to their fee would contradict the checklist, which reads legal minority.
 */
export const TARIFFS = {
  youth: { key: 'youth', label: 'Enfant / Ado' },
  adult: { key: 'adult', label: 'Adulte' },
};

/** Tariff band of a member aged `age` during the season; null if the age is unknown. */
export function tariffForAge(age) {
  if (age === null || age === undefined) return null;
  return age <= YOUTH_TARIFF.maxAge ? 'youth' : 'adult';
}

/** True when the offer's price depends on the member's age. */
export function offerIsAgeBanded(offer) {
  return Boolean(offer) && typeof offer.priceAnnual === 'object';
}

/**
 * Annual price of `offer` in EUROS for a member aged `age` during the season.
 * Returns null when the offer is age-banded and the age is unknown — the caller
 * has to ask for the birthdate rather than guess a band.
 */
export function offerPriceAnnual(offer, age) {
  if (!offer) return null;
  if (!offerIsAgeBanded(offer)) return offer.priceAnnual;
  const band = tariffForAge(age);
  return band ? offer.priceAnnual[band] : null;
}

/**
 * Advisory check: is the member below the age floor printed on the planning?
 * Returns null when they are old enough, when the offer has no floor
 * (Cardio-Budo) or when either input is missing — and a descriptive object
 * otherwise. There is no upper bound: an offer is never "too young" for someone.
 *
 * This NEVER blocks the registration. The club wants the member to keep the
 * final say (a precocious kid, a teen training with the adults…), so the form
 * only surfaces the mismatch as a notice.
 */
export function offerMinAgeWarning(offerId, birthdate, refDate = new Date()) {
  const offer = getOffer(offerId);
  if (offer?.minAge == null) return null;
  const age = ageInSeason(birthdate, refDate);
  if (age === null || age >= offer.minAge) return null;

  const year = seasonYear(refDate);
  return {
    age,
    seasonYear: year,
    minAge: offer.minAge,
    message:
      `L'adhérent aura ${age} ans en ${year}, alors que la formule « ${offer.label} » ` +
      `est ouverte à partir de ${offer.minAge} ans sur le planning. ` +
      `Vous pouvez tout de même poursuivre : le bureau du club validera l'inscription.`,
  };
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

/** Utility: find an offer by its id, resolving the ids of past seasons. */
export function getOffer(offerId) {
  const id = OFFER_ID_ALIASES[offerId] || offerId;
  return OFFERS.find((o) => o.id === id) || null;
}

/** An offer is a "contact discipline" if any of its disciplines is. */
export function offerIsContact(offer) {
  if (!offer) return false;
  return offer.disciplines.some((d) => DISCIPLINES[d]?.contact);
}
