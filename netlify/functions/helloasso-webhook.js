// POST /api/helloasso-webhook  (URL à déclarer dans l'admin HelloAsso)
// Reçoit la notification de paiement, la VÉRIFIE via l'API (le corps est
// falsifiable), puis écrit l'adhérent dans le Google Sheet et purge le blob.
//
// On répond toujours 200 (sauf corps illisible) pour ne pas déclencher de
// tempête de retries ; l'écriture ne se fait que si le paiement est confirmé.

import { getStore } from '@netlify/blobs';
import { getCheckoutIntent, isCheckoutPaid } from './lib/helloasso.js';
import { appendRow, columnContains } from './lib/google.js';
import { PAIEMENT_COL_INDEX, buildSheetRow } from '../../src/shared/sheet-row.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Corps invalide', { status: 400 });
  }

  // metadata peut être à la racine ou sous data selon l'événement.
  const metadata = payload?.metadata || payload?.data?.metadata || {};
  const memberId = metadata.memberId;
  if (!memberId) return ack('notification sans memberId (ignorée)');

  const store = getStore('submissions');
  let record;
  try {
    record = await store.get(memberId, { type: 'json' });
  } catch (err) {
    console.error('webhook: lecture Blobs', err);
    return ack('erreur lecture stockage');
  }
  if (!record) return ack('aucune soumission (déjà traitée ou expirée)');

  // --- Vérification serveur : relire le checkout-intent -----------------------
  let intent;
  try {
    intent = await getCheckoutIntent(record.checkoutIntentId);
  } catch (err) {
    console.error('webhook: vérif HelloAsso', err);
    return ack('vérification HelloAsso indisponible');
  }
  if (!isCheckoutPaid(intent)) return ack('paiement non confirmé');

  const order = intent.order || {};
  const paymentId = String(order.id ?? order.payments?.[0]?.id ?? record.checkoutIntentId);

  // --- Déduplication (webhook rejoué) -----------------------------------------
  try {
    if (await columnContains(PAIEMENT_COL_INDEX, paymentId)) {
      await store.delete(memberId);
      return ack('déjà enregistré');
    }
  } catch (err) {
    // En cas d'échec de lecture, on continue : le risque de doublon est faible
    // et préférable à un adhérent payé non enregistré.
    console.error('webhook: dédup', err);
  }

  const pay = {
    date: order.date || new Date().toISOString(),
    amountCents: record.price.totalCents,
    planLabel: record.price.planLabel,
    paymentId,
  };

  try {
    await appendRow(buildSheetRow(record.submission, pay));
  } catch (err) {
    // On NE purge PAS le blob : on veut pouvoir rejouer/écrire manuellement.
    console.error('webhook: écriture Sheet', err);
    return ack('échec écriture Sheet (blob conservé pour rejeu)');
  }

  await store.delete(memberId);
  return ack('adhérent enregistré');
};

function ack(msg) {
  console.log('webhook:', msg);
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
