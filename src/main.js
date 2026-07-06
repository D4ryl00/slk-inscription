// Form logic: dynamic filling, live price, conditional documents checklist,
// submit to /api/create-checkout then redirect.

import {
  AIDS,
  CARDIO_DAYS,
  GRADES_SHIDOKAN,
  MOTIVATIONS,
  MOTIVATIONS_KARATE_ONLY,
  OFFERS,
  PAYMENT_METHODS,
  getOffer,
} from './shared/config.js';
import { computePrice, formatEuros } from './shared/pricing.js';
import { isMinorFromBirthdate, requiredDocuments } from './shared/docs.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#form');

// --- Fill the offers list ---------------------------------------------------
const offerSelect = $('#offerId');
for (const o of OFFERS) {
  const opt = document.createElement('option');
  opt.value = o.id;
  opt.textContent = `${o.label} — ${formatEuros(o.priceAnnual * 100)}`;
  offerSelect.appendChild(opt);
}

// --- Cardio-Budo days --------------------------------------------------------
const cardioWrap = $('#cardioDaysWrap');
const cardioDays = $('#cardioDays');
for (const day of CARDIO_DAYS) {
  const id = `day-${day}`;
  const label = document.createElement('label');
  label.className = 'chip';
  label.innerHTML = `<input type="checkbox" name="cardioJours" value="${day}" id="${id}" /> ${day}`;
  cardioDays.appendChild(label);
}

// --- Karate-conditional fields: grade + motivations -------------------------
const karateFields = $('#karateFields');
const gradeSelect = $('#gradeShidokan');
for (const g of GRADES_SHIDOKAN) {
  const opt = document.createElement('option');
  opt.value = g;
  opt.textContent = g;
  gradeSelect.appendChild(opt);
}
const motivationsField = $('#motivationsField');
const motivationsWrap = $('#motivations');
for (const m of MOTIVATIONS) {
  const label = document.createElement('label');
  label.className = 'chip';
  if (MOTIVATIONS_KARATE_ONLY.includes(m)) label.dataset.karateOnly = '1';
  label.innerHTML = `<input type="checkbox" name="motivations" value="${m}" /> ${m}`;
  motivationsWrap.appendChild(label);
}

function setRequired(container, required) {
  container.querySelectorAll('input, select').forEach((el) => {
    el.required = required;
  });
}

// --- Red asterisk on required fields ----------------------------------------
// Recomputed on every refresh() because some fields become required dynamically
// (grade/motivations for Karate, aid code for Pass'Sport).
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
    // Radios/checkboxes grouped in a fieldset → asterisk carried by the legend.
    if (isBox && label.closest('fieldset')) return;
    // Checkbox (consents): asterisk at the end of the text (inside .check-text to
    // stay on the same line in the flex layout). Text/select field:
    // "Label *" right before the control.
    if (isBox) addMark(label.querySelector('.check-text') || label, 'append');
    else addMark(ctrl, 'before');
  });

  // Required radio/checkbox groups → asterisk on the fieldset legend.
  form.querySelectorAll('fieldset').forEach((fs) => {
    const legend = fs.querySelector('legend');
    const grouped = fs.querySelector('input[type="radio"]:required, input[type="checkbox"]:required');
    if (legend && grouped) addMark(legend, 'append');
  });
}

// --- Offline payment methods (entered amounts) ------------------------------
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

// --- Aid: show the code field if an aid is chosen ---------------------------
const aidType = $('#aidType');
const aidCodeWrap = $('#aidCodeWrap');
aidType.addEventListener('change', () => {
  // The code is only asked for aids that require it (Pass'Sport).
  // For PEPS, no online code: the form is brought to the office.
  const needsCode = Boolean(AIDS[aidType.value]?.requiresCode);
  aidCodeWrap.classList.toggle('hidden', !needsCode);
  $('#aidCode').required = needsCode;
  refresh();
});

// --- Passeport Shidokan: track manual toggle to respect the user's choice ----
const passeportWrap = $('#passeportWrap');
const passeportCheckbox = $('#passeportShidokan');
let passeportTouched = false;
passeportCheckbox.addEventListener('change', () => {
  passeportTouched = true;
});

