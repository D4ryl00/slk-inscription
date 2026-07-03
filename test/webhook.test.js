// Tests des helpers PURS du webhook HelloAsso : parsing de la notification
// (format documenté { eventType, data, metadata }) et interprétation du
// checkout-intent relu via l'API (états de paiement, référence).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PAID_STATES,
  extractPaymentReference,
  isCheckoutPaid,
} from '../netlify/functions/lib/helloasso.js';
import { extractMemberId } from '../netlify/functions/lib/webhook-utils.js';

// --- extractMemberId : format de notification ---------------------------------

test('extractMemberId : metadata à la racine (format documenté)', () => {
  const payload = {
    eventType: 'Payment',
    data: { id: 1, state: 'Authorized' },
    metadata: { memberId: 'abc-123', offerId: 'cardio-1' },
  };
  assert.equal(extractMemberId(payload), 'abc-123');
});

test('extractMemberId : toléré aussi sous data.metadata', () => {
  assert.equal(extractMemberId({ data: { metadata: { memberId: 'z' } } }), 'z');
});

test('extractMemberId : absent ou payload vide → null', () => {
  assert.equal(extractMemberId({ eventType: 'Payment', data: {} }), null);
  assert.equal(extractMemberId({ metadata: {} }), null);
  assert.equal(extractMemberId({}), null);
  assert.equal(extractMemberId(null), null);
});

// --- isCheckoutPaid : états de paiement ---------------------------------------

test('isCheckoutPaid : Authorized ou Registered → payé', () => {
  assert.equal(isCheckoutPaid({ order: { payments: [{ state: 'Authorized' }] } }), true);
  assert.equal(isCheckoutPaid({ order: { payments: [{ state: 'Registered' }] } }), true);
});

test('isCheckoutPaid : Pending / Refused / Refunded / Unknown → non payé', () => {
  for (const state of ['Pending', 'Refused', 'Refunded', 'Unknown']) {
    assert.equal(
      isCheckoutPaid({ order: { payments: [{ state }] } }),
      false,
      `état ${state} ne doit pas compter comme payé`,
    );
  }
});

test('isCheckoutPaid : pas de commande / pas de paiement → non payé', () => {
  assert.equal(isCheckoutPaid({}), false);
  assert.equal(isCheckoutPaid({ order: {} }), false);
  assert.equal(isCheckoutPaid({ order: { payments: [] } }), false);
  assert.equal(isCheckoutPaid(null), false);
});

test('isCheckoutPaid : un paiement valide parmi plusieurs suffit', () => {
  const intent = { order: { payments: [{ state: 'Refused' }, { state: 'Authorized' }] } };
  assert.equal(isCheckoutPaid(intent), true);
});

test('PAID_STATES = [Authorized, Registered]', () => {
  assert.deepEqual(PAID_STATES, ['Authorized', 'Registered']);
});

// --- extractPaymentReference : déduplication ----------------------------------

test('extractPaymentReference : id de commande prioritaire, chaîne', () => {
  assert.equal(
    extractPaymentReference({ order: { id: 12345, payments: [{ id: 9 }] } }),
    '12345',
  );
});

test('extractPaymentReference : repli sur le 1er paiement, sinon null', () => {
  assert.equal(extractPaymentReference({ order: { payments: [{ id: 9 }] } }), '9');
  assert.equal(extractPaymentReference({ order: {} }), null);
  assert.equal(extractPaymentReference({}), null);
  assert.equal(extractPaymentReference(null), null);
});
