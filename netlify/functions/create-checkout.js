// POST /api/create-checkout
// Recalcule le prix (source de vérité), stocke la soumission dans Netlify Blobs,
// crée le checkout-intent HelloAsso et renvoie l'URL de paiement.
// AUCUNE écriture dans le Sheet ici : elle a lieu au webhook, après paiement.

import { getStore } from '@netlify/blobs';
import { buildInstallments, computePrice } from '../../src/shared/pricing.js';
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
  });
  if (!price.ok) return json({ error: price.error }, 400);
  if (price.totalCents <= 0) {
    return json({ error: 'Montant à payer nul — vérifiez l\'offre/les aides.' }, 400);
  }

  const memberId = crypto.randomUUID();
  const planLabel = `CB ${s.paymentPlan}`;
  const { initialAmount, terms } = buildInstallments(price.totalCents, s.paymentPlan);
  const site = (process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');

  let intent;
  try {
    intent = await createCheckoutIntent({
      totalAmount: price.totalCents,
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

  // Stocke la soumission (relue par le webhook via memberId).
  try {
    const store = getStore('submissions');
    await store.setJSON(memberId, {
      submission: s,
      price: {
        totalCents: price.totalCents,
        planLabel,
        familyDiscountCents: price.familyDiscountCents,
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
