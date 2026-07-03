import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AIDS, SHEET_COLUMNS } from '../src/shared/config.js';
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

test('aide sans code → erreur', () => {
  const p = computePrice({
    offerId: 'cardio-1',
    paymentPlan: '1x',
    aid: { type: 'peps', code: '' },
  });
  assert.equal(p.ok, false);
});

test('offre inconnue → erreur', () => {
  const p = computePrice({ offerId: 'nope', paymentPlan: '1x' });
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
  const pay = { date: '2026-07-04T10:00:00Z', amountCents: 19500, planLabel: 'CB 1x', paymentId: '999' };
  const row = buildSheetRow(submission, pay);

  assert.equal(row.length, SHEET_COLUMNS.length);
  assert.equal(row[SHEET_COLUMNS.indexOf('Email')], 'a@example.com');
  assert.equal(row[SHEET_COLUMNS.indexOf('Section')].includes('Karaté'), true);
  assert.equal(row[SHEET_COLUMNS.indexOf('PAIEMENT')].includes('999'), true);
  assert.equal(row[SHEET_COLUMNS.indexOf("PASS'SPORT")].includes('PS-42'), true);
  // colonnes « bureau » vides
  assert.equal(row[SHEET_COLUMNS.indexOf('CERTIF MÉD')], '');
});
