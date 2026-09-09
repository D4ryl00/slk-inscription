import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIDS, FORM_COLUMNS, familyIncrementalDiscount } from '../src/shared/config.js';
import { buildInstallments, computePrice, formatEuros } from '../src/shared/pricing.js';
import { PAIEMENT_COL_INDEX, buildSheetRow, paymentCellMatches } from '../src/shared/sheet-row.js';

// Inside the 2026-2027 season, before the late-season discount opens (Nov 1st),
// so the ages below stay stable whenever the suite is run.
const AUG_2026 = new Date('2026-08-11T12:00:00Z');
const ADULT = '1990-04-12'; // 36 in the 2026 season
const CHILD = '2015-04-12'; // 11 in the 2026 season

test('base price of an offer', () => {
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: ADULT },
    AUG_2026,
  );
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000); // 330 €
});

test('an age-banded offer cannot be priced without a birthdate', () => {
  const p = computePrice({ offerId: 'karate-mix-boxing', paymentPlan: '1x' }, AUG_2026);
  assert.equal(p.ok, false);
  assert.match(p.error, /date de naissance/i);
});

test('the youth tariff applies below 18', () => {
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: CHILD },
    AUG_2026,
  );
  assert.equal(p.ok, true);
  assert.equal(p.tariff, 'youth');
  assert.equal(p.baseCents, 26500); // 265 €
});

test('a teenager of 14 to 17 pays the youth tariff', () => {
  // They train with the adults, but the club keeps them on the youth rate.
  for (const age of [14, 15, 16, 17]) {
    const p = computePrice(
      { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: `${2026 - age}-09-30` },
      AUG_2026,
    );
    assert.equal(p.ok, true, `age ${age}`);
    assert.equal(p.tariff, 'youth', `age ${age}`);
    assert.equal(p.totalCents, 26500, `age ${age}`);
  }
});

test('the adult tariff starts at 18', () => {
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: '2008-12-31' },
    AUG_2026,
  );
  assert.equal(p.tariff, 'adult');
  assert.equal(p.totalCents, 33000);
});

test('the Shidokan Triathlon has its own adult price', () => {
  const youth = computePrice(
    { offerId: 'mix-boxing', paymentPlan: '1x', dateNaissance: CHILD },
    AUG_2026,
  );
  const adult = computePrice(
    { offerId: 'mix-boxing', paymentPlan: '1x', dateNaissance: ADULT },
    AUG_2026,
  );
  assert.equal(youth.totalCents, 26500);
  assert.equal(adult.totalCents, 28000);
});

test('Cardio-Budo prices without any birthdate, and has no tariff band', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, AUG_2026);
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 18000);
  assert.equal(p.tariff, null);
});

test('a past-season offer id is still priced from the birthdate', () => {
  // A checkout opened just before the switch comes back through the webhook.
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: ADULT },
    AUG_2026,
  );
  assert.equal(p.ok, true);
  assert.equal(p.offer.id, 'karate-mix-boxing');
  assert.equal(p.totalCents, 33000); // the birthdate wins over the old id's category
});

test('aid deduction with code', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    aids: [{ type: 'passsport', code: 'ABC123' }],
  }, AUG_2026);
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000 - AIDS.passsport.amount * 100);
  assert.equal(p.aidsApplied[0].code, 'ABC123');
});

test('aid requiring a code without code → error (Pass\'Sport)', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aids: [{ type: 'passsport', code: '' }],
  });
  assert.equal(p.ok, false);
});

test('PEPS without code → OK (the code is no longer asked online)', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aids: [{ type: 'peps', code: '' }],
  });
  assert.equal(p.ok, true);
  assert.equal(p.aidsApplied[0].amountCents, AIDS.peps.amount * 100);
});

// --- Cumulative aids (a member may hold both PEPS and Pass'Sport) -----------

test("Pass'Sport and PEPS cumulate: both amounts are deducted", () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    aids: [{ type: 'passsport', code: 'ABC123' }, { type: 'peps' }],
  }, AUG_2026);
  assert.equal(p.ok, true);
  assert.equal(p.aidCents, (AIDS.passsport.amount + AIDS.peps.amount) * 100);
  assert.equal(p.totalCents, 33000 - 8000);
});

test('each cumulated aid is reported on its own, with its code', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    aids: [{ type: 'passsport', code: 'ABC123' }, { type: 'peps' }],
  }, AUG_2026);
  assert.deepEqual(p.aidsApplied.map((a) => a.type), ['passsport', 'peps']);
  assert.equal(p.aidsApplied[0].code, 'ABC123');
  assert.equal(p.aidsApplied[1].amountCents, AIDS.peps.amount * 100);
});

test('no aid selected → nothing deducted, empty list', () => {
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: ADULT, aids: [] },
    AUG_2026,
  );
  assert.equal(p.ok, true);
  assert.equal(p.aidCents, 0);
  assert.deepEqual(p.aidsApplied, []);
  assert.equal(p.totalCents, 33000);
});

