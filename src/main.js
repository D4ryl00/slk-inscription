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
  TARIFFS,
  ageInSeason,
  getOffer,
  offerMinAgeWarning,
  offerPriceAnnual,
} from './shared/config.js';
import { computePrice, formatEuros } from './shared/pricing.js';
import { isMinorFromBirthdate, requiredDocuments } from './shared/docs.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#form');

// --- Fill the offers list ---------------------------------------------------
// One option per discipline. Their price depends on the birthdate, so the
// options are created once and their LABEL is refreshed on every keystroke
// (rewriting textContent keeps the member's selection, re-creating them wouldn't).
const offerSelect = $('#offerId');
const offerOptions = new Map();
for (const o of OFFERS) {
  const opt = document.createElement('option');
  opt.value = o.id;
  offerSelect.appendChild(opt);
  offerOptions.set(o.id, opt);
}

/** Whole euros, as printed on the club's price list: "265 €". */
const wholeEuros = (amount) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

/** Option text: the applicable price once the age is known, both prices before. */
function offerOptionLabel(offer, age) {
  const price = offerPriceAnnual(offer, age);
  if (price != null) return `${offer.label} — ${formatEuros(price * 100)}`;
  const { youth, adult } = offer.priceAnnual;
  return `${offer.label} — ${wholeEuros(youth)} ou ${wholeEuros(adult)} selon l'âge`;
}

function updateOfferLabels(age) {
  for (const o of OFFERS) offerOptions.get(o.id).textContent = offerOptionLabel(o, age);
}