// --- Read the current form state --------------------------------------------
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
    passeportShidokan: fd.get('passeportShidokan') === 'on',
    offlinePayments: readOfflinePayments(fd),
    reglementInterieur: fd.get('reglementInterieur') === 'on',
    rgpdConsent: fd.get('rgpdConsent') === 'on',
    engagementPieces: fd.get('engagementPieces') === 'on',
  };
}

// --- Dynamic update (price + documents + cardio days) -----------------------
function refresh() {
  const s = readForm();
  const offer = getOffer(s.offerId);
  const isCardio = Boolean(offer && offer.disciplines.includes('cardio'));
  const isKarate = Boolean(offer && offer.disciplines.includes('karate'));
  const isStriking = Boolean(
    offer && (offer.disciplines.includes('boxing') || offer.disciplines.includes('mma')),
  );

  // Cardio days only for cardio offers
  cardioWrap.classList.toggle('hidden', !isCardio);
  // Grade only for Karate offers
  karateFields.classList.toggle('hidden', !isKarate);
  setRequired(karateFields, isKarate);

  // Motivations: shown for Karate AND Boxing/MMA (not for Cardio).
  const showMotivations = isKarate || isStriking;
  motivationsField.classList.toggle('hidden', !showMotivations);
  motivationsWrap.querySelectorAll('label.chip').forEach((label) => {
    const input = label.querySelector('input');
    input.required = false; // multiple choice → never required
    // "Karaté loisir ceinture noire" reserved for offers including karate.
    const hide = !showMotivations || (Boolean(label.dataset.karateOnly) && !isKarate);
    label.classList.toggle('hidden', hide);
    if (hide) input.checked = false; // do not submit a hidden motivation
  });

  // Passeport Shidokan: karate-only add-on. Default-checked for new members;
  // existing members can add it (e.g. if theirs expired) but it starts unchecked.
  // Once the user toggles it manually, we stop overriding their choice.
  passeportWrap.classList.toggle('hidden', !isKarate);
  if (!isKarate) passeportCheckbox.checked = false;
  else if (!passeportTouched) passeportCheckbox.checked = s.nouvelAdherent === 'Oui';
  s.passeportShidokan = isKarate && passeportCheckbox.checked;

  // Price
  const price = computePrice({
    offerId: s.offerId,
    paymentPlan: s.paymentPlan,
    familyAlreadyRegistered: s.familyAlreadyRegistered,
    aid: s.aid,
    passeportShidokan: s.passeportShidokan,
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
    submitBtn.disabled = Boolean(offer); // block if an offer is chosen but the price is invalid
  } else {
    submitBtn.disabled = false;
    totalEl.textContent = formatEuros(price.totalCents);
    cbEl.textContent = formatEuros(price.cbAmountCents);
    const parts = [`Cotisation : ${formatEuros(price.baseCents)}`];
    if (price.familyDiscountCents > 0) parts.push(`Réduction famille : −${formatEuros(price.familyDiscountCents)}`);
    if (price.aidApplied) parts.push(`Aide ${price.aidApplied.label} : −${formatEuros(price.aidApplied.amountCents)}`);
    if (price.passeportCents > 0) parts.push(`Passeport Shidokan : +${formatEuros(price.passeportCents)}`);
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

  // Documents to bring
  const list = $('#docsList');
  list.innerHTML = '';
  const minor = isMinorFromBirthdate(s.dateNaissance);
  if (!s.offerId || minor === null) {
    list.innerHTML = '<li class="muted">Renseignez la date de naissance et la formule pour voir les pièces à rapporter.</li>';
  } else {
    const docs = requiredDocuments({ isMinor: minor, offerId: s.offerId, aid: s.aid });
    if (!docs.length) {
      list.innerHTML = '<li class="muted">Aucune pièce particulière à rapporter pour cette formule.</li>';
    }
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

// --- Submit ------------------------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('#formError');
  errorEl.textContent = '';

  if (!form.reportValidity()) return;

  const s = readForm();

  // "At least one day" validation for Cardio-Budo (not doable in native HTML)
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
    refresh(); // restore the button label
  }
});
