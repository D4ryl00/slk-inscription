// Helpers PURS pour le traitement des notifications HelloAsso (aucun I/O),
// isolés pour être testables. Le webhook s'appuie dessus pour le parsing, mais
// la SOURCE DE VÉRITÉ du paiement reste la relecture du checkout-intent via API.

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
