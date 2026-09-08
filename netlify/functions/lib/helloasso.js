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

/**
 * An API call that came back non-2xx, with the pieces the CALLER needs to decide
 * what to tell the user: a 400 is the member's own data being refused (and its
 * `errors[]` explains why, in French), anything else is our problem or an outage.
 * The message keeps the raw body, so nothing is lost from the logs.
 */
export class HelloAssoApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.name = 'HelloAssoApiError';
    this.status = status;
    this.errors = errors;
  }
}

/** Builds a HelloAssoApiError from a failed response (reads the body once). */
async function apiError(what, res) {
  const body = await safeText(res);
  let errors = [];
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed?.errors)) errors = parsed.errors;
  } catch {
    // Not JSON (HTML error page, empty body): the raw text stays in the message.
  }
  return new HelloAssoApiError(`${what} (${res.status}): ${body}`, res.status, errors);
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
  if (!res.ok) throw await apiError('checkout-intent creation failed', res);
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
  if (!res.ok) throw await apiError('checkout-intent read failed', res);
  return res.json();
}

/**
 * Reads ONE payment. Used to verify an installment notification: by then the
 * submission blob is gone, so there is no checkoutIntentId to re-read and no
 * memberId to trust — this is the only authoritative source left.
 * ⚠️ A 403 here means "not yours" just as much as "privilege missing": HelloAsso
 * hides foreign resources behind 403, never 404.
 */
export async function getPayment(paymentId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v5/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await apiError('payment read failed', res);
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
 * The installment ALREADY COLLECTED on a checkout-intent, or null.
 * An installment plan creates all of its payments up front — the later ones sit
 * in `Pending` until their date — so the order total says nothing about what has
 * actually been taken. This picks the earliest payment in a collected state, which
 * at first-payment time is installment 1, so the row can state what really arrived.
 * @returns {{installmentNumber:number, amountCents:number, date:string, paymentId:number}|null}
 */
export function extractCollectedInstallment(checkoutIntent) {
  const collected = (checkoutIntent?.order?.payments || [])
    .filter((p) => PAID_STATES.includes(p.state))
    .sort((a, b) => (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1));
  const first = collected[0];
  if (!first) return null;
  return {
    installmentNumber: first.installmentNumber ?? 1,
    amountCents: first.amount,
    date: first.date,
    paymentId: first.id,
  };
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

/**
 * The message to show the MEMBER when HelloAsso refused their data, or null when
 * the failure is not theirs to fix.
 * Only a 400 qualifies: it means HelloAsso validated the payload and rejected it
 * (e.g. "Votre prénom doit être différent de votre nom"), so telling the member to
 * try again later — as we used to — leaves them stuck for good. Any other status
 * is an outage or a bug on our side and stays generic.
 * @param {unknown} err anything caught, not necessarily a HelloAssoApiError
 * @returns {string|null} the refusal reason(s), already in French
 */
export function helloAssoValidationMessage(err) {
  if (err?.status !== 400) return null;
  const messages = (err.errors || [])
    .map((e) => String(e?.message ?? '').trim())
    .filter(Boolean);
  return messages.length ? messages.join(' ; ') : null;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '(unreadable body)';
  }
}

export const helloAssoEnv = { ENV, BASE, ORG_SLUG };
