// POST /api/helloasso-webhook  (URL to declare in the HelloAsso admin)
// Receives the payment notification, VERIFIES it through the API (the body can
// be forged), then writes the member into the Google Sheet and purges the blob.
//
// We always respond 200 (except on an unreadable body) to avoid triggering a
// storm of retries; the write only happens once the payment is confirmed.

import { getStore } from '@netlify/blobs';
import {
  PAID_STATES,
  extractPaymentReference,
  getCheckoutIntent,
  getPayment,
  helloAssoEnv,
  isCheckoutPaid,
} from './lib/helloasso.js';
import {
  extractInstallmentRef,
  extractMemberId,
  isPaymentNotification,
  verifyHelloAssoSignature,
} from './lib/webhook-utils.js';
import { appendRow, getColumnValues, updateCell, uploadMemberPhoto } from './lib/google.js';
import {
  PAIEMENT_COL_INDEX,
  appendInstallmentLine,
  buildSheetRow,
  paymentCellMatches,
} from '../../src/shared/sheet-row.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Read the RAW body (required to verify the HMAC signature).
  let raw;
  try {
    raw = await req.text();
  } catch {
    return new Response('Invalid body', { status: 400 });
  }

  // Signature check — only if a key is configured (partner feature).
  const sigKey = process.env.HELLOASSO_WEBHOOK_SIGNATURE_KEY;
  if (sigKey) {
    const sig = req.headers.get('x-ha-signature');
    if (!verifyHelloAssoSignature(raw, sig, sigKey)) {
      console.warn('webhook: invalid/missing signature → rejected');
      return new Response('Invalid signature', { status: 401 });
    }
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // HelloAsso notifies the SAME checkout twice (Order + Payment). Acting on both
  // raced the Sheet write and recorded the member — and their photo — twice.
  if (!isPaymentNotification(payload)) return ack(`ignored event: ${payload?.eventType}`);

  // The metadata is NOT guaranteed on the 2nd/3rd installment notifications, so a
  // missing memberId is not a dead end — it falls through to the installment path.
  const memberId = extractMemberId(payload);
  const store = getStore('submissions');
  let record = null;
  if (memberId) {
    try {
      record = await store.get(memberId, { type: 'json' });
    } catch (err) {
      console.error('webhook: Blobs read', err);
      return ack('storage read error');
    }
  }
  // No pending submission: either a later installment of a plan whose first
  // payment was recorded months ago, or a notification already handled.
  if (!record) return recordInstallment(payload);

  // --- Server-side verification: re-read the checkout-intent ------------------
  let intent;
  try {
    intent = await getCheckoutIntent(record.checkoutIntentId);
  } catch (err) {
    console.error('webhook: HelloAsso verify', err);
    return ack('HelloAsso verification unavailable');
  }
  if (!isCheckoutPaid(intent)) return ack('payment not confirmed');

  const order = intent.order || {};
  const paymentId = extractPaymentReference(intent) || String(record.checkoutIntentId);

  // --- Deduplication (replayed webhook) ---------------------------------------
  try {
    const cells = await getColumnValues(PAIEMENT_COL_INDEX);
    if (cells.some((c) => paymentCellMatches(c, paymentId))) {
      await store.delete(memberId);
      return ack('already recorded');
    }
  } catch (err) {
    // On a read failure we continue: the risk of a duplicate is low and
    // preferable to a paid member not being recorded.
    console.error('webhook: dedup', err);
  }

  // Optional ID photo → Drive FIRST, so its link goes into the row. Non-fatal:
  // the payment is confirmed; a Drive hiccup must not trigger retries or lose the
  // member (the link is simply left empty in that case).
  const sub = record.submission || {};
  let photoUrl = '';
  try {
    const uploaded = await uploadMemberPhoto({ nom: sub.nom, prenom: sub.prenom, dataUrl: sub.photo });
    photoUrl = uploaded?.url || '';
  } catch (err) {
    console.error('webhook: photo upload', err);
  }

  const pay = {
    date: order.date || new Date().toISOString(),
    netTotalCents: record.price.netTotalCents,
    onlineAmountCents: record.price.cbAmountCents,
    onlinePaymentId: paymentId,
    onlinePlanLabel: record.price.planLabel,
    offlinePayments: record.price.offlinePayments || [],
    offlineTotalCents: record.price.offlineTotalCents || 0,
    familyDiscountCents: record.price.familyDiscountCents || 0,
    lateDiscountCents: record.price.lateDiscountCents || 0,
    photoUrl,
  };

  try {
    await appendRow(buildSheetRow(record.submission, pay));
  } catch (err) {
    // We do NOT purge the blob: we want to be able to replay/write manually.
    console.error('webhook: Sheet write', err);
    return ack('Sheet write failed (blob kept for replay)');
  }

  await store.delete(memberId);
  return ack('member recorded');
};

/**
 * Adds a later installment (2nd, 3rd…) to the member's existing row.
 * By now the submission blob is gone, so nothing here may be taken from the
 * webhook body — it is forgeable and, without a memberId to gate this path, the
 * only thing an attacker controls is a sequential payment id. Every value written
 * comes from the payment re-read through the API, whose organization we check.
 * The member's row is found through the order id `buildSheetRow` already wrote in
 * the cell, and a payment id already present means the notification is a replay.
 */
async function recordInstallment(payload) {
  // Local guards first: a junk request must not cost us a single API call.
  const ref = extractInstallmentRef(payload);
  if (!ref) return ack('no submission (already handled or expired)');

  let payment;
  try {
    payment = await getPayment(ref.paymentId);
  } catch (err) {
    console.error('webhook: installment verify', err);
    return ack('installment verification unavailable');
  }

  const order = payment.order || {};
  if (order.organizationSlug !== helloAssoEnv.ORG_SLUG) return ack('installment: foreign organization');
  if (!PAID_STATES.includes(payment.state)) return ack('installment not collected');
  const orderId = String(order.id ?? '');
  if (!orderId) return ack('installment: payment without order');

  let cells;
  try {
    cells = await getColumnValues(PAIEMENT_COL_INDEX);
  } catch (err) {
    console.error('webhook: installment Sheet read', err);
    return ack('installment: Sheet read failed');
  }

  const index = cells.findIndex((c) => paymentCellMatches(c, orderId));
  if (index === -1) {
    console.error(`webhook: installment ${ref.installmentNumber} — no row for order ${orderId}`);
    return ack('installment: member row not found');
  }
  const cell = cells[index];
  if (paymentCellMatches(cell, String(payment.id))) return ack('installment already recorded');

  const updated = appendInstallmentLine(cell, {
    installmentNumber: payment.installmentNumber ?? ref.installmentNumber,
    amountCents: payment.amount,
    date: payment.date,
    paymentId: payment.id,
  });
  try {
    // getColumnValues reads from row 2, so the sheet row is the index plus two.
    await updateCell(PAIEMENT_COL_INDEX, index + 2, updated);
  } catch (err) {
    console.error('webhook: installment Sheet write', err);
    return ack('installment: Sheet write failed');
  }
  return ack(`installment ${payment.installmentNumber} recorded`);
}

function ack(msg) {
  console.log('webhook:', msg);
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
