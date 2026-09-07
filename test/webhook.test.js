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
import {
  extractInstallmentRef,
  extractMemberId,
  isPaymentNotification,
  summarizeNotification,
  verifyHelloAssoSignature,
} from '../netlify/functions/lib/webhook-utils.js';
import { appendInstallmentLine, paymentCellMatches } from '../src/shared/sheet-row.js';
import { formatEuros } from '../src/shared/pricing.js';

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

// --- isPaymentNotification: only the Payment event may be acted upon ----------

test('isPaymentNotification: eventType Payment → true', () => {
  assert.equal(isPaymentNotification({ eventType: 'Payment', data: {} }), true);
});

test('isPaymentNotification: eventType Order → false (the duplicate source)', () => {
  // HelloAsso sends BOTH Order and Payment for the same checkout; acting on both
  // is what wrote the member twice.
  assert.equal(isPaymentNotification({ eventType: 'Order', data: {} }), false);
});

test('isPaymentNotification: other documented event types → false', () => {
  assert.equal(isPaymentNotification({ eventType: 'Form' }), false);
  assert.equal(isPaymentNotification({ eventType: 'Organization' }), false);
});

test('isPaymentNotification: missing eventType or empty payload → false', () => {
  assert.equal(isPaymentNotification({ data: {} }), false);
  assert.equal(isPaymentNotification({}), false);
  assert.equal(isPaymentNotification(null), false);
  assert.equal(isPaymentNotification(undefined), false);
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

// --- appendInstallmentLine: 2nd/3rd installments land in the same cell --------

// What the cell holds once the first payment has been recorded.
const FIRST = `En ligne ${formatEuros(6000)} (CB 3x) — paiement 22707`;
const SECOND = { installmentNumber: 2, amountCents: 2000, date: '2025-10-07T09:12:00+02:00', paymentId: '15223' };

test('appendInstallmentLine: appends a line under the existing payment', () => {
  assert.equal(
    appendInstallmentLine(FIRST, SECOND),
    `${FIRST}\nÉchéance 2 : ${formatEuros(2000)} le 07/10/2025 — paiement 15223`,
  );
});

test('appendInstallmentLine: the same installment twice → unchanged (replay)', () => {
  const once = appendInstallmentLine(FIRST, SECOND);
  assert.equal(appendInstallmentLine(once, SECOND), once);
});

test('appendInstallmentLine: installments accumulate in order', () => {
  const third = { installmentNumber: 3, amountCents: 2000, date: '2025-11-07T09:12:00+02:00', paymentId: '15224' };
  const cell = appendInstallmentLine(appendInstallmentLine(FIRST, SECOND), third);
  assert.equal(cell.split('\n').length, 3);
  assert.match(cell, /Échéance 3 : .* le 07\/11\/2025 — paiement 15224$/);
});

test('appendInstallmentLine: empty cell → no leading blank line', () => {
  assert.equal(
    appendInstallmentLine('', SECOND),
    `Échéance 2 : ${formatEuros(2000)} le 07/10/2025 — paiement 15223`,
  );
});

test('appendInstallmentLine: unusable date → the line drops the date, not the payment', () => {
  const line = appendInstallmentLine('', { ...SECOND, date: undefined });
  assert.equal(line, `Échéance 2 : ${formatEuros(2000)} — paiement 15223`);
});

test('appendInstallmentLine: the appended id is found back by paymentCellMatches', () => {
  // This is what makes the write idempotent AND keeps the row findable.
  const cell = appendInstallmentLine(FIRST, SECOND);
  assert.equal(paymentCellMatches(cell, '15223'), true);
  assert.equal(paymentCellMatches(cell, '22707'), true);
});

// --- extractInstallmentRef: cheap guards, BEFORE any network call ------------

test('extractInstallmentRef: a 2nd installment → its payment id and rank', () => {
  const payload = { eventType: 'Payment', data: { id: 15223, installmentNumber: 2 } };
  assert.deepEqual(extractInstallmentRef(payload), { paymentId: 15223, installmentNumber: 2 });
});

test('extractInstallmentRef: the first payment → null (the blob path owns it)', () => {
  assert.equal(extractInstallmentRef({ eventType: 'Payment', data: { id: 1, installmentNumber: 1 } }), null);
});

test('extractInstallmentRef: absent or out-of-range rank → null', () => {
  const at = (n) => extractInstallmentRef({ eventType: 'Payment', data: { id: 9, installmentNumber: n } });
  assert.equal(at(undefined), null);
  assert.equal(at(0), null);
  assert.equal(at(13), null);
  assert.equal(at(2.5), null);
});

test('extractInstallmentRef: unusable payment id → null', () => {
  const withId = (id) => extractInstallmentRef({ eventType: 'Payment', data: { id, installmentNumber: 2 } });
  assert.equal(withId(undefined), null);
  assert.equal(withId(0), null);
  assert.equal(withId(-3), null);
  assert.equal(withId('abc'), null);
});

test('extractInstallmentRef: empty payload → null (no throw)', () => {
  assert.equal(extractInstallmentRef({}), null);
  assert.equal(extractInstallmentRef(null), null);
});

// --- summarizeNotification: the one log line that answers plan §4b/§4c -------

// A notification as HelloAsso documents it, personal data included.
const NOTIF = {
  eventType: 'Payment',
  data: {
    id: 15223,
    amount: 2000,
    installmentNumber: 2,
    state: 'Authorized',
    date: '2025-10-07T09:12:00+02:00',
    order: { id: 22707 },
    payer: { email: 'jean.dupont@example.com', firstName: 'Jean', lastName: 'Dupont' },
  },
  metadata: { memberId: 'abc-123', offerId: 'cardio-1' },
};

test('summarizeNotification: reports the fields plan §4c asks for', () => {
  const s = summarizeNotification(NOTIF);
  assert.match(s, /eventType=Payment/);
  assert.match(s, /payment=15223/);
  assert.match(s, /order=22707/);
  assert.match(s, /installment=2/);
  assert.match(s, /amount=2000/);
});

test('summarizeNotification: reports whether metadata survived (plan §4b)', () => {
  assert.match(summarizeNotification(NOTIF), /metadata=yes memberId=yes/);
  assert.match(summarizeNotification({ eventType: 'Payment', data: {} }), /metadata=no memberId=no/);
  assert.match(
    summarizeNotification({ eventType: 'Payment', data: {}, metadata: { offerId: 'x' } }),
    /metadata=yes memberId=no/,
  );
});

test('summarizeNotification: leaks NO personal data into the logs', () => {
  const s = summarizeNotification(NOTIF);
  for (const secret of ['jean.dupont@example.com', 'Jean', 'Dupont', 'abc-123']) {
    assert.equal(s.includes(secret), false, `${secret} must not reach the logs`);
  }
});

test('summarizeNotification: an Order notification is still readable', () => {
  const s = summarizeNotification({ eventType: 'Order', data: { id: 22707 }, metadata: {} });
  assert.match(s, /eventType=Order/);
  assert.match(s, /installment=-/);
});

test('summarizeNotification: empty payload → no throw', () => {
  assert.match(summarizeNotification(null), /eventType=-/);
  assert.match(summarizeNotification({}), /eventType=-/);
});
