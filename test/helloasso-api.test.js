// Syntax tests for the HelloAsso v5 API calls (as documented at
// https://dev.helloasso.com). We do not hit the network: `fetch` is mocked and
// we ASSERT the outgoing request (URL, method, headers, body) built by the
// client. Goal: guarantee that what we send matches each endpoint's contract.
//
//   1. POST /oauth2/token                                  (getAccessToken)
//   2. POST /v5/organizations/{org}/checkout-intents       (createCheckoutIntent)
//   3. GET  /v5/organizations/{org}/checkout-intents/{id}  (getCheckoutIntent)

import assert from 'node:assert/strict';
import { test } from 'node:test';

// ⚠️ The client freezes its config (BASE, ORG_SLUG, credentials) at module load
// → set the environment BEFORE the dynamic import.
process.env.HELLOASSO_ENV = 'sandbox';
process.env.HELLOASSO_CLIENT_ID = 'test-client-id';
process.env.HELLOASSO_CLIENT_SECRET = 'test-client-secret';
process.env.HELLOASSO_ORG_SLUG = 'assoc-test';

const { getAccessToken, createCheckoutIntent, getCheckoutIntent, helloAssoEnv } = await import(
  '../netlify/functions/lib/helloasso.js'
);
const { buildInstallments } = await import('../src/shared/pricing.js');

const BASE = 'https://api.helloasso-sandbox.com';
const ORG = 'assoc-test';
const TOKEN = 'fake-access-token';

// --- `fetch` mock: records calls, routes the response ------------------------

const realFetch = globalThis.fetch;

/**
 * Replaces globalThis.fetch. `router(url, options)` returns a `Response`.
 * By default the /oauth2/token endpoint returns a token (the checkout helpers
 * always start by fetching one).
 */
