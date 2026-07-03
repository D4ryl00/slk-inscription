// Helpers PURS pour le traitement des notifications HelloAsso (aucun I/O),
// isolés pour être testables. Le webhook s'appuie dessus pour le parsing, mais
// la SOURCE DE VÉRITÉ du paiement reste la relecture du checkout-intent via API.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérifie l'authenticité d'une notification HelloAsso.
 * Signature = HMAC-SHA256(corps BRUT, signatureKey), encodée en hexadécimal
 * minuscule, transmise dans le header `x-ha-signature`. Comparaison à temps
 * constant. ⚠️ Fonctionnalité réservée aux partenaires : si aucune clé n'est
 * configurée, le webhook s'en remet à la revérification via l'API.
 * @param {string} rawBody corps brut de la requête (pas le JSON re-sérialisé)
 * @param {string} signatureHex valeur du header x-ha-signature
 * @param {string} signatureKey clé secrète de l'URL de notification
 * @returns {boolean}
 */
export function verifyHelloAssoSignature(rawBody, signatureHex, signatureKey) {
  if (!signatureKey || !signatureHex || typeof rawBody !== 'string') return false;
  const expected = createHmac('sha256', signatureKey).update(rawBody, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(String(signatureHex));
  if (expectedBuf.length !== providedBuf.length) return false; // timingSafeEqual exige l'égalité
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Extrait le `memberId` d'une notification HelloAsso.
 * Format documenté : { eventType, data, metadata } — `metadata` à la racine
 * (renvoie ce qui a été passé à la création du checkout-intent). On tolère aussi
 * `data.metadata` par sécurité.
 * @returns {string|null}
 */
export function extractMemberId(payload) {
  const metadata = payload?.metadata || payload?.data?.metadata || {};
  return metadata.memberId || null;
}
