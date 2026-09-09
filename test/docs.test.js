import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DOC_LINKS, isMinorFromBirthdate, requiredDocuments } from '../src/shared/docs.js';

// Mid-season reference date (the 2026-2027 season opened in July 2026).
const SEP_2026 = new Date('2026-09-15T12:00:00Z');

const ids = (params) => requiredDocuments(params).map((d) => d.id);

const MINOR_ONLY = ['questionnaire-mineur', 'attestation-mineur', 'certificat-mineur'];
const ADULT_ONLY = ['certificat-medical', 'ko'];

// --- Legal minority ---------------------------------------------------------

test('a member is a minor until the day of their 18th birthday', () => {
  assert.equal(isMinorFromBirthdate('2008-09-16', SEP_2026), true); // 18 tomorrow
  assert.equal(isMinorFromBirthdate('2008-09-15', SEP_2026), false); // 18 today
  assert.equal(isMinorFromBirthdate('2008-09-14', SEP_2026), false); // 18 yesterday
});

test('minority is unknown without a usable birthdate', () => {
  assert.equal(isMinorFromBirthdate('', SEP_2026), null);
  assert.equal(isMinorFromBirthdate('pas-une-date', SEP_2026), null);
});

// --- The two checklists never mix -------------------------------------------

test('an adult is never shown the documents of a minor', () => {
  const got = ids({ isMinor: false, offerId: 'karate-mix-boxing', tariff: 'adult' });
  for (const id of MINOR_ONLY) assert.equal(got.includes(id), false, `${id} shown to an adult`);
});

test('a minor is never shown the documents of an adult', () => {
  const got = ids({ isMinor: true, offerId: 'karate-mix-boxing', tariff: 'youth' });
  for (const id of ADULT_ONLY) assert.equal(got.includes(id), false, `${id} shown to a minor`);
});

test('an adult on a contact offer gets the competitor and KO documents', () => {
  const got = ids({ isMinor: false, offerId: 'karate-mix-boxing', tariff: 'adult' });
  assert.deepEqual(got, ['photo-identite', 'certificat-medical', 'ko']);
});

test('a minor gets the health questionnaire and its two outcomes', () => {
  const got = ids({ isMinor: true, offerId: 'karate-mix-boxing', tariff: 'youth' });
  assert.deepEqual(got, ['photo-identite', ...MINOR_ONLY]);
});

// --- Minor at the adult tariff ----------------------------------------------

test('a minor already on the adult tariff keeps the documents of a minor', () => {
  // Turns 18 during the season (adult tariff) but is still a minor today, so
  // the FFK still wants the parental questionnaire and attestation.
  const got = ids({ isMinor: true, offerId: 'karate-mix-boxing', tariff: 'adult' });
  for (const id of MINOR_ONLY) assert.equal(got.includes(id), true, `${id} missing`);
  for (const id of ADULT_ONLY) assert.equal(got.includes(id), false, `${id} shown to a minor`);
});

test('a minor on the adult tariff is told why the checklist looks younger', () => {
  const docs = requiredDocuments({ isMinor: true, offerId: 'karate-mix-boxing', tariff: 'adult' });
  const notice = docs.find((d) => d.id === 'mineur-tarif-adulte');
  assert.ok(notice, 'expected the explanatory notice');
  assert.equal(docs.indexOf(notice) < docs.findIndex((d) => d.id === 'questionnaire-mineur'), true);
});

test('the notice is only for that mismatch, never for an ordinary minor', () => {
  const youth = ids({ isMinor: true, offerId: 'karate-mix-boxing', tariff: 'youth' });
  assert.equal(youth.includes('mineur-tarif-adulte'), false);
  const adult = ids({ isMinor: false, offerId: 'karate-mix-boxing', tariff: 'adult' });
  assert.equal(adult.includes('mineur-tarif-adulte'), false);
});

// --- Aids add to either checklist -------------------------------------------

test('the PEPS form is asked whatever the age', () => {
  for (const isMinor of [true, false]) {
    const got = ids({ isMinor, offerId: 'karate-mix-boxing', aids: [{ type: 'peps' }] });
    assert.equal(got.includes('peps'), true, `isMinor=${isMinor}`);
  }
});

test('cumulated aids list both checklists', () => {
  const got = ids({
    isMinor: false,
    offerId: 'karate-mix-boxing',
    aids: [{ type: 'passsport', code: 'X' }, { type: 'peps' }],
  });
  assert.equal(got.includes('peps'), true);
  assert.equal(got.includes('passsport'), true);
});

test('no aid selected → neither aid checklist', () => {
  const got = ids({ isMinor: false, offerId: 'karate-mix-boxing', aids: [] });
  assert.equal(got.includes('peps'), false);
  assert.equal(got.includes('passsport'), false);
});

test('a pre-cumulation blob (single `aid`) still lists its checklist', () => {
  const got = ids({ isMinor: false, offerId: 'karate-mix-boxing', aid: { type: 'peps' } });
  assert.equal(got.includes('peps'), true);
});

test('the PEPS form links to the 2026-2027 version', () => {
  const peps = requiredDocuments({
    isMinor: false, offerId: 'karate-mix-boxing', aids: [{ type: 'peps' }],
  }).find((d) => d.id === 'peps');
  assert.equal(peps.link, DOC_LINKS.formulairePeps);
  assert.equal(peps.link.includes('FormulairePEPS20262027'), true);
});