function mockFetch(router, { routeToken = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, options });
    // By default the token endpoint returns a token (checkout/get calls begin
    // by fetching one, whose syntax they do not test here). `routeToken` lets
    // the test route /oauth2/token itself.
    if (u.endsWith('/oauth2/token') && !routeToken) {
      return new Response(JSON.stringify({ access_token: TOKEN }), { status: 200 });
    }
    return router(u, options);
  };
  return {
    calls,
    tokenCall: () => calls.find((c) => c.url.endsWith('/oauth2/token')),
    apiCall: () => calls.find((c) => !c.url.endsWith('/oauth2/token')),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** Wraps a test with a mocked fetch, restored no matter what. */
async function withFetch(router, fn, opts) {
  const m = mockFetch(router, opts);
  try {
    return await fn(m);
  } finally {
    m.restore();
  }
}

// ─── Environment resolution ───────────────────────────────────────────────────

test('config: sandbox env → expected BASE and ORG_SLUG', () => {
  assert.equal(helloAssoEnv.ENV, 'sandbox');
  assert.equal(helloAssoEnv.BASE, BASE);
  assert.equal(helloAssoEnv.ORG_SLUG, ORG);
});

// ─── 1. POST /oauth2/token ────────────────────────────────────────────────────

test('getAccessToken: POST /oauth2/token, form-urlencoded, client_credentials grant', async () => {
  await withFetch(
    () => jsonRes({ access_token: TOKEN }),
    async (m) => {
      const token = await getAccessToken();
      assert.equal(token, TOKEN);

      const c = m.tokenCall();
      assert.equal(c.url, `${BASE}/oauth2/token`);
      assert.equal(c.options.method, 'POST');
      assert.equal(c.options.headers['Content-Type'], 'application/x-www-form-urlencoded');

      // Body = URLSearchParams with the 3 documented fields.
      const body = c.options.body;
      assert.ok(body instanceof URLSearchParams, 'body must be URLSearchParams');
      assert.equal(body.get('grant_type'), 'client_credentials');
      assert.equal(body.get('client_id'), 'test-client-id');
      assert.equal(body.get('client_secret'), 'test-client-secret');
    },
    { routeToken: true },
  );
});

test('getAccessToken: non-2xx response → throws', async () => {
  await withFetch(
    () => new Response('nope', { status: 401 }),
    async () => {
      await assert.rejects(() => getAccessToken(), /HelloAsso OAuth failed \(401\)/);
    },
    { routeToken: true },
  );
});

// ─── 2. POST /v5/organizations/{org}/checkout-intents ────────────────────────

const PAYER = { firstName: 'Jean', lastName: 'Dupont', email: 'jean@example.com' };

test('createCheckoutIntent: URL, method, headers (Bearer + JSON)', async () => {
  await withFetch(
    () => jsonRes({ id: 42, redirectUrl: 'https://pay.helloasso/redir' }),
    async (m) => {
      const out = await createCheckoutIntent({
        totalAmount: 15000,
        initialAmount: 15000,
        itemName: 'Adhésion SLK',
        payer: PAYER,
        returnUrl: 'https://x.fr/merci',
        backUrl: 'https://x.fr/',
        errorUrl: 'https://x.fr/erreur',
      });
      assert.deepEqual(out, { id: 42, redirectUrl: 'https://pay.helloasso/redir' });

      const c = m.apiCall();
      assert.equal(c.url, `${BASE}/v5/organizations/${ORG}/checkout-intents`);
      assert.equal(c.options.method, 'POST');
      assert.equal(c.options.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(c.options.headers['Content-Type'], 'application/json');
    },
  );
});

test('createCheckoutIntent: body = documented fields (single payment)', async () => {
  await withFetch(
    () => jsonRes({ id: 1, redirectUrl: 'https://r' }),
    async (m) => {
      await createCheckoutIntent({
        totalAmount: 15000,
        initialAmount: 15000,
        itemName: 'Adhésion SLK',
        containsDonation: false,
        payer: PAYER,
        metadata: { memberId: 'abc-123' },
        returnUrl: 'https://x.fr/merci',
        backUrl: 'https://x.fr/',
        errorUrl: 'https://x.fr/erreur',
      });

      const body = JSON.parse(m.apiCall().options.body);
      assert.equal(body.totalAmount, 15000);
      assert.equal(body.initialAmount, 15000);
      assert.equal(body.itemName, 'Adhésion SLK');
      assert.equal(body.containsDonation, false);
      assert.equal(body.backUrl, 'https://x.fr/');
      assert.equal(body.errorUrl, 'https://x.fr/erreur');
      assert.equal(body.returnUrl, 'https://x.fr/merci');
      assert.deepEqual(body.payer, PAYER);
      assert.deepEqual(body.metadata, { memberId: 'abc-123' });
      // Single installment → NO terms field (initialAmount = total).
      assert.ok(!('terms' in body), 'terms must not be sent for a single payment');
    },
  );
});

test('createCheckoutIntent: initialAmount defaults to totalAmount', async () => {
  await withFetch(
    () => jsonRes({ id: 1, redirectUrl: 'https://r' }),
    async (m) => {
      await createCheckoutIntent({ totalAmount: 9900, itemName: 'X', payer: PAYER });
      const body = JSON.parse(m.apiCall().options.body);
      assert.equal(body.initialAmount, 9900);
    },
  );
});

test('createCheckoutIntent: itemName truncated to 250 characters', async () => {
  await withFetch(
    () => jsonRes({ id: 1, redirectUrl: 'https://r' }),
    async (m) => {
      await createCheckoutIntent({
        totalAmount: 1000,
        itemName: 'A'.repeat(300),
        payer: PAYER,
      });
      const body = JSON.parse(m.apiCall().options.body);
      assert.equal(body.itemName.length, 250);
    },
  );
});

test('createCheckoutIntent: containsDonation coerced to a boolean', async () => {
  await withFetch(
    () => jsonRes({ id: 1, redirectUrl: 'https://r' }),
    async (m) => {
      await createCheckoutIntent({ totalAmount: 1000, itemName: 'X', payer: PAYER });
      const body = JSON.parse(m.apiCall().options.body);
      assert.equal(body.containsDonation, false);
    },
  );
});

// --- Installment invariant (the fixed bug) -----------------------------------
// HelloAsso: totalAmount == initialAmount + Σ(terms), where `terms` holds ONLY
// the installments AFTER the initial payment.

test('createCheckoutIntent: terms = future installments only, excluding the initial payment', async () => {
  await withFetch(
    () => jsonRes({ id: 1, redirectUrl: 'https://r' }),
    async (m) => {
      // Full schedule (initial included) as produced by buildInstallments.
      const terms = [
        { amount: 5000, date: '2026-07-06' },
        { amount: 5000, date: '2026-08-06' },
        { amount: 5000, date: '2026-09-06' },
      ];
      await createCheckoutIntent({
        totalAmount: 15000,
        initialAmount: 5000,
        itemName: 'X',
        payer: PAYER,
        terms,
      });

      const body = JSON.parse(m.apiCall().options.body);
      // The first installment is dropped (it equals initialAmount).
      assert.equal(body.terms.length, 2);
      assert.deepEqual(body.terms, terms.slice(1));
      // HelloAsso invariant.
      const sum = body.terms.reduce((a, t) => a + t.amount, 0);
      assert.equal(body.initialAmount + sum, body.totalAmount);
    },
  );
});

test('createCheckoutIntent: buildInstallments(3x) chain → invariant holds', async () => {
  await withFetch(
    () => jsonRes({ id: 1, redirectUrl: 'https://r' }),
    async (m) => {
      const total = 26500;
      const { initialAmount, terms } = buildInstallments(total, '3x');
      await createCheckoutIntent({
        totalAmount: total,
        initialAmount,
        itemName: 'X',
        payer: PAYER,
        terms,
      });

      const body = JSON.parse(m.apiCall().options.body);
      assert.equal(body.terms.length, 2); // 3 installments minus the first
      const sum = body.terms.reduce((a, t) => a + t.amount, 0);
      assert.equal(body.initialAmount + sum, total);
    },
  );
});

test('createCheckoutIntent: non-2xx response → throws with the status', async () => {
  await withFetch(
    () => new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 400 }),
    async () => {
      await assert.rejects(
        () => createCheckoutIntent({ totalAmount: 1000, itemName: 'X', payer: PAYER }),
        /checkout-intent creation failed \(400\)/,
      );
    },
  );
});

// ─── 3. GET /v5/organizations/{org}/checkout-intents/{id} ────────────────────

test('getCheckoutIntent: GET with Bearer, returns the JSON body', async () => {
  const intent = { id: 777, order: { payments: [{ state: 'Authorized' }] } };
  await withFetch(
    () => jsonRes(intent),
    async (m) => {
      const out = await getCheckoutIntent(777);
      assert.deepEqual(out, intent);

      const c = m.apiCall();
      assert.equal(c.url, `${BASE}/v5/organizations/${ORG}/checkout-intents/777`);
      assert.equal(c.options.method ?? 'GET', 'GET');
      assert.equal(c.options.headers.Authorization, `Bearer ${TOKEN}`);
    },
  );
});

test('getCheckoutIntent: non-2xx response → throws', async () => {
  await withFetch(
    () => new Response('not found', { status: 404 }),
    async () => {
      await assert.rejects(() => getCheckoutIntent(1), /checkout-intent read failed \(404\)/);
    },
  );
});
