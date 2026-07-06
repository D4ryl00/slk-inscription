// Tests for the PURE HelloAsso webhook helpers: parsing the notification
// (documented format { eventType, data, metadata }) and interpreting the
// checkout-intent re-read through the API (payment states, reference).

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  PAID_STATES,
  extractPaymentReference,
  isCheckoutPaid,
} from '../netlify/functions/lib/helloasso.js';
import { extractMemberId, verifyHelloAssoSignature } from '../netlify/functions/lib/webhook-utils.js';
import { paymentCellMatches } from '../src/shared/sheet-row.js';

// --- extractMemberId: notification format -------------------------------------

test('extractMemberId: metadata at the root (documented format)', () => {
  const payload = {
    eventType: 'Payment',
    data: { id: 1, state: 'Authorized' },
    metadata: { memberId: 'abc-123', offerId: 'cardio-1' },
  };
  assert.equal(extractMemberId(payload), 'abc-123');
});

test('extractMemberId: also tolerated under data.metadata', () => {
  assert.equal(extractMemberId({ data: { metadata: { memberId: 'z' } } }), 'z');
});

test('extractMemberId: absent or empty payload → null', () => {
  assert.equal(extractMemberId({ eventType: 'Payment', data: {} }), null);
  assert.equal(extractMemberId({ metadata: {} }), null);
  assert.equal(extractMemberId({}), null);
  assert.equal(extractMemberId(null), null);
});

// --- isCheckoutPaid: payment states -------------------------------------------

test('isCheckoutPaid: Authorized or Registered → paid', () => {
  assert.equal(isCheckoutPaid({ order: { payments: [{ state: 'Authorized' }] } }), true);
  assert.equal(isCheckoutPaid({ order: { payments: [{ state: 'Registered' }] } }), true);
});

test('isCheckoutPaid: Pending / Refused / Refunded / Unknown → not paid', () => {
  for (const state of ['Pending', 'Refused', 'Refunded', 'Unknown']) {
    assert.equal(
      isCheckoutPaid({ order: { payments: [{ state }] } }),
      false,
      `state ${state} must not count as paid`,
    );
  }
});

test('isCheckoutPaid: no order / no payment → not paid', () => {
  assert.equal(isCheckoutPaid({}), false);
  assert.equal(isCheckoutPaid({ order: {} }), false);
  assert.equal(isCheckoutPaid({ order: { payments: [] } }), false);
  assert.equal(isCheckoutPaid(null), false);
});

test('isCheckoutPaid: one valid payment among several is enough', () => {
  const intent = { order: { payments: [{ state: 'Refused' }, { state: 'Authorized' }] } };
  assert.equal(isCheckoutPaid(intent), true);
});

test('PAID_STATES = [Authorized, Registered]', () => {
  assert.deepEqual(PAID_STATES, ['Authorized', 'Registered']);
});

// --- extractPaymentReference: deduplication -----------------------------------

test('extractPaymentReference: order id takes priority, string', () => {
  assert.equal(
    extractPaymentReference({ order: { id: 12345, payments: [{ id: 9 }] } }),
    '12345',
  );
});

test('extractPaymentReference: falls back to the first payment, otherwise null', () => {
  assert.equal(extractPaymentReference({ order: { payments: [{ id: 9 }] } }), '9');
  assert.equal(extractPaymentReference({ order: {} }), null);
  assert.equal(extractPaymentReference({}), null);
  assert.equal(extractPaymentReference(null), null);
});

// --- paymentCellMatches: deduplication against the Sheet ------------------------

const PAID_CELL = 'En ligne 330,00 € (CB 1x) — paiement 1234';

test('paymentCellMatches: exact payment id in the cell → true', () => {
  assert.equal(paymentCellMatches(PAID_CELL, '1234'), true);
});

test('paymentCellMatches: prefix/suffix/substring of another id → false', () => {
  assert.equal(paymentCellMatches(PAID_CELL, '123'), false);
  assert.equal(paymentCellMatches(PAID_CELL, '234'), false);
  assert.equal(paymentCellMatches(PAID_CELL, '12345'), false);
});

test('paymentCellMatches: id must follow the word "paiement" (not an amount)', () => {
  assert.equal(paymentCellMatches('En ligne 1 234,00 € (CB 3x) — paiement 9', '1'), false);
  assert.equal(paymentCellMatches('En ligne 1 234,00 € (CB 3x) — paiement 9', '9'), true);
});

test('paymentCellMatches: cell without payment, empty cell or empty id → false', () => {
  assert.equal(paymentCellMatches('Aucun paiement en ligne', '1234'), false);
  assert.equal(paymentCellMatches('', '1234'), false);
  assert.equal(paymentCellMatches(undefined, '1234'), false);
  assert.equal(paymentCellMatches(PAID_CELL, ''), false);
  assert.equal(paymentCellMatches(PAID_CELL, null), false);
});

// --- verifyHelloAssoSignature: authenticity (HMAC-SHA256 hex) ------------------

const SIG_KEY = 'test-signature-key';
const SIG_BODY = '{"eventType":"Payment","metadata":{"memberId":"abc"}}';
const sign = (body, key) => createHmac('sha256', key).update(body, 'utf8').digest('hex');

test('verifyHelloAssoSignature: correct signature → true', () => {
  assert.equal(verifyHelloAssoSignature(SIG_BODY, sign(SIG_BODY, SIG_KEY), SIG_KEY), true);
});

test('verifyHelloAssoSignature: tampered body → false', () => {
  assert.equal(verifyHelloAssoSignature(SIG_BODY + ' ', sign(SIG_BODY, SIG_KEY), SIG_KEY), false);
});

test('verifyHelloAssoSignature: wrong key → false', () => {
  assert.equal(verifyHelloAssoSignature(SIG_BODY, sign(SIG_BODY, 'other-key'), SIG_KEY), false);
});

test('verifyHelloAssoSignature: missing signature or missing key → false', () => {
  assert.equal(verifyHelloAssoSignature(SIG_BODY, '', SIG_KEY), false);
  assert.equal(verifyHelloAssoSignature(SIG_BODY, undefined, SIG_KEY), false);
  assert.equal(verifyHelloAssoSignature(SIG_BODY, sign(SIG_BODY, SIG_KEY), ''), false);
});

test('verifyHelloAssoSignature: different length → false (no exception)', () => {
  assert.equal(verifyHelloAssoSignature(SIG_BODY, 'deadbeef', SIG_KEY), false);
});
