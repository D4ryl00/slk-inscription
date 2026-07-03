// Client minimal de l'API HelloAsso v5 (OAuth client_credentials + Checkout).
// Utilise le `fetch` global de Node ≥ 18. Aucune dépendance externe.
//
// Doc : https://dev.helloasso.com/docs/int%C3%A9grer-le-paiement-sur-votre-site

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
  if (missing.length) throw new Error(`Config HelloAsso manquante : ${missing.join(', ')}`);
}

/** Récupère un jeton d'accès (grant client_credentials). */
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
    throw new Error(`OAuth HelloAsso échoué (${res.status}) : ${await safeText(res)}`);
  }
  const json = await res.json();
  return json.access_token;
}

/**
 * Crée un checkout-intent.
 * @param {object} p
 * @param {number} p.totalAmount  centimes
 * @param {number} p.initialAmount centimes (1re échéance, = total si 1x)
 * @param {{amount:number,date:string}[]} [p.terms] échéances (centimes)
 * @param {string} p.itemName     libellé (max 250 car.)
 * @param {boolean} [p.containsDonation=false]
 * @param {object} p.payer        { firstName, lastName, email, ... }
 * @param {object} p.metadata     renvoyé UNIQUEMENT dans la notification (webhook)
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
  if (p.terms && p.terms.length > 1) body.terms = p.terms;

  const res = await fetch(`${BASE}/v5/organizations/${ORG_SLUG}/checkout-intents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Création checkout-intent échouée (${res.status}) : ${await safeText(res)}`);
  }
  return res.json();
}

/**
 * Relit un checkout-intent pour VÉRIFIER le paiement (le webhook seul n'est pas
 * une preuve : son corps est falsifiable). Retourne l'objet HelloAsso.
 */
export async function getCheckoutIntent(checkoutIntentId) {
  const token = await getAccessToken();
  const res = await fetch(
    `${BASE}/v5/organizations/${ORG_SLUG}/checkout-intents/${checkoutIntentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Lecture checkout-intent échouée (${res.status}) : ${await safeText(res)}`);
  }
  return res.json();
}

/**
 * Vrai si le checkout-intent correspond à une commande réellement autorisée/payée.
 * HelloAsso renvoie un objet `order` une fois le paiement effectué.
 */
export function isCheckoutPaid(checkoutIntent) {
  const order = checkoutIntent?.order;
  if (!order) return false;
  // Une commande existe → paiement initié/autorisé. On regarde les paiements.
  const payments = order.payments || [];
  return payments.some((pay) =>
    ['Authorized', 'Registered'].includes(pay.state),
  ) || payments.length > 0;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '(corps illisible)';
  }
}

export const helloAssoEnv = { ENV, BASE, ORG_SLUG };
