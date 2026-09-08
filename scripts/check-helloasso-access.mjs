// Checks that the HelloAsso API client may read individual payments — the
// AccessTransactions privilege, which the webhook needs to record the 2nd and
// 3rd installments of a payment plan (GET /v5/payments/{id}).
//
//   npm run check:helloasso                    # uses .env (sandbox by default)
//   HELLOASSO_ENV=prod \
//   HELLOASSO_CLIENT_ID=… HELLOASSO_CLIENT_SECRET=… HELLOASSO_ORG_SLUG=… \
//     npm run check:helloasso                  # checks the PRODUCTION client
//
// ⚠️ Never probe with an arbitrary id such as 1: HelloAsso answers 403 for any
// resource that is not yours, exactly as it does for a missing privilege. Only a
// REAL payment id of the organization tells the two apart — which is why this
// script looks one up first.
// Read-only: it lists and reads, it never writes.

import { readFileSync } from 'node:fs';

// Real environment variables win, so prod credentials can be passed inline.
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env: everything must then come from the environment.
}

const env = (process.env.HELLOASSO_ENV || 'sandbox').toLowerCase();
const BASE = env === 'prod' ? 'https://api.helloasso.com' : 'https://api.helloasso-sandbox.com';
const ORG = process.env.HELLOASSO_ORG_SLUG;

const missing = ['HELLOASSO_CLIENT_ID', 'HELLOASSO_CLIENT_SECRET', 'HELLOASSO_ORG_SLUG']
  .filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(2);
}

console.log(`environment : ${env}  (${BASE})`);
console.log(`organization: ${ORG}\n`);

const tokenRes = await fetch(`${BASE}/oauth2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.HELLOASSO_CLIENT_ID,
    client_secret: process.env.HELLOASSO_CLIENT_SECRET,
  }),
});
if (!tokenRes.ok) {
  console.error(`✗ OAuth failed (${tokenRes.status}). Wrong client id/secret, or wrong environment.`);
  process.exit(1);
}
const { access_token } = await tokenRes.json();
const headers = { Authorization: `Bearer ${access_token}` };
console.log('✓ OAuth token obtained');

const listRes = await fetch(`${BASE}/v5/organizations/${ORG}/payments?pageSize=5`, { headers });
if (!listRes.ok) {
  console.error(`✗ GET /v5/organizations/${ORG}/payments → ${listRes.status}`);
  console.error(
    listRes.status === 403
      ? '  The client cannot list this organization\'s transactions. Check the org slug, and\n' +
        '  enable transaction access for this API client in the HelloAsso back office.'
      : `  ${(await listRes.text()).slice(0, 200)}`,
  );
  process.exit(1);
}
const { data: payments } = await listRes.json();
console.log(`✓ payments list readable (${payments.length} returned)`);

if (!payments.length) {
  console.log('\n⚠ No payment in this organization yet, so the per-payment read cannot be');
  console.log('  probed. Re-run once a first payment exists.');
  process.exit(0);
}

const probe = payments[0];
const oneRes = await fetch(`${BASE}/v5/payments/${probe.id}`, { headers });
console.log(`  GET /v5/payments/${probe.id} → ${oneRes.status}`);

if (oneRes.ok) {
  console.log('\nVERDICT: AccessTransactions is GRANTED — installments can be verified.');
  process.exit(0);
}
console.log(
  oneRes.status === 403
    ? '\nVERDICT: AccessTransactions is MISSING.\n' +
      '  This id IS the organization\'s own, so 403 here means the privilege, not ownership.\n' +
      '  Enable it for this API client in the HelloAsso back office, then re-run.\n' +
      '  Until then, installments 2 and 3 will be logged and skipped, never recorded.'
    : `\nVERDICT: unexpected ${oneRes.status} — ${(await oneRes.text()).slice(0, 200)}`,
);
process.exit(1);
