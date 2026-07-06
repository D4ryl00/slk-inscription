// Minimal HelloAsso v5 API client (OAuth client_credentials + Checkout).
// Uses Node's global `fetch` (Node >= 18). No external dependency.
//
// Docs: https://dev.helloasso.com/docs/int%C3%A9grer-le-paiement-sur-votre-site

const ENV = (process.env.HELLOASSO_ENV || 'sandbox').toLowerCase();
const BASE = ENV === 'prod' ? 'https://api.helloasso.com' : 'https://api.helloasso-sandbox.com';

const CLIENT_ID = process.env.HELLOASSO_CLIENT_ID;
const CLIENT_SECRET = process.env.HELLOASSO_CLIENT_SECRET;
const ORG_SLUG = process.env.HELLOASSO_ORG_SLUG;

function assertConfig() {
  const missing = [];
  if (!CLIENT_ID) missing.push('HELLOASSO_CLIENT_ID');
  if (!CLIENT_SECRET) missing.push('HELLOASSO_CLIENT_SECRET');
  if (!ORG_SLUG) missing.push('HELLOASSO_ORG_SLUG');
  if (missing.length) throw new Error(`Missing HelloAsso config: ${missing.join(', ')}`);
}

/** Fetches an access token (client_credentials grant). */
export async function getAccessToken() {
  assertConfig();
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`HelloAsso OAuth failed (${res.status}): ${await safeText(res)}`);
  }
  const json = await res.json();
  return json.access_token;
}

/**
 * Creates a checkout-intent.
 * @param {object} p
 * @param {number} p.totalAmount  cents
 * @param {number} p.initialAmount cents (first installment, = total for 1x)
 * @param {{amount:number,date:string}[]} [p.terms] ALL installments, first one
 *        included (cents). HelloAsso only wants the SUBSEQUENT installments in
 *        `terms` (the first is already described by `initialAmount`), so we drop
 *        the first before sending. We require initialAmount + Σterms = totalAmount.
 * @param {string} p.itemName     label (max 250 chars)
 * @param {boolean} [p.containsDonation=false]
 * @param {object} p.payer        { firstName, lastName, email, ... }
 * @param {object} p.metadata     returned ONLY in the notification (webhook)
 * @param {string} p.returnUrl @param {string} p.backUrl @param {string} p.errorUrl
 * @returns {Promise<{id:number, redirectUrl:string}>}
 */
export async function createCheckoutIntent(p) {
  const token = await getAccessToken();
  const body = {
    totalAmount: p.totalAmount,
    initialAmount: p.initialAmount ?? p.totalAmount,
    itemName: (p.itemName || '').slice(0, 250),
    backUrl: p.backUrl,
    errorUrl: p.errorUrl,
    returnUrl: p.returnUrl,
    containsDonation: Boolean(p.containsDonation),
    payer: p.payer,
    metadata: p.metadata,
  };
  // `terms` = installments AFTER the initial payment only.
  if (p.terms && p.terms.length > 1) body.terms = p.terms.slice(1);

  const res = await fetch(`${BASE}/v5/organizations/${ORG_SLUG}/checkout-intents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`checkout-intent creation failed (${res.status}): ${await safeText(res)}`);
  }
  return res.json();
}

/**
 * Re-reads a checkout-intent to VERIFY the payment (the webhook alone is not
 * proof: its body can be forged). Returns the HelloAsso object.
 */
export async function getCheckoutIntent(checkoutIntentId) {
  const token = await getAccessToken();
  const res = await fetch(
    `${BASE}/v5/organizations/${ORG_SLUG}/checkout-intents/${checkoutIntentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`checkout-intent read failed (${res.status}): ${await safeText(res)}`);
  }
  return res.json();
}

/** HelloAsso payment states considered as actually collected. */
export const PAID_STATES = ['Authorized', 'Registered'];

/**
 * True if the checkout-intent corresponds to an actually collected payment.
 * We REQUIRE at least one payment in a valid state (Authorized/Registered);
 * a Pending/Refused/Refunded/Unknown payment does not count.
 */
export function isCheckoutPaid(checkoutIntent) {
  const payments = checkoutIntent?.order?.payments || [];
  return payments.some((p) => PAID_STATES.includes(p.state));
}

/**
 * Payment reference for deduplication: order id preferably, otherwise the first
 * payment id. Returns a string, or null if there is no order.
 */
export function extractPaymentReference(checkoutIntent) {
  const order = checkoutIntent?.order;
  if (!order) return null;
  const ref = order.id ?? order.payments?.[0]?.id;
  return ref != null ? String(ref) : null;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '(unreadable body)';
  }
}

export const helloAssoEnv = { ENV, BASE, ORG_SLUG };
