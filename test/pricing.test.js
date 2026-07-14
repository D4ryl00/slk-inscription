import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIDS, FORM_COLUMNS, familyIncrementalDiscount } from '../src/shared/config.js';
import { buildInstallments, computePrice } from '../src/shared/pricing.js';
import { buildSheetRow } from '../src/shared/sheet-row.js';

test('base price of an offer', () => {
  const p = computePrice({ offerId: 'karate-mix-boxing-adulte', paymentPlan: '1x' });
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000); // 330 €
});

test('aid deduction with code', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing-adulte',
    paymentPlan: '1x',
    aid: { type: 'passsport', code: 'ABC123' },
  });
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000 - AIDS.passsport.amount * 100);
  assert.equal(p.aidApplied.code, 'ABC123');
});

test('aid requiring a code without code → error (Pass\'Sport)', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aid: { type: 'passsport', code: '' },
  });
  assert.equal(p.ok, false);
});

test('PEPS without code → OK (the code is no longer asked online)', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aid: { type: 'peps', code: '' },
  });
  assert.equal(p.ok, true);
  assert.equal(p.aidApplied.amountCents, AIDS.peps.amount * 100);
});

test('unknown offer → error', () => {
  const p = computePrice({ offerId: 'nope', paymentPlan: '1x' });
  assert.equal(p.ok, false);
});

test('incremental family discount (cumulative = scale, applied once)', () => {
  assert.equal(familyIncrementalDiscount(0), 0);   // 1st member
  assert.equal(familyIncrementalDiscount(1), 50);  // 2nd → cumulative 50
  assert.equal(familyIncrementalDiscount(2), 20);  // 3rd → cumulative 70
  assert.equal(familyIncrementalDiscount(3), 30);  // 4th → cumulative 100
  assert.equal(familyIncrementalDiscount(4), 0);   // 5th → cap
  const cumul4 = [0, 1, 2, 3].reduce((a, n) => a + familyIncrementalDiscount(n), 0);
  assert.equal(cumul4, 100);
});

test('computePrice applies the incremental family discount', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x', familyAlreadyRegistered: 1 });
  assert.equal(p.familyDiscountCents, 5000);       // 2nd member → −50 €
  assert.equal(p.totalCents, 18000 - 5000);        // 180 € − 50 €
});

test('aid values: Pass\'Sport 70 €, PEPS 30 €', () => {
  assert.equal(AIDS.passsport.amount, 70);
  assert.equal(AIDS.peps.amount, 30);
});

test('offline payments: deducted from the card amount', () => {
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

test('100% offline: cbAmount = 0', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    offlinePayments: [{ method: 'cheque', amount: 180 }],
  });
  assert.equal(p.ok, true);
  assert.equal(p.cbAmountCents, 0);
});

test('offline greater than total → error', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    offlinePayments: [{ method: 'cheque', amount: 500 }],
  });
  assert.equal(p.ok, false);
});

test('new-member fee: +6 € when nouvelAdherent = Oui', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing-enfant',
    paymentPlan: '1x',
    nouvelAdherent: 'Oui',
  });
  assert.equal(p.newMemberFeeCents, 600);
  assert.equal(p.totalCents, 26500 + 600);
});

test('new-member fee: not added for a renewal (Non)', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing-enfant',
    paymentPlan: '1x',
    nouvelAdherent: 'Non',
  });
  assert.equal(p.newMemberFeeCents, 0);
  assert.equal(p.totalCents, 26500);
});

test('new-member fee: applies to any discipline (cardio)', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x', nouvelAdherent: 'Oui' });
  assert.equal(p.newMemberFeeCents, 600);
  assert.equal(p.totalCents, 18000 + 600);
});

test('licence breakdown: FFK 39 € + Shidokan 20 € on a karate offer', () => {
  const p = computePrice({ offerId: 'karate-mix-boxing-adulte', paymentPlan: '1x' });
  const labels = p.licenseFees.map((l) => `${l.label}:${l.amountCents}`);
  assert.deepEqual(labels, ['licence FFK:3900', 'licence Shidokan:2000']);
});

