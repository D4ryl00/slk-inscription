// POST /api/create-checkout
// Recomputes the price (source of truth) and the amount left to pay by card.
//  - Card remainder > 0: stores the submission in Blobs + creates the HelloAsso
//    checkout-intent; the Sheet row is written at the webhook, after payment.
//  - Card remainder = 0 (everything paid offline): NO trip through HelloAsso,
//    the row is written DIRECTLY into the Sheet.

import { getStore } from '@netlify/blobs';
import { buildInstallments, computePrice } from '../../src/shared/pricing.js';
import { buildSheetRow } from '../../src/shared/sheet-row.js';
import { appendRow, uploadMemberPhoto } from './lib/google.js';
import { createCheckoutIntent } from './lib/helloasso.js';

const REQUIRED = ['prenom', 'nom', 'email', 'dateNaissance', 'offerId', 'paymentPlan'];

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  let s;
  try {
    s = await req.json();
  } catch {
    return json({ error: 'Corps JSON invalide.' }, 400);
  }

  const missing = REQUIRED.filter((k) => !s[k]);
  if (missing.length) return json({ error: `Champs manquants : ${missing.join(', ')}.` }, 400);
  if (!s.rgpdConsent) return json({ error: 'Le consentement RGPD est obligatoire.' }, 400);
  if (!s.reglementInterieur) {
    return json({ error: 'L\'acceptation du règlement intérieur est obligatoire.' }, 400);
  }

  // --- Price: server-side recompute, never the one sent by the front ----------
  const price = computePrice({
    offerId: s.offerId,
    paymentPlan: s.paymentPlan,
    familyAlreadyRegistered: s.familyAlreadyRegistered,
    nouvelAdherent: s.nouvelAdherent,
    aid: s.aid,
    offlinePayments: s.offlinePayments,
  });
  if (!price.ok) return json({ error: price.error }, 400);

  const site = (process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');
  const planLabel = `CB ${s.paymentPlan}`;

  // ─── 100% offline case: no card payment → direct write ──────────────────────
  if (price.cbAmountCents <= 0) {
    // Optional ID photo → Drive FIRST, so its link goes into the row. Non-fatal:
    // an upload failure must not block registering a member who's already paid.
    let photoUrl = '';
    try {
      const uploaded = await uploadMemberPhoto({ nom: s.nom, prenom: s.prenom, dataUrl: s.photo });
      photoUrl = uploaded?.url || '';
    } catch (err) {
      console.error('create-checkout: photo upload (offline)', err);
    }
    try {
      await appendRow(
        buildSheetRow(s, {
          date: new Date().toISOString(),
          netTotalCents: price.totalCents,
          onlineAmountCents: 0,
          onlinePaymentId: '',
          onlinePlanLabel: '',
          offlinePayments: price.offlinePayments,
          offlineTotalCents: price.offlineTotalCents,
          familyDiscountCents: price.familyDiscountCents,
          lateDiscountCents: price.lateDiscountCents,
          photoUrl,
        }),
      );
    } catch (err) {
      console.error('create-checkout: Sheet write (offline)', err);
      return json({ error: 'Erreur interne (enregistrement). Réessayez.' }, 500);
    }
    return json({ redirectUrl: `${site}/merci?offline=1` });
  }

  // ─── Card payment case ──────────────────────────────────────────────────────
  const memberId = crypto.randomUUID();
  const { initialAmount, terms } = buildInstallments(price.cbAmountCents, s.paymentPlan);

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalAmount: price.cbAmountCents,
      initialAmount,
      terms,
      itemName: `Adhésion SLK — ${price.offer.label}`,
      containsDonation: false,
      payer: { firstName: s.prenom, lastName: s.nom, email: s.email },
      // ⚠️ metadata is returned ONLY in the webhook → that's where we recover memberId
      metadata: { memberId, offerId: s.offerId, paymentPlan: s.paymentPlan, aidType: s.aid?.type || null },
      returnUrl: `${site}/merci?m=${memberId}`,
      backUrl: `${site}/`,
      errorUrl: `${site}/erreur`,
    });
  } catch (err) {
    console.error('create-checkout: HelloAsso', err);
    return json({ error: 'Impossible de contacter HelloAsso. Réessayez plus tard.' }, 502);
  }

  // Stores the submission + price details (re-read by the webhook via memberId).
  try {
    const store = getStore('submissions');
    await store.setJSON(memberId, {
      submission: s,
      price: {
        netTotalCents: price.totalCents,
        familyDiscountCents: price.familyDiscountCents,
        cbAmountCents: price.cbAmountCents,
        offlineTotalCents: price.offlineTotalCents,
        offlinePayments: price.offlinePayments,
        lateDiscountCents: price.lateDiscountCents,
        planLabel,
      },
      checkoutIntentId: intent.id,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('create-checkout: Blobs', err);
    return json({ error: 'Erreur interne (stockage). Réessayez.' }, 500);
  }

  return json({ redirectUrl: intent.redirectUrl });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
