// PURE helpers for processing HelloAsso notifications (no I/O), isolated to be
// testable. The webhook relies on them for parsing, but the SOURCE OF TRUTH for
// the payment remains the re-read of the checkout-intent through the API.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies the authenticity of a HelloAsso notification.
 * Signature = HMAC-SHA256(RAW body, signatureKey), encoded as lowercase hex,
 * sent in the `x-ha-signature` header. Constant-time comparison. ⚠️ Partner-only
 * feature: if no key is configured, the webhook falls back to re-verification
 * through the API.
 * @param {string} rawBody raw request body (not the re-serialized JSON)
 * @param {string} signatureHex value of the x-ha-signature header
 * @param {string} signatureKey secret key from the notification URL
 * @returns {boolean}
 */
export function verifyHelloAssoSignature(rawBody, signatureHex, signatureKey) {
  if (!signatureKey || !signatureHex || typeof rawBody !== 'string') return false;
  const expected = createHmac('sha256', signatureKey).update(rawBody, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(String(signatureHex));
  if (expectedBuf.length !== providedBuf.length) return false; // timingSafeEqual requires equal length
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Extracts the `memberId` from a HelloAsso notification.
 * Documented format: { eventType, data, metadata } — `metadata` at the root
 * (returns whatever was passed when creating the checkout-intent). We also
 * tolerate `data.metadata` as a safety net.
 * @returns {string|null}
 */
export function extractMemberId(payload) {
  const metadata = payload?.metadata || payload?.data?.metadata || {};
  return metadata.memberId || null;
}
