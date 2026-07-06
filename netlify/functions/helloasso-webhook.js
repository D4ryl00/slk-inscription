// POST /api/helloasso-webhook  (URL to declare in the HelloAsso admin)
// Receives the payment notification, VERIFIES it through the API (the body can
// be forged), then writes the member into the Google Sheet and purges the blob.
//
// We always respond 200 (except on an unreadable body) to avoid triggering a
// storm of retries; the write only happens once the payment is confirmed.

import { getStore } from '@netlify/blobs';
import { extractPaymentReference, getCheckoutIntent, isCheckoutPaid } from './lib/helloasso.js';
import { extractMemberId, verifyHelloAssoSignature } from './lib/webhook-utils.js';
import { appendRow, columnContains } from './lib/google.js';
import { PAIEMENT_COL_INDEX, buildSheetRow } from '../../src/shared/sheet-row.js';

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

  const memberId = extractMemberId(payload);
  if (!memberId) return ack('notification without memberId (ignored)');

  const store = getStore('submissions');
  let record;
  try {
    record = await store.get(memberId, { type: 'json' });
  } catch (err) {
    console.error('webhook: Blobs read', err);
    return ack('storage read error');
  }
  if (!record) return ack('no submission (already handled or expired)');

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
    if (await columnContains(PAIEMENT_COL_INDEX, paymentId)) {
      await store.delete(memberId);
      return ack('already recorded');
    }
  } catch (err) {
    // On a read failure we continue: the risk of a duplicate is low and
    // preferable to a paid member not being recorded.
    console.error('webhook: dedup', err);
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
    passeportCents: record.price.passeportCents || 0,
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

function ack(msg) {
  console.log('webhook:', msg);
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
