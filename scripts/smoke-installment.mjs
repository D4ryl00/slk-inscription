// Smoke test for the installment path of the webhook (plan §3), against the REAL
// HelloAsso API but a forged notification body.
//
// Why forged: HelloAsso enforces one installment per month ("Une seule échéance
// par mois est autorisée"), so a real 2nd installment cannot be produced on
// demand. The body only feeds the local guards though — every value written comes
// from getPayment() — so pointing a forged body at a REAL payment id of the
// organization exercises the whole path: API verification, organization check,
// row lookup, append, cell write.
//
//   npm run smoke:installment                  # list payments, do nothing
//   npm run smoke:installment -- --yes         # send, using the newest payment
//   npm run smoke:installment -- --yes --seed  # add a member row FIRST, then send
//   npm run smoke:installment -- --yes --payment 64747 --url https://…/api/helloasso-webhook
//
// --seed exists because the installment path only ever APPENDS to an existing
// member row — it never creates one. On a fresh test sheet the only reachable
// outcome is "member row not found", so --seed writes a throwaway member whose
// payment cell references the chosen order, making the append observable.
//
// Expected outcomes, both of them a pass:
//   "installment: member row not found"  → the payment's order is not in the Sheet.
//                                          Everything up to the row lookup worked.
//   "installment N recorded"             → a line was appended. Check the Sheet.

import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const confirmed = process.argv.includes('--yes');
const seed = process.argv.includes('--seed');
const target = arg('url', 'http://localhost:8888/api/helloasso-webhook');

const env = (process.env.HELLOASSO_ENV || 'sandbox').toLowerCase();
const BASE = env === 'prod' ? 'https://api.helloasso.com' : 'https://api.helloasso-sandbox.com';
const ORG = process.env.HELLOASSO_ORG_SLUG;

if (seed && env === 'prod') {
  console.error('Refusing to seed in the prod environment: it would add a fake member to the');
  console.error('real registry. Drop --seed, or point the environment at sandbox.');
  process.exit(2);
}

console.log(`environment : ${env}${env === 'prod' ? '   ⚠️  PRODUCTION' : ''}`);
console.log(`organization: ${ORG}`);
console.log(`sheet       : ${process.env.GOOGLE_SHEET_ID}   ⟵ make sure this is the TEST sheet`);
console.log(`target      : ${target}\n`);

const tokenRes = await fetch(`${BASE}/oauth2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.HELLOASSO_CLIENT_ID,
    client_secret: process.env.HELLOASSO_CLIENT_SECRET,
  }),
});
if (!tokenRes.ok) throw new Error(`OAuth failed (${tokenRes.status}): ${await tokenRes.text()}`);
const { access_token } = await tokenRes.json();

const listRes = await fetch(`${BASE}/v5/organizations/${ORG}/payments?pageSize=10`, {
  headers: { Authorization: `Bearer ${access_token}` },
});
if (!listRes.ok) throw new Error(`payments list failed (${listRes.status}): ${await listRes.text()}`);
const { data: payments } = await listRes.json();
if (!payments?.length) throw new Error('No payment in this organization to smoke-test against.');

console.log('paymentId  order      state        amount');
for (const p of payments) {
  console.log(
    String(p.id).padEnd(10),
    String(p.order?.id ?? '-').padEnd(10),
    String(p.state).padEnd(12),
    p.amount,
  );
}

const chosen = arg('payment')
  ? payments.find((p) => String(p.id) === arg('payment')) || { id: Number(arg('payment')) }
  : payments[0];
console.log(`\nchosen payment: ${chosen.id} (order ${chosen.order?.id ?? '?'})`);

if (!confirmed) {
  console.log('\nDry run. Re-run with --yes to POST the notification (add --seed to plant a row first).');
  process.exit(0);
}

if (seed) {
  const { appendRow } = await import('../netlify/functions/lib/google.js');
  const { buildSheetRow } = await import('../src/shared/sheet-row.js');
  await appendRow(
    buildSheetRow(
      { prenom: 'Smoke', nom: 'Test', email: 'smoke@example.invalid', offerId: 'smoke-test' },
      {
        date: new Date().toISOString(),
        netTotalCents: chosen.amount,
        onlineAmountCents: chosen.amount,
        onlinePaymentId: String(chosen.order?.id ?? ''),
        onlinePlanLabel: 'CB 3x',
      },
    ),
  );
  console.log(`seeded a "Smoke Test" row referencing order ${chosen.order?.id} — delete it afterwards`);
}

// installmentNumber is forged: it only has to clear extractInstallmentRef. The
// rank actually written comes from the payment read back through the API.
const notification = {
  eventType: 'Payment',
  data: { id: chosen.id, installmentNumber: 2 },
  metadata: {},
};

const res = await fetch(target, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(notification),
});
console.log(`\n${res.status} ${await res.text()}`);