test('cumulated aids over the fee → total floored at 0, never negative', () => {
  // Late in the season a 180 € offer is already discounted down near the 80 €
  // of cumulated aid; the two together must not turn the total negative.
  const JUN_2027 = new Date('2027-06-11T12:00:00Z');
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    familyAlreadyRegistered: 1, // −50 € on top
    aids: [{ type: 'passsport', code: 'ABC123' }, { type: 'peps' }],
  }, JUN_2027);
  assert.equal(p.ok, true);
  assert.equal(p.aidCents, 8000);
  assert.equal(p.lateDiscountCents + p.familyDiscountCents + p.aidCents > 18000, true);
  assert.equal(p.totalCents, 0);
});

test('a cumulated selection still requires the Pass\'Sport code', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    aids: [{ type: 'passsport', code: '' }, { type: 'peps' }],
  }, AUG_2026);
  assert.equal(p.ok, false);
  assert.equal(p.error.includes("Pass'Sport"), true);
});

test('the same aid listed twice is counted once', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    aids: [{ type: 'peps' }, { type: 'peps' }],
  }, AUG_2026);
  assert.equal(p.aidCents, AIDS.peps.amount * 100);
});

test('a submission stored before cumulation (single `aid`) is still priced', () => {
  // The webhook replays blobs written days earlier, under the previous shape.
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    aid: { type: 'passsport', code: 'ABC123' },
  }, AUG_2026);
  assert.equal(p.ok, true);
  assert.equal(p.totalCents, 33000 - AIDS.passsport.amount * 100);
  assert.equal(p.aidsApplied[0].code, 'ABC123');
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

test('aid values: Pass\'Sport 50 €, PEPS 30 €', () => {
  assert.equal(AIDS.passsport.amount, 50);
  assert.equal(AIDS.peps.amount, 30);
});

test('offline payments: deducted from the card amount', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: ADULT,
    offlinePayments: [{ method: 'cheque', amount: 100 }, { method: 'especes', amount: 30 }],
  }, AUG_2026);
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
  // Tagged so the form can show the message under the amounts, not only in the summary.
  assert.equal(p.errorField, 'offlinePayments');
});

test('new-member fee: +6 € when nouvelAdherent = Oui', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: CHILD,
    nouvelAdherent: 'Oui',
  }, AUG_2026);
  assert.equal(p.newMemberFeeCents, 600);
  assert.equal(p.totalCents, 26500 + 600);
});

test('new-member fee: not added for a renewal (Non)', () => {
  const p = computePrice({
    offerId: 'karate-mix-boxing',
    paymentPlan: '1x',
    dateNaissance: CHILD,
    nouvelAdherent: 'Non',
  }, AUG_2026);
  assert.equal(p.newMemberFeeCents, 0);
  assert.equal(p.totalCents, 26500);
});

test('new-member fee: applies to any discipline (cardio)', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x', nouvelAdherent: 'Oui' });
  assert.equal(p.newMemberFeeCents, 600);
  assert.equal(p.totalCents, 18000 + 600);
});

test('licence breakdown: FFK 39 € + Shidokan 20 € on a karate offer', () => {
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: ADULT },
    AUG_2026,
  );
  const labels = p.licenseFees.map((l) => `${l.label}:${l.amountCents}`);
  assert.deepEqual(labels, ['licence FFK:3900', 'licence Shidokan:2000']);
});

test('licence breakdown: Cardio-Budo has FFK only (no Shidokan)', () => {
  const p = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' });
  const labels = p.licenseFees.map((l) => l.label);
  assert.deepEqual(labels, ['licence FFK']);
});

