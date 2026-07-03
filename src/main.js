// Logique du formulaire : remplissage dynamique, prix en direct, checklist de
// pièces conditionnelle, envoi vers /api/create-checkout puis redirection.

import { AIDS, CARDIO_DAYS, OFFERS, getOffer } from './shared/config.js';
import { computePrice, formatEuros } from './shared/pricing.js';
import { isMinorFromBirthdate, requiredDocuments } from './shared/docs.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#form');

// --- Remplir la liste des formules ------------------------------------------
const offerSelect = $('#offerId');
for (const o of OFFERS) {
  const opt = document.createElement('option');
  opt.value = o.id;
  opt.textContent = `${o.label} — ${formatEuros(o.priceAnnual * 100)}`;
  offerSelect.appendChild(opt);
}

// --- Jours Cardio-Budo -------------------------------------------------------
const cardioWrap = $('#cardioDaysWrap');
const cardioDays = $('#cardioDays');
for (const day of CARDIO_DAYS) {
  const id = `day-${day}`;
  const label = document.createElement('label');
  label.className = 'chip';
  label.innerHTML = `<input type="checkbox" name="cardioJours" value="${day}" id="${id}" /> ${day}`;
  cardioDays.appendChild(label);
}

// --- Aide : afficher le champ code si une aide est choisie -------------------
const aidType = $('#aidType');
const aidCodeWrap = $('#aidCodeWrap');
aidType.addEventListener('change', () => {
  aidCodeWrap.classList.toggle('hidden', !aidType.value);
  $('#aidCode').required = Boolean(aidType.value);
  refresh();
});

// --- Récupère l'état courant du formulaire ----------------------------------
function readForm() {
  const fd = new FormData(form);
  return {
    nouvelAdherent: fd.get('nouvelAdherent') || '',
    prenom: (fd.get('prenom') || '').trim(),
    nom: (fd.get('nom') || '').trim(),
    dateNaissance: fd.get('dateNaissance') || '',
    lieuNaissance: (fd.get('lieuNaissance') || '').trim(),
    nomParents: (fd.get('nomParents') || '').trim(),
    adresse: {
      numeroRue: (fd.get('adresse_numeroRue') || '').trim(),
      complement: (fd.get('adresse_complement') || '').trim(),
      ville: (fd.get('adresse_ville') || '').trim(),
      codePostal: (fd.get('adresse_codePostal') || '').trim(),
      pays: (fd.get('adresse_pays') || '').trim(),
    },
    email: (fd.get('email') || '').trim(),
    telephone: (fd.get('telephone') || '').trim(),
    reseauxSociaux: fd.get('reseauxSociaux') || '',
    contactConfiance: {
      prenom: (fd.get('cc_prenom') || '').trim(),
      nom: (fd.get('cc_nom') || '').trim(),
      telephone: (fd.get('cc_telephone') || '').trim(),
    },
    offerId: fd.get('offerId') || '',
    motivations: (fd.get('motivations') || '').trim(),
    gradeShidokan: (fd.get('gradeShidokan') || '').trim(),
    cardioJours: fd.getAll('cardioJours'),
    paymentPlan: fd.get('paymentPlan') || '1x',
    aid: aidType.value ? { type: aidType.value, code: (fd.get('aidCode') || '').trim() } : { type: null },
    reglementInterieur: fd.get('reglementInterieur') === 'on',
    rgpdConsent: fd.get('rgpdConsent') === 'on',
    engagementPieces: fd.get('engagementPieces') === 'on',
  };
}

// --- Mise à jour dynamique (prix + pièces + jours cardio) --------------------
function refresh() {
  const s = readForm();
  const offer = getOffer(s.offerId);

  // Jours Cardio uniquement pour les formules cardio
  cardioWrap.classList.toggle('hidden', !(offer && offer.disciplines.includes('cardio')));

  // Prix
  const price = computePrice({
    offerId: s.offerId,
    paymentPlan: s.paymentPlan,
    aid: s.aid,
  });
  const total = $('#priceTotal');
  const detail = $('#priceDetail');
  if (!price.ok) {
    total.textContent = '—';
    detail.textContent = offer ? price.error : 'Sélectionnez une formule.';
  } else {
    total.textContent = formatEuros(price.totalCents);
    const parts = [`Cotisation : ${formatEuros(price.baseCents)}`];
    if (price.familyDiscountCents > 0) parts.push(`Réduction famille : −${formatEuros(price.familyDiscountCents)}`);
    if (price.aidApplied) parts.push(`Aide ${price.aidApplied.label} : −${formatEuros(price.aidApplied.amountCents)}`);
    parts.push(s.paymentPlan === '3x' ? 'Réglé en 3 fois' : 'Réglé en 1 fois');
    detail.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  }

  // Pièces à rapporter
  const list = $('#docsList');
  list.innerHTML = '';
  const minor = isMinorFromBirthdate(s.dateNaissance);
  if (!s.offerId || minor === null) {
    list.innerHTML = '<li class="muted">Renseignez la date de naissance et la formule pour voir les pièces à rapporter.</li>';
  } else {
    const docs = requiredDocuments({ isMinor: minor, offerId: s.offerId, aid: s.aid });
    for (const d of docs) {
      const li = document.createElement('li');
      const link = d.link ? ` <a href="${d.link}" target="_blank" rel="noopener">${d.linkLabel || 'document'}</a>` : '';
      li.innerHTML = `<strong>${d.label}</strong>${link}${d.help ? `<br><span class="muted">${d.help}</span>` : ''}`;
      list.appendChild(li);
    }
  }
}

form.addEventListener('input', refresh);
form.addEventListener('change', refresh);
refresh();

// --- Envoi -------------------------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('#formError');
  errorEl.textContent = '';

  if (!form.reportValidity()) return;

  const s = readForm();
  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Redirection vers le paiement…';

  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur inconnue.');
    if (!data.redirectUrl) throw new Error('Réponse invalide du serveur.');
    window.location.href = data.redirectUrl;
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Payer et m\'inscrire';
  }
});
