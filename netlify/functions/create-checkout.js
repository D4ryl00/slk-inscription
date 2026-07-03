// POST /api/create-checkout
// Recalcule le prix (source de vérité) et le montant restant à payer en CB.
//  - Reste CB > 0 : stocke la soumission dans Blobs + crée le checkout-intent
//    HelloAsso ; la ligne Sheet est écrite au webhook, après paiement.
//  - Reste CB = 0 (tout réglé hors ligne) : AUCUN passage par HelloAsso, la
//    ligne est écrite DIRECTEMENT dans le Sheet.

import { getStore } from '@netlify/blobs';
import { buildInstallments, computePrice } from '../../src/shared/pricing.js';
import { buildSheetRow } from '../../src/shared/sheet-row.js';
import { appendRow } from './lib/google.js';
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

  // --- Prix : recalcul serveur, jamais celui envoyé par le front --------------
  const price = computePrice({
    offerId: s.offerId,
    paymentPlan: s.paymentPlan,
    familyAlreadyRegistered: s.familyAlreadyRegistered,
    aid: s.aid,
    offlinePayments: s.offlinePayments,
  });
  if (!price.ok) return json({ error: price.error }, 400);

  const site = (process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');
  const planLabel = `CB ${s.paymentPlan}`;

  // ─── Cas 100 % hors ligne : aucun paiement CB → écriture directe ────────────
  if (price.cbAmountCents <= 0) {
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
        }),
      );
    } catch (err) {
      console.error('create-checkout: écriture Sheet (hors ligne)', err);
      return json({ error: 'Erreur interne (enregistrement). Réessayez.' }, 500);
    }
    return json({ redirectUrl: `${site}/merci?offline=1` });
  }

  // ─── Cas avec paiement CB ───────────────────────────────────────────────────
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
      // ⚠️ metadata n'est renvoyé QUE dans le webhook → c'est là qu'on retrouve memberId
      metadata: { memberId, offerId: s.offerId, paymentPlan: s.paymentPlan, aidType: s.aid?.type || null },
      returnUrl: `${site}/merci?m=${memberId}`,
      backUrl: `${site}/`,
      errorUrl: `${site}/erreur`,
    });
  } catch (err) {
    console.error('create-checkout: HelloAsso', err);
    return json({ error: 'Impossible de contacter HelloAsso. Réessayez plus tard.' }, 502);
  }

  // Stocke la soumission + le détail du prix (relus par le webhook via memberId).
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
