// Configuration métier partagée entre le front (navigateur) et les fonctions (Node).
// Module ESM pur, sans dépendance : ne rien importer de spécifique à Node ici.
//
// ⚠️ VALEURS À CONFIRMER chaque saison — voir les commentaires « À CONFIRMER ».

/**
 * Disciplines proposées par le club.
 * `contact: true` déclenche l'exigence médicale renforcée (fond d'œil + ECG)
 * pour les MAJEURS — cf. note FFKarate (full-contact / Shido-Boxing / MMA).
 */
export const DISCIPLINES = {
  karate: { label: 'Karaté Shidokan', contact: false },
  mma: { label: 'Shido-Mix-Martial (MMA)', contact: true },
  boxing: { label: 'Shido-Boxing', contact: true },
  // À CONFIRMER : le Cardio Budo (fitness) implique-t-il fond d'œil + ECG ?
  // Par défaut considéré NON-contact (pas de sparring / compétition).
  cardio: { label: 'Cardio Budo Kick-Boxing', contact: false },
};

/**
 * Offres d'adhésion = ce qui est réellement vendu (reprend la campagne actuelle).
 * `priceAnnual` en euros (montant total sur la saison).
 * ⚠️ À CONFIRMER / COMPLÉTER : liste et tarifs repris de la capture HelloAsso
 * 2025-2026 ; ajouter un éventuel tarif « Karaté seul » s'il existe.
 */
export const OFFERS = [
  {
    id: 'karate-mix-boxing-enfant',
    label: 'Karaté Shidokan + Shido-Mix-Martial + Shido-Boxing — Enfant / Ado',
    category: 'enfant',
    disciplines: ['karate', 'mma', 'boxing'],
    priceAnnual: 265,
  },
  {
    id: 'karate-mix-boxing-adulte',
    label: 'Karaté Shidokan + Shido-Mix-Martial + Shido-Boxing — Adulte',
    category: 'adulte',
    disciplines: ['karate', 'mma', 'boxing'],
    priceAnnual: 330,
  },
  {
    id: 'mix-boxing-enfant',
    label: 'Shido-Mix-Martial + Shido-Boxing — Enfant / Ado',
    category: 'enfant',
    disciplines: ['mma', 'boxing'],
    priceAnnual: 265,
  },
  {
    id: 'mix-boxing-adulte',
    label: 'Shido-Mix-Martial + Shido-Boxing — Adulte',
    category: 'adulte',
    disciplines: ['mma', 'boxing'],
    priceAnnual: 280,
  },
  {
    id: 'cardio-1',
    label: 'Cardio Budo Kick-Boxing — 1 cours',
    category: 'na',
    disciplines: ['cardio'],
    priceAnnual: 180,
  },
  {
    id: 'cardio-2',
    label: 'Cardio Budo Kick-Boxing — 2 cours',
    category: 'na',
    disciplines: ['cardio'],
    priceAnnual: 265,
  },
  {
    id: 'cardio-3',
    label: 'Cardio Budo Kick-Boxing — 3 cours',
    category: 'na',
    disciplines: ['cardio'],
    priceAnnual: 320,
  },
];

/** Plans de paiement supportés par le Checkout HelloAsso. */
export const PAYMENT_PLANS = {
  '1x': { label: 'Paiement en 1 fois', installments: 1 },
  '3x': { label: 'Paiement en 3 fois', installments: 3 },
};

/**
 * Aides financières déduites en ligne.
 * `amount` en euros. ⚠️ À CONFIRMER chaque saison (les barèmes évoluent).
 */
export const AIDS = {
  passsport: {
    label: "Pass'Sport",
    amount: 70, // À CONFIRMER (Pass'Sport 2025-2026)
    requiresCode: true,
    column: "PASS'SPORT",
  },
  peps: {
    label: 'PEPS',
    amount: 50, // À CONFIRMER (barème VBSL / PEPS)
    requiresCode: true,
    column: 'PEPS',
  },
};

/**
 * Réduction famille — forfait selon le NOMBRE TOTAL de membres du foyer.
 * Source : formulaire Jotform 2025-2026.
 *   2 membres → −50 € · 3 → −70 € · 4 (et +) → −100 €
 *
 * ⚠️ Ce forfait s'applique UNE FOIS pour toute la famille. Il ne peut donc être
 * appliqué correctement que sur une commande couvrant TOUS les membres (un seul
 * paiement pour N adhérents). En flux « un adhérent = un paiement », laisser
 * `enabled: false` pour éviter de déduire le forfait plusieurs fois.
 */
