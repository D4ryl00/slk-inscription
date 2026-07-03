// Construit la ligne du Google Sheet dans l'ORDRE EXACT de SHEET_COLUMNS.
// Écriture positionnelle (des en-têtes sont en double) → on renvoie un tableau,
// jamais un objet indexé par nom.

import { AIDS, SHEET_COLUMNS, getOffer } from './config.js';
import { formatEuros } from './pricing.js';

const oui = (b) => (b ? 'Oui' : 'Non');

/**
 * @param {object} s submission envoyée par le front
 * @param {object} pay { date, amountCents, planLabel, paymentId }
 * @returns {(string|number)[]} exactement SHEET_COLUMNS.length valeurs
 */
export function buildSheetRow(s, pay) {
  const offer = getOffer(s.offerId);
  const sectionLabel = offer ? offer.label : s.offerId || '';
  const addr = s.adresse || {};
  const cc = s.contactConfiance || {};
  const aid = s.aid || {};

  const paiementCell = pay
    ? `Payé ${formatEuros(pay.amountCents)} (${pay.planLabel}) — paiement ${pay.paymentId}`
    : '';

  const aidCell = (type) => {
    if (aid.type !== type) return '';
    const a = AIDS[type];
    return `Déduit ${a ? a.amount + ' €' : ''} — code ${aid.code || '?'} — À VÉRIFIER`;
  };

  // Ordre = SHEET_COLUMNS. Les colonnes « bureau » restent vides ('').
  const row = [
    pay?.date || new Date().toISOString(),                 // Submission Date
    s.nouvelAdherent || '',                                // Nouvel adhérent
    s.prenom || '',                                        // Prénom
    s.nom || '',                                           // Nom de famille
    s.dateNaissance || '',                                 // Date de naissance
    s.lieuNaissance || '',                                 // Lieu de naissance
    s.nomParents || '',                                    // Nom des parents
    addr.numeroRue || '',                                  // Adresse - Numéro et rue
    addr.complement || '',                                 // Adresse - Complément
    addr.ville || '',                                      // Adresse - Ville
    addr.codePostal || '',                                 // Adresse - Code Postal
    addr.pays || '',                                       // Adresse - Pays
    s.email || '',                                         // Email
    s.telephone || '',                                     // Numéro de téléphone
    oui(s.reseauxSociaux === 'Oui' || s.reseauxSociaux === true), // Réseaux sociaux
    cc.prenom || '',                                       // Contact confiance - Prénom
    cc.nom || '',                                          // Contact confiance - Nom
    cc.telephone || '',                                    // Contact confiance - Téléphone
    sectionLabel,                                          // Section
    s.motivations || '',                                   // Motivations
    s.gradeShidokan || '',                                 // Grade Shidokan
    Array.isArray(s.cardioJours) ? s.cardioJours.join(', ') : (s.cardioJours || ''), // Cardio jours
    pay?.planLabel || '',                                  // Mode de règlement
    '',                                                    // Documents coupon sport (bureau)
    s.reglementInterieur ? 'Accepté' : '',                 // Règlement intérieur
    s.rgpdConsent ? `Accepté le ${new Date().toISOString().slice(0, 10)}` : '', // RGPD consent
    '',                                                    // CERTIF MÉD (bureau)
    '',                                                    // ATTESTATION MINEURS COMPET (bureau)
    '',                                                    // PHOTO (bureau)
    paiementCell,                                          // PAIEMENT
    '',                                                    // SIKADA (bureau)
    aidCell('peps'),                                       // PEPS
    aidCell('passsport'),                                  // PASS'SPORT
    '',                                                    // PASSPORT SHIDOKAN (bureau)
    '',                                                    // REGLEMENT (bureau)
    '',                                                    // ABANDON (bureau)
    '',                                                    // PRESENCE COURS (bureau)
    '',                                                    // Grade (bureau)
    '',                                                    // Nouveau grade (bureau)
  ];

  // Garde-fou : la ligne doit avoir exactement le bon nombre de colonnes.
  if (row.length !== SHEET_COLUMNS.length) {
    throw new Error(
      `buildSheetRow: ${row.length} valeurs pour ${SHEET_COLUMNS.length} colonnes.`,
    );
  }
  return row;
}

/** Index (0-based) de la colonne PAIEMENT, pour la déduplication. */
export const PAIEMENT_COL_INDEX = SHEET_COLUMNS.indexOf('PAIEMENT');