test('licence fees are informational: they do not change the total', () => {
  const p = computePrice(
    { offerId: 'karate-mix-boxing', paymentPlan: '1x', dateNaissance: ADULT },
    AUG_2026,
  );
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

test('late-season discount: maxes out in June then stops after the season ends', () => {
  // June 2027 = 8th step (Nov→Jun) → −160 €, capped by the offer floor at 0.
  const june = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2027-06-15T12:00:00Z'));
  assert.equal(june.lateDiscountCents, 16000);
  assert.equal(june.totalCents, 18000 - 16000);
  // July 2027 = next season's early registrations (still the old config) → no discount.
  const july = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2027-07-01T12:00:00Z'));
  assert.equal(july.lateDiscountCents, 0);
  assert.equal(july.totalCents, 18000);
  // September 2027 (new season, before its November) → still no discount.
  const sept = computePrice({ offerId: 'cardio-1', paymentPlan: '1x' }, new Date('2027-09-10T12:00:00Z'));
  assert.equal(sept.lateDiscountCents, 0);
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
    { offerId: 'karate-mix-boxing', nouvelAdherent: 'Oui' },
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
    offerId: 'karate-mix-boxing',
    reglementInterieur: true, rgpdConsent: true,
    aids: [{ type: 'passsport', code: 'PS-42' }],
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

test('buildSheetRow: cumulated aids fill both aid columns', () => {
  const row = buildSheetRow(
    {
      offerId: 'karate-mix-boxing',
      aids: [{ type: 'passsport', code: 'PS-42' }, { type: 'peps' }],
    },
    { netTotalCents: 25000, onlineAmountCents: 25000, onlinePaymentId: '1', offlinePayments: [] },
  );
  assert.equal(row[FORM_COLUMNS.indexOf("Aide Pass'Sport")].includes('PS-42'), true);
  assert.equal(row[FORM_COLUMNS.indexOf('Aide PEPS')].includes('30 €'), true);
});

test('buildSheetRow: an aid not selected leaves its column empty', () => {
  const row = buildSheetRow(
    { offerId: 'karate-mix-boxing', aids: [{ type: 'peps' }] },
    { netTotalCents: 25000, onlineAmountCents: 25000, onlinePaymentId: '1', offlinePayments: [] },
  );
  assert.equal(row[FORM_COLUMNS.indexOf("Aide Pass'Sport")], '');
  assert.equal(row[FORM_COLUMNS.indexOf('Aide PEPS')] !== '', true);
});

test('buildSheetRow: a pre-cumulation blob (single `aid`) still fills its column', () => {
  const row = buildSheetRow(
    { offerId: 'karate-mix-boxing', aid: { type: 'passsport', code: 'PS-9' } },
    { netTotalCents: 25000, onlineAmountCents: 25000, onlinePaymentId: '1', offlinePayments: [] },
  );
  assert.equal(row[FORM_COLUMNS.indexOf("Aide Pass'Sport")].includes('PS-9'), true);
});

// --- "Paiement en ligne" cell: a plan must not read as fully collected ---------

const cellOf = (pay) => buildSheetRow({ offerId: 'karate-mix-boxing' }, pay)[PAIEMENT_COL_INDEX];

// Real 3x order observed in sandbox: 330 € total, 110 € taken on the first day.
const PLAN_3X = {
  onlineAmountCents: 33000,
  onlinePlanLabel: 'CB 3x',
  onlinePaymentId: '97011',
  installments: 3,
  firstInstallment: {
    installmentNumber: 1, amountCents: 11000,
    date: '2026-09-08T02:25:56+02:00', paymentId: '68157',
  },
};

// The webhook ALWAYS supplies firstInstallment, single payment included — the
// earlier test omitted it and so exercised a case production never produces.
const PLAN_1X = {
  onlineAmountCents: 33000,
  onlinePlanLabel: 'CB 1x',
  onlinePaymentId: '97013',
  installments: 1,
  firstInstallment: {
    installmentNumber: 1, amountCents: 33000,
    date: '2026-09-08T02:59:16+02:00', paymentId: '68163',
  },
};

test('buildSheetRow: a single payment is one line, not an "Échéance 1" repeat', () => {
  assert.equal(cellOf(PLAN_1X), `En ligne ${formatEuros(33000)} (CB 1x) — commande 97013`);
});

test('buildSheetRow: the summary reference is labelled as the order it is', () => {
  // 97013 is an order id. Calling it "paiement" put it next to a real payment id
  // under the same word, which is what a reader of the sheet tripped over.
  for (const cell of [cellOf(PLAN_1X), cellOf(PLAN_3X)]) {
    assert.match(cell.split('\n')[0], /— commande 97/);
    assert.equal(cell.split('\n')[0].includes('paiement'), false);
  }
});

test('buildSheetRow: a single payment row stays findable by its order id', () => {
  assert.equal(paymentCellMatches(cellOf(PLAN_1X), '97013'), true);
});

test('buildSheetRow: a 3x announces the PLANNED total, not a collected one', () => {
  const [summary] = cellOf(PLAN_3X).split('\n');
  assert.equal(summary, `Prévu ${formatEuros(33000)} en 3× — commande 97011`);
  // "En ligne 330,00 €" would claim the whole plan was cashed on day one.
  assert.equal(summary.includes('En ligne'), false);
});

test('buildSheetRow: a 3x records its first installment straight away', () => {
  assert.equal(
    cellOf(PLAN_3X),
    `Prévu ${formatEuros(33000)} en 3× — commande 97011\n`
      + `Échéance 1 : ${formatEuros(11000)} le 08/09/2026 — paiement 68157`,
  );
});

test('buildSheetRow: the 3x cell stays findable by order AND by payment', () => {
  // The order id is what the dedup and the installment lookup search on; the
  // payment id is what stops the first installment being written twice.
  const cell = cellOf(PLAN_3X);
  assert.equal(paymentCellMatches(cell, '97011'), true);
  assert.equal(paymentCellMatches(cell, '68157'), true);
});

test('buildSheetRow: a 3x with no installment detail still writes the summary', () => {
  const { firstInstallment, ...withoutDetail } = PLAN_3X;
  assert.equal(cellOf(withoutDetail), `Prévu ${formatEuros(33000)} en 3× — commande 97011`);
});

test('buildSheetRow: nothing paid online is unaffected', () => {
  assert.equal(cellOf({ onlineAmountCents: 0, installments: 3 }), 'Aucun paiement en ligne');
});