export const FAMILY_DISCOUNT = {
  enabled: true,
  // Forfait CUMULÉ pour toute la famille selon le nombre total de membres inscrits.
  // Appliqué une seule fois, réparti de façon incrémentale au fil des inscriptions
  // (1 adhérent = 1 formulaire ; on demande combien de membres sont déjà inscrits).
  tiers: [
    { members: 2, total: 50 },
    { members: 3, total: 70 },
    { members: 4, total: 100 }, // 4 membres ou plus (plafond)
  ],
};

/** Forfait famille CUMULÉ pour `members` membres au total (0 / 50 / 70 / 100). */
export function familyDiscountTotal(members) {
  let total = 0;
  for (const t of FAMILY_DISCOUNT.tiers) if (members >= t.members) total = t.total;
  return total;
}

/**
 * Remise à appliquer pour UN nouvel adhérent, sachant combien de membres de sa
 * famille sont DÉJÀ inscrits. = cumul(après) − cumul(avant), afin que la remise
 * totale de la famille corresponde au barème et ne soit comptée qu'une fois.
 */
export function familyIncrementalDiscount(alreadyRegistered) {
  if (!FAMILY_DISCOUNT.enabled) return 0;
  const before = Math.max(0, Math.trunc(alreadyRegistered || 0));
  return familyDiscountTotal(before + 1) - familyDiscountTotal(before);
}

/**
 * Grades Shidokan (liste déroulante conditionnelle à la section Karaté).
 * ⚠️ À CONFIRMER : liste exacte des grades du club.
 */
export const GRADES_SHIDOKAN = [
  'Ceinture blanche',
  'Ceinture jaune',
  'Ceinture orange',
  'Ceinture verte',
  'Ceinture bleue',
  'Ceinture marron',
  'Ceinture noire',
];

/** Motivations proposées (radio conditionnel à la section Karaté). */
export const MOTIVATIONS = [
  'Sport Loisir',
  'Karaté loisir ceinture noire',
  'Compétition',
];

/**
 * En-têtes EXACTS du Google Sheet, dans l'ordre.
 * ⚠️ NE PAS RÉORDONNER : l'écriture est positionnelle (des en-têtes sont en
 * double, ex. « Numéro de téléphone »), on ne peut donc pas mapper par nom.
 */
export const SHEET_COLUMNS = [
  'Submission Date',
  'Nouvel adhérent',
  'Prénom - Nom - Prénom',
  'Prénom - Nom - Nom de famille',
  'Date de naissance',
  'Lieu de naissance',
  'Nom des parents (si différent de l\'enfant)',
  'Adresse - Numéro et rue',
  'Adresse - Complément d\'adresse',
  'Adresse - Ville',
  'Adresse - Code Postal',
  'Adresse - Pays',
  'Email',
  'Numéro de téléphone',
  'Acceptez vous de paraitre sur les réseaux sociaux (dans le cadre des manifestations du club)',
  'Prénom - Nom (contact de confiance) - Prénom',
  'Prénom - Nom (contact de confiance) - Nom de famille',
  'Numéro de téléphone', // contact de confiance
  'Section',
  'Quelles sont vos motivations ?',
  'Grade Shidokan',
  'Cardio-Budo - Sélectionnez votre ou vos jours',
  'Mode de règlement',
  'Documents coupon sport',
  'Règlement intérieur',
  'RGPD consent',
  'CERTIF MÉD',
  'ATTESTATION MINEURS COMPET',
  'PHOTO',
  'PAIEMENT',
  'SIKADA',
  'PEPS',
  "PASS'SPORT",
  'PASSPORT SHIDOKAN',
  'REGLEMENT',
  'ABANDON',
  'PRESENCE COURS',
  'Grade',
  'Nouveau grade',
];

/** Jours proposés pour le Cardio Budo (À CONFIRMER avec le planning du club). */
export const CARDIO_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Utilitaire : retrouver une offre par son id. */
export function getOffer(offerId) {
  return OFFERS.find((o) => o.id === offerId) || null;
}

/** Une offre est « discipline de contact » si l'une de ses disciplines l'est. */
export function offerIsContact(offer) {
  if (!offer) return false;
  return offer.disciplines.some((d) => DISCIPLINES[d]?.contact);
}
