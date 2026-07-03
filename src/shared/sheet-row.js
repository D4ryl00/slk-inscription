// Construit la ligne du Google Sheet dans l'ORDRE EXACT de FORM_COLUMNS.
// Le site n'écrit QUE les colonnes issues du formulaire (bloc contigu dès la
// colonne A). Écriture positionnelle (des en-têtes sont en double) → tableau.

import { AIDS, FORM_COLUMNS, getOffer } from './config.js';
import { formatEuros } from './pricing.js';

const oui = (b) => (b ? 'Oui' : 'Non');

/**
 * @param {object} s submission envoyée par le front
 * @param {object} pay récapitulatif de paiement :
 *   { date, netTotalCents, onlineAmountCents, onlinePaymentId, onlinePlanLabel,
 *     offlinePayments:[{label,amountCents}], offlineTotalCents, familyDiscountCents }
 * @returns {(string|number)[]} exactement FORM_COLUMNS.length valeurs
 */
export function buildSheetRow(s, pay) {
  const offer = getOffer(s.offerId);
  const sectionLabel = offer ? offer.label : s.offerId || '';
  const addr = s.adresse || {};
  const cc = s.contactConfiance || {};
  const aid = s.aid || {};
  const p = pay || {};
  const offline = p.offlinePayments || [];

  // Résumé des moyens de règlement choisis.
  const methods = [];
  if (p.onlineAmountCents > 0) methods.push('CB (HelloAsso)');
  for (const o of offline) methods.push(o.label);
  const modeReglement = methods.length ? methods.join(' + ') : 'Aucun (cotisation nulle)';

  // Total cotisation (avec mention de la remise famille si elle s'applique).
  const totalCell =
    formatEuros(p.netTotalCents || 0) +
    (p.familyDiscountCents ? ` (remise famille −${formatEuros(p.familyDiscountCents)} incluse)` : '');

  // Montant réellement payé en ligne.
  const paiementCell =
    p.onlineAmountCents > 0
      ? `En ligne ${formatEuros(p.onlineAmountCents)} (${p.onlinePlanLabel || 'CB'})` +
        (p.onlinePaymentId ? ` — paiement ${p.onlinePaymentId}` : '')
      : 'Aucun paiement en ligne';

  // Détail des règlements hors ligne (à encaisser au bureau).
  const horsLigneCell = offline.length
    ? offline.map((o) => `${o.label} : ${formatEuros(o.amountCents)}`).join(' ; ') +
      ' — à encaisser au bureau'
    : '';

  const aidCell = (type) => {
    if (aid.type !== type) return '';
    const a = AIDS[type];
    return `Déduit ${a ? a.amount + ' €' : ''} — code ${aid.code || '?'} — À VÉRIFIER`;
  };

  // Ordre = FORM_COLUMNS.
  const row = [
    p.date || new Date().toISOString(),                    // Submission Date
    s.nouvelAdherent || '',                                // Nouvel adhérent
    s.prenom || '',                                        // Prénom
    s.nom || '',                                           // Nom de famille
    s.dateNaissance || '',                                 // Date de naissance
    s.lieuNaissance || '',                                 // Lieu de naissance
    s.nomParents || '',                                    // Nom des parents
    addr.numeroRue || '',                                  // Adresse - Numéro et rue
    addr.complement || '',                                 // Adresse - Complément
    addr.ville || '',                                      // Adresse - Ville
    addr.etatRegion || '',                                 // Adresse - État/Région
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
    modeReglement,                                         // Mode de règlement
    totalCell,                                             // Total cotisation
    paiementCell,                                          // PAIEMENT (payé en ligne)
    horsLigneCell,                                         // Règlements hors ligne
    aidCell('peps'),                                       // PEPS
    aidCell('passsport'),                                  // PASS'SPORT
    s.reglementInterieur ? 'Accepté' : '',                 // Règlement intérieur
    s.rgpdConsent ? `Accepté le ${new Date().toISOString().slice(0, 10)}` : '', // RGPD consent
  ];

  if (row.length !== FORM_COLUMNS.length) {
    throw new Error(
      `buildSheetRow: ${row.length} valeurs pour ${FORM_COLUMNS.length} colonnes.`,
    );
  }
  return row;
}

/** Index (0-based) de la colonne PAIEMENT, pour la déduplication. */
export const PAIEMENT_COL_INDEX = FORM_COLUMNS.indexOf('PAIEMENT');
