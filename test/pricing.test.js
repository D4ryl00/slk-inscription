import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIDS, FORM_COLUMNS, familyIncrementalDiscount } from '../src/shared/config.js';
import { buildInstallments, computePrice } from '../src/shared/pricing.js';
import { buildSheetRow } from '../src/shared/sheet-row.js';

test('prix de base d\'une offre', () => {
  const p = computePrice({ offerId: 'karate-mix-boxing-adulte', paymentPlan: '1x' });
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000); // 330 €
});

test('déduction d\'aide avec code', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing-adulte',
    paymentPlan: '1x',
    aid: { type: 'passsport', code: 'ABC123' },
  });
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000 - AIDS.passsport.amount * 100);
  assert.equal(p.aidApplied.code, 'ABC123');
});

test('aide à code obligatoire sans code → erreur (Pass\'Sport)', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aid: { type: 'passsport', code: '' },
  });
  assert.equal(p.ok, false);
});

test('PEPS sans code → OK (le code n\'est plus demandé en ligne)', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aid: { type: 'peps', code: '' },
  });
  assert.equal(p.ok, true);
  assert.equal(p.aidApplied.amountCents, AIDS.peps.amount * 100);
});

test('offre inconnue → erreur', () => {
  const p = computePrice({ offerId: 'nope', paymentPlan: '1x' });
  assert.equal(p.ok, false);
});

test('réduction famille incrémentale (cumul = barème, appliqué une fois)', () => {
  assert.equal(familyIncrementalDiscount(0), 0);   // 1er membre
  assert.equal(familyIncrementalDiscount(1), 50);  // 2e → cumul 50
  assert.equal(familyIncrementalDiscount(2), 20);  // 3e → cumul 70
  assert.equal(familyIncrementalDiscount(3), 30);  // 4e → cumul 100
  assert.equal(familyIncrementalDiscount(4), 0);   // 5e → plafond
  const cumul4 = [0, 1, 2, 3].reduce((a, n) => a + familyIncrementalDiscount(n), 0);
  assert.equal(cumul4, 100);
});

test('computePrice applique la remise famille incrémentale', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x', familyAlreadyRegistered: 1 });
  assert.equal(p.familyDiscountCents, 5000);       // 2e membre → −50 €
  assert.equal(p.totalCents, 18000 - 5000);        // 180 € − 50 €
});

test('valeurs des aides : Pass\'Sport 70 €, PEPS 30 €', () => {
  assert.equal(AIDS.passsport.amount, 70);
  assert.equal(AIDS.peps.amount, 30);
});

test('règlements hors ligne : déduits du montant CB', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing-adulte',
    paymentPlan: '1x',
    offlinePayments: [{ method: 'cheque', amount: 100 }, { method: 'especes', amount: 30 }],
  });
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000);
  assert.equal(p.offlineTotalCents, 13000);
  assert.equal(p.cbAmountCents, 33000 - 13000);
});

test('100 % hors ligne : cbAmount = 0', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    offlinePayments: [{ method: 'cheque', amount: 180 }],
  });
  assert.equal(p.ok, true);
  assert.equal(p.cbAmountCents, 0);
});

test('hors ligne supérieur au total → erreur', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    offlinePayments: [{ method: 'cheque', amount: 500 }],
  });
  assert.equal(p.ok, false);
});

test('échéances 3x : somme exacte = total', () => {
  const { terms, initialAmount } = buildInstallments(26500, '3x');
  assert.equal(terms.length, 3);
  const sum = terms.reduce((a, t) => a + t.amount, 0);
  assert.equal(sum, 26500);
  assert.equal(initialAmount, terms[0].amount);
  // le reliquat d'arrondi va sur la 1re échéance
  assert.ok(terms[0].amount >= terms[1].amount);
});

test('buildSheetRow : bon nombre de colonnes et placement des champs clés', () => {
  const submission = {
    nouvelAdherent: 'Oui',
    prenom: 'Alice', nom: 'Martin',
    dateNaissance: '2015-05-01', lieuNaissance: 'Nice',
    adresse: { ville: 'Saint-Laurent-du-Var' },
    email: 'a@example.com', telephone: '0600000000',
    reseauxSociaux: 'Oui',
    contactConfiance: { prenom: 'Bob', nom: 'Martin', telephone: '0611111111' },
    offerId: 'karate-mix-boxing-enfant',
    reglementInterieur: true, rgpdConsent: true,
    aid: { type: 'passsport', code: 'PS-42' },
  };
  const pay = {
    date: '2026-07-04T10:00:00Z',
    netTotalCents: 19500,
    onlineAmountCents: 19500,
    onlinePaymentId: '999',
    onlinePlanLabel: 'CB 1x',
    offlinePayments: [],
    offlineTotalCents: 0,
    familyDiscountCents: 0,
  };
  const row = buildSheetRow(submission, pay);

  assert.equal(row.length, FORM_COLUMNS.length);
  assert.equal(row[FORM_COLUMNS.indexOf('Email')], 'a@example.com');
  assert.equal(row[FORM_COLUMNS.indexOf('Section')].includes('Karaté'), true);
  assert.equal(row[FORM_COLUMNS.indexOf('Paiement en ligne')].includes('999'), true);
  assert.equal(row[FORM_COLUMNS.indexOf("Aide Pass'Sport")].includes('PS-42'), true);
  // colonnes « bureau » NON gérées par le code (absentes de FORM_COLUMNS)
  assert.equal(FORM_COLUMNS.includes('CERTIF MÉD'), false);
});