test('licence breakdown: Cardio-Budo has FFK only (no Shidokan)', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' });
  const labels = p.licenseFees.map((l) => l.label);
  assert.deepEqual(labels, ['licence FFK']);
});

test('licence fees are informational: they do not change the total', () => {
  const p = computePrice({ offerId: 'karate-mix-boxing-adulte', paymentPlan: '1x' });
  assert.equal(p.totalCents, 33000); // still the base price, licences included in it
});

test('late-season discount: none before Nov 1st', () => {
  const p = computePrice(
    { offerId: 'cardio-1', paymentPlan: '1x' },
    new Date('2026-10-31T12:00:00Z'),
  );
  assert.equal(p.lateDiscountCents, 0);
  assert.equal(p.totalCents, 18000);
});

test('late-season discount: −20 € in November', () => {
  const p = computePrice(
    { offerId: 'cardio-1', paymentPlan: '1x' },
    new Date('2026-11-15T12:00:00Z'),
  );
  assert.equal(p.lateDiscountCents, 2000);
  assert.equal(p.totalCents, 18000 - 2000);
});

test('late-season discount: −40 € in December, −60 € in January', () => {
  const dec = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2026-12-05T12:00:00Z'));
  assert.equal(dec.lateDiscountCents, 4000);
  const jan = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2027-01-10T12:00:00Z'));
  assert.equal(jan.lateDiscountCents, 6000);
});

test('late-season discount: the palier flips at Paris midnight, not UTC', () => {
  // 2026-10-31 22:30 UTC = still 23:30 in Paris (CET, UTC+1) → before Nov 1st → 0.
  const before = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2026-10-31T22:30:00Z'));
  assert.equal(before.lateDiscountCents, 0);
  // 2026-10-31 23:30 UTC = 00:30 on Nov 1st in Paris → first −20 € step.
  const after = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2026-10-31T23:30:00Z'));
  assert.equal(after.lateDiscountCents, 2000);
});

test('late-season discount + new-member fee stack correctly', () => {
  const p = computePrice(
    { offerId: 'cardio-1', paymentPlan: '1x', nouvelAdherent: 'Oui' },
    new Date('2026-11-15T12:00:00'),
  );
  // 180 − 20 (late) + 6 (new member) = 166
  assert.equal(p.totalCents, 18000 - 2000 + 600);
});

test('buildSheetRow: no passeport columns anymore, "Nouvel adhérent" flags the fee', () => {
  const row = buildSheetRow(
    { offerId: 'karate-mix-boxing-enfant', nouvelAdherent: 'Oui' },
    { netTotalCents: 27100 },
  );
  assert.equal(row.length, FORM_COLUMNS.length);
  assert.equal(FORM_COLUMNS.includes('Frais nouvel adhérent'), false);
  assert.equal(FORM_COLUMNS.includes('Passeport FFK'), false);
  assert.equal(FORM_COLUMNS.includes('Passeport Shidokan'), false);
  assert.equal(row[FORM_COLUMNS.indexOf('Nouvel adhérent')], 'Oui');
});

test('3x installments: exact sum = total', () => {
  const { terms, initialAmount } = buildInstallments(26500, '3x');
  assert.equal(terms.length, 3);
  const sum = terms.reduce((a, t) => a + t.amount, 0);
  assert.equal(sum, 26500);
  assert.equal(initialAmount, terms[0].amount);
  // the rounding remainder goes on the first installment
  assert.ok(terms[0].amount >= terms[1].amount);
});

test('buildSheetRow: right number of columns and placement of key fields', () => {
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
  // "office" columns NOT managed by the code (absent from FORM_COLUMNS)
  assert.equal(FORM_COLUMNS.includes('CERTIF MÉD'), false);
});
