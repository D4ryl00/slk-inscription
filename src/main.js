// Logique du formulaire : remplissage dynamique, prix en direct, checklist de
// pièces conditionnelle, envoi vers /api/create-checkout puis redirection.

import {
  AIDS,
  CARDIO_DAYS,
  GRADES_SHIDOKAN,
  MOTIVATIONS,
  OFFERS,
  PAYMENT_METHODS,
  getOffer,
} from './shared/config.js';
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

// --- Champs conditionnels à Karaté : grade + motivations --------------------
const karateFields = $('#karateFields');
const gradeSelect = $('#gradeShidokan');
for (const g of GRADES_SHIDOKAN) {
  const opt = document.createElement('option');
  opt.value = g;
  opt.textContent = g;
  gradeSelect.appendChild(opt);
}
const motivationsWrap = $('#motivations');
for (const m of MOTIVATIONS) {
  const label = document.createElement('label');
  label.className = 'chip';
  label.innerHTML = `<input type="checkbox" name="motivations" value="${m}" /> ${m}`;
  motivationsWrap.appendChild(label);
}

function setRequired(container, required) {
  container.querySelectorAll('input, select').forEach((el) => {
    el.required = required;
  });
}

// --- Astérisque rouge sur les champs obligatoires ---------------------------
// Recalculé à chaque refresh() car certains champs deviennent obligatoires
// dynamiquement (grade/motivations pour le Karaté, code d'aide pour Pass'Sport).
function addMark(anchor, mode) {
  const span = document.createElement('span');
  span.className = 'req';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = ' *';
  if (mode === 'before') anchor.parentNode.insertBefore(span, anchor);
  else anchor.appendChild(span);
}

function updateRequiredMarks() {
  form.querySelectorAll('.req').forEach((el) => el.remove());

  form.querySelectorAll('label').forEach((label) => {
    const ctrl = label.querySelector(':scope > input, :scope > select, :scope > textarea');
    if (!ctrl || !ctrl.required) return;
    const isBox = ctrl.type === 'checkbox' || ctrl.type === 'radio';
    // Radios/cases groupés dans un fieldset → astérisque porté par la légende.
    if (isBox && label.closest('fieldset')) return;
    // Case à cocher (consentements) : libellé après la case → astérisque à la fin.
    // Champ texte/select : « Libellé * » juste avant le contrôle.
    addMark(isBox ? label : ctrl, isBox ? 'append' : 'before');
  });

  // Groupes radio/case obligatoires → astérisque sur la légende du fieldset.
  form.querySelectorAll('fieldset').forEach((fs) => {
    const legend = fs.querySelector('legend');
    const grouped = fs.querySelector('input[type="radio"]:required, input[type="checkbox"]:required');
    if (legend && grouped) addMark(legend, 'append');
  });
}

// --- Moyens de règlement hors ligne (montants saisis) -----------------------
const offlineMethodsWrap = $('#offlineMethods');
for (const [key, m] of Object.entries(PAYMENT_METHODS)) {
  const label = document.createElement('label');
  label.innerHTML =
    `${m.label} (€)` +
    `<input type="number" name="offline_${key}" min="0" step="0.01" placeholder="0" />`;
  offlineMethodsWrap.appendChild(label);
}

function readOfflinePayments(fd) {
  const list = [];
  for (const key of Object.keys(PAYMENT_METHODS)) {
    const amount = parseFloat(fd.get(`offline_${key}`) || '0');
    if (amount > 0) list.push({ method: key, amount });
  }
  return list;
}