const ageWarningEl = $('#ageWarning');

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

  // Cardio-Budo days: the offer dictates how many sessions.
  //  • 1 or 2 sessions → show the picker and force exactly that many days.
  //  • 3 sessions      → they attend every day, so hide the picker and select all.
  //  • not cardio      → hide and clear.
  const cardioSessions = isCardio ? offer.sessions || 0 : 0;
  const dayBoxes = [...cardioDays.querySelectorAll('input[name="cardioJours"]')];
  if (!isCardio) {
    cardioWrap.classList.add('hidden');
    dayBoxes.forEach((b) => { b.checked = false; b.disabled = false; });
  } else if (cardioSessions >= 3) {
    cardioWrap.classList.add('hidden');
    dayBoxes.forEach((b) => { b.checked = true; b.disabled = false; });
  } else {
    cardioWrap.classList.remove('hidden');
    // Trim extra days if the offer now allows fewer, then cap the selection.
    let checked = dayBoxes.filter((b) => b.checked);
    while (checked.length > cardioSessions) {
      checked.pop().checked = false;
      checked = dayBoxes.filter((b) => b.checked);
    }
    const atCap = checked.length >= cardioSessions;
    dayBoxes.forEach((b) => { b.disabled = !b.checked && atCap; });
    const legend = cardioWrap.querySelector('legend');
    if (legend) {
      legend.textContent = `Cardio-Budo — sélectionnez ${cardioSessions} jour${cardioSessions > 1 ? 's' : ''} par semaine`;
    }
  }

  // Offer prices follow the birthdate; the age also drives the notice below.
  const age = ageInSeason(s.dateNaissance);
  updateOfferLabels(age);

  // Age floor: advisory notice only, never blocks the submit.
  const ageWarn = offerMinAgeWarning(s.offerId, s.dateNaissance);
  ageWarningEl.textContent = ageWarn ? ageWarn.message : '';
  ageWarningEl.classList.toggle('hidden', !ageWarn);

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

  // Price
  const price = computePrice({
    offerId: s.offerId,
    dateNaissance: s.dateNaissance,
    paymentPlan: s.paymentPlan,
    familyAlreadyRegistered: s.familyAlreadyRegistered,
    nouvelAdherent: s.nouvelAdherent,
    aid: s.aid,
    offlinePayments: s.offlinePayments,
  });
  const totalEl = $('#priceTotal');
  const cbEl = $('#priceCb');
  const detail = $('#priceDetail');
  const submitBtn = $('#submitBtn');
  const helloAssoNote = $('#helloAssoNote');

  if (!price.ok) {
    totalEl.textContent = '—';
    cbEl.textContent = '—';
    detail.textContent = offer ? price.error : 'Sélectionnez une formule.';
    submitBtn.disabled = Boolean(offer); // block if an offer is chosen but the price is invalid
  } else {
    submitBtn.disabled = false;
    totalEl.textContent = formatEuros(price.totalCents);
    cbEl.textContent = formatEuros(price.cbAmountCents);
    const tariff = price.tariff ? TARIFFS[price.tariff] : null;
    const parts = [
      `Cotisation : ${formatEuros(price.baseCents)}` +
        (tariff ? ` (tarif ${tariff.label})` : ''),
    ];
    if (price.licenseFees?.length) {
      const lic = price.licenseFees
        .map((l) => `${formatEuros(l.amountCents)} de ${l.label}`)
        .join(' et ');
      parts.push(`Dont ${lic} (compris dans la cotisation)`);
    }
    if (price.familyDiscountCents > 0) parts.push(`Réduction famille : −${formatEuros(price.familyDiscountCents)}`);
    if (price.lateDiscountCents > 0) parts.push(`Remise saison entamée : −${formatEuros(price.lateDiscountCents)}`);
    if (price.aidApplied) parts.push(`Aide ${price.aidApplied.label} : −${formatEuros(price.aidApplied.amountCents)}`);
    if (price.newMemberFeeCents > 0) parts.push(`Frais nouvel adhérent : +${formatEuros(price.newMemberFeeCents)}`);
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

  // HelloAsso adds an optional contribution on its own payment page — flag it
  // only when there is actually an online card payment.
  helloAssoNote.classList.toggle('hidden', !(price.ok && price.cbAmountCents > 0));

  // Documents to bring
  const list = $('#docsList');
  list.innerHTML = '';
  const minor = isMinorFromBirthdate(s.dateNaissance);
  if (!s.offerId || minor === null) {
    list.innerHTML = '<li class="muted">Renseignez la date de naissance et la formule pour voir les pièces à rapporter.</li>';
  } else {
    const docs = requiredDocuments({
      isMinor: minor, // LEGAL minority today — not the tariff band
      offerId: s.offerId,
      tariff: price.ok ? price.tariff : null,
      aid: s.aid,
    });
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

// --- Planning lightbox ------------------------------------------------------
// Enlarging the schedule used to open it in another tab. It now opens over the
// page in a native <dialog>: no navigation, so the form keeps everything the
// member already typed. Escape and the backdrop close it for free; the ✕ is
// there because that is what people look for on a touch screen.
const planningLink = $('#planningLink');
const planningDialog = $('#planningDialog');

// It opens fitted to the window, and zooms on demand: on a phone the schedule
// is a wide landscape image, so "fitted" is only ~1.1x the inline thumbnail and
// the timetables stay unreadable without zooming in.
const PLANNING_ZOOM = 2.5; // × the fitted size, capped at the image's own pixels

if (planningLink && planningDialog) {
  const thumb = planningLink.querySelector('img');
  const full = $('#planningDialogImg');
  const zoomBtn = $('#planningZoom');
  full.src = thumb.getAttribute('src');
  full.alt = thumb.alt;

  const isZoomed = () => planningDialog.classList.contains('is-zoomed');

  /** Back to "whole schedule, as large as the window allows". */
  function fit() {
    planningDialog.classList.remove('is-zoomed');
    full.style.width = '';
    planningDialog.scrollTo(0, 0);
    zoomBtn.textContent = '+';
    zoomBtn.setAttribute('aria-label', 'Zoomer sur le planning');
    refreshZoomAffordance();
  }

  /** Zoom in, keeping the point at (clientX, clientY) under the finger. */
  function zoom(clientX, clientY) {
    const before = full.getBoundingClientRect();
    const fx = (clientX - before.left) / before.width;
    const fy = (clientY - before.top) / before.height;

    planningDialog.classList.add('is-zoomed');
    full.style.width = `${Math.min(full.naturalWidth, before.width * PLANNING_ZOOM)}px`;
    zoomBtn.textContent = '−';
    zoomBtn.setAttribute('aria-label', 'Afficher le planning entier');

    // offsetLeft/Top are relative to the dialog: it is the offsetParent here.
    const box = planningDialog.getBoundingClientRect();
    planningDialog.scrollLeft = full.offsetLeft + fx * full.offsetWidth - (clientX - box.left);
    planningDialog.scrollTop = full.offsetTop + fy * full.offsetHeight - (clientY - box.top);
  }

  /** Zooming is pointless once the image is already shown at its own pixels. */
  function refreshZoomAffordance() {
    const shown = full.getBoundingClientRect().width;
    planningDialog.classList.toggle('can-zoom', shown < full.naturalWidth - 1);
  }

  function toggleZoomFromCenter() {
    if (isZoomed()) return fit();
    const r = full.getBoundingClientRect();
    zoom(r.left + r.width / 2, r.top + r.height / 2);
  }

  planningLink.addEventListener('click', (e) => {
    // Leave new-tab intents (cmd/ctrl/shift-click) to the browser.
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    planningDialog.showModal();
    fit();
  });
  full.addEventListener('click', (e) => {
    if (isZoomed()) fit();
    else if (planningDialog.classList.contains('can-zoom')) zoom(e.clientX, e.clientY);
  });
  zoomBtn.addEventListener('click', toggleZoomFromCenter);
  $('#planningClose').addEventListener('click', () => planningDialog.close());
  // A click landing on the dialog itself is a click outside the image.
  planningDialog.addEventListener('click', (e) => {
    if (e.target === planningDialog) planningDialog.close();
  });
  // Reopening should always start from the fitted view.
  planningDialog.addEventListener('close', fit);
  window.addEventListener('resize', () => {
    if (planningDialog.open && !isZoomed()) refreshZoomAffordance();
  });
}

// --- ID photo: read + downscale client-side ---------------------------------
// Phone photos are several MB; the submission travels as JSON (base64), so we
// re-encode to a bounded-size JPEG to stay well under the function payload limit.
const PHOTO_MAX_DIM = 1200; // px, longest side
const PHOTO_QUALITY = 0.85;
const PHOTO_MAX_BYTES = 20 * 1024 * 1024; // reject absurd files before decoding

function readPhotoDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type.startsWith('image/')) return reject(new Error('Le fichier doit être une image.'));
    if (file.size > PHOTO_MAX_BYTES) return reject(new Error('La photo est trop volumineuse.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire la photo.'));
    };
    img.src = url;
  });
}

// --- Submit ------------------------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('#formError');
  errorEl.textContent = '';

  if (!form.reportValidity()) return;

  const s = readForm();

  // Cardio-Budo day count must match the offer (not doable in native HTML).
  // 3-session offers select every day automatically, so they need no check.
  const offer = getOffer(s.offerId);
  if (offer && offer.disciplines.includes('cardio') && offer.sessions < 3) {
    const need = offer.sessions;
    if (s.cardioJours.length !== need) {
      errorEl.textContent = `Sélectionnez exactement ${need} jour${need > 1 ? 's' : ''} pour le Cardio-Budo.`;
      return;
    }
  }

  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Traitement…';

  // Optional ID photo: read + downscale before sending (attached to the payload).
  try {
    s.photo = await readPhotoDataUrl($('#photo').files[0]);
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    refresh();
    return;
  }

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