// --- Aide : afficher le champ code si une aide est choisie -------------------
const aidType = $('#aidType');
const aidCodeWrap = $('#aidCodeWrap');
aidType.addEventListener('change', () => {
  // Le code n'est demandé que pour les aides qui l'exigent (Pass'Sport).
  // Pour le PEPS, pas de code en ligne : le formulaire est rapporté au bureau.
  const needsCode = Boolean(AIDS[aidType.value]?.requiresCode);
  aidCodeWrap.classList.toggle('hidden', !needsCode);
  $('#aidCode').required = needsCode;
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
    motivations: fd.getAll('motivations'),
    gradeShidokan: (fd.get('gradeShidokan') || '').trim(),
    cardioJours: fd.getAll('cardioJours'),
    familyAlreadyRegistered: parseInt(fd.get('familyAlreadyRegistered') || '0', 10) || 0,
    paymentPlan: fd.get('paymentPlan') || '1x',
    aid: aidType.value ? { type: aidType.value, code: (fd.get('aidCode') || '').trim() } : { type: null },
    offlinePayments: readOfflinePayments(fd),
    reglementInterieur: fd.get('reglementInterieur') === 'on',
    rgpdConsent: fd.get('rgpdConsent') === 'on',
    engagementPieces: fd.get('engagementPieces') === 'on',
  };
}

// --- Mise à jour dynamique (prix + pièces + jours cardio) --------------------
function refresh() {
  const s = readForm();
  const offer = getOffer(s.offerId);
  const isCardio = Boolean(offer && offer.disciplines.includes('cardio'));
  const isKarate = Boolean(offer && offer.disciplines.includes('karate'));

  // Jours Cardio uniquement pour les formules cardio
  cardioWrap.classList.toggle('hidden', !isCardio);
  // Grade + motivations uniquement pour les formules Karaté
  karateFields.classList.toggle('hidden', !isKarate);
  setRequired(karateFields, isKarate);
  // Motivations : choix multiple → jamais « required » individuellement.
  motivationsWrap.querySelectorAll('input').forEach((el) => { el.required = false; });

  // Prix
  const price = computePrice({
    offerId: s.offerId,
    paymentPlan: s.paymentPlan,
    familyAlreadyRegistered: s.familyAlreadyRegistered,
    aid: s.aid,
    offlinePayments: s.offlinePayments,
  });
  const totalEl = $('#priceTotal');
  const cbEl = $('#priceCb');
  const detail = $('#priceDetail');
  const submitBtn = $('#submitBtn');

  if (!price.ok) {
    totalEl.textContent = '—';
    cbEl.textContent = '—';
    detail.textContent = offer ? price.error : 'Sélectionnez une formule.';
    submitBtn.disabled = Boolean(offer); // bloque si offre choisie mais prix invalide
  } else {
    submitBtn.disabled = false;
    totalEl.textContent = formatEuros(price.totalCents);
    cbEl.textContent = formatEuros(price.cbAmountCents);
    const parts = [`Cotisation : ${formatEuros(price.baseCents)}`];
    if (price.familyDiscountCents > 0) parts.push(`Réduction famille : −${formatEuros(price.familyDiscountCents)}`);
    if (price.aidApplied) parts.push(`Aide ${price.aidApplied.label} : −${formatEuros(price.aidApplied.amountCents)}`);
    for (const o of price.offlinePayments) parts.push(`${o.label} (hors ligne) : −${formatEuros(o.amountCents)}`);
    parts.push(
      price.cbAmountCents > 0
        ? `À payer en ligne : ${formatEuros(price.cbAmountCents)}${s.paymentPlan === '3x' ? ' en 3 fois' : ''}`
        : 'Aucun paiement en ligne (tout réglé hors ligne)',
    );
    detail.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
    submitBtn.textContent =
      price.cbAmountCents > 0
        ? `Payer ${formatEuros(price.cbAmountCents)} en ligne et m'inscrire`
        : 'Valider mon inscription (règlement au bureau)';
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

  updateRequiredMarks();
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

  // Validation « au moins un jour » pour le Cardio-Budo (non gérable en HTML natif)
  const offer = getOffer(s.offerId);
  if (offer && offer.disciplines.includes('cardio') && s.cardioJours.length === 0) {
    errorEl.textContent = 'Sélectionnez au moins un jour pour le Cardio-Budo.';
    return;
  }

  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Traitement…';

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
    refresh(); // restaure le libellé du bouton
  }
});
