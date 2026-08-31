import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OFFERS,
  ageInSeason,
  getOffer,
  offerMinAgeWarning,
  offerPriceAnnual,
  seasonYear,
  tariffForAge,
} from '../src/shared/config.js';

// Reference dates, both inside the 2026-2027 season (July 2026 → June 2027).
const AUG_2026 = new Date('2026-08-11T12:00:00Z');
const JUN_2027 = new Date('2027-06-15T12:00:00Z');

test('season year: July onwards belongs to the season that opens in September', () => {
  assert.equal(seasonYear(new Date('2026-06-30T12:00:00Z')), 2025); // still 2025-2026
  assert.equal(seasonYear(new Date('2026-07-01T12:00:00Z')), 2026); // 2026-2027 opens
  assert.equal(seasonYear(AUG_2026), 2026);
  assert.equal(seasonYear(new Date('2026-09-05T12:00:00Z')), 2026);
  assert.equal(seasonYear(new Date('2027-01-10T12:00:00Z')), 2026); // mid-season
  assert.equal(seasonYear(JUN_2027), 2026); // last month of the season
});

test('season boundary is read in Europe/Paris, not UTC', () => {
  // 2026-06-30 23:30 UTC is already 2026-07-01 in Paris (UTC+2 in summer).
  assert.equal(seasonYear(new Date('2026-06-30T23:30:00Z')), 2026);
});

test('age is counted by civil year, not by birthday', () => {
  // The club's rule: born anywhere in 2020 → 6 years old for the 2026 season.
  assert.equal(ageInSeason('2020-01-01', AUG_2026), 6);
  assert.equal(ageInSeason('2020-12-31', AUG_2026), 6);
  // Same season, checked in June 2027 → still 6, the season did not roll over.
  assert.equal(ageInSeason('2020-06-15', JUN_2027), 6);
});

test('age is null when the birthdate is missing or malformed', () => {
  assert.equal(ageInSeason('', AUG_2026), null);
  assert.equal(ageInSeason(undefined, AUG_2026), null);
  assert.equal(ageInSeason('pas-une-date', AUG_2026), null);
});

// --- Tariff band ------------------------------------------------------------

test('the youth tariff runs up to 17 years old included', () => {
  assert.equal(tariffForAge(6), 'youth');
  assert.equal(tariffForAge(13), 'youth');
  assert.equal(tariffForAge(17), 'youth');
});

test('the adult tariff starts at 18', () => {
  assert.equal(tariffForAge(18), 'adult');
  assert.equal(tariffForAge(66), 'adult');
});

test('teenagers of 14 to 17 pay the youth tariff (they train with the adults)', () => {
  const offer = getOffer('karate-mix-boxing');
  for (const age of [14, 15, 16, 17]) {
    assert.equal(tariffForAge(age), 'youth', `age ${age}`);
    assert.equal(offerPriceAnnual(offer, age), 265, `age ${age}`);
  }
});

test('the tariff band is unknown without an age', () => {
  assert.equal(tariffForAge(null), null);
});

// --- Offer prices -----------------------------------------------------------

test('an age-banded offer prices the youth and the adult differently', () => {
  const karate = getOffer('karate-mix-boxing');
  assert.equal(offerPriceAnnual(karate, 10), 265);
  assert.equal(offerPriceAnnual(karate, 30), 330);
  const triathlon = getOffer('mix-boxing');
  assert.equal(offerPriceAnnual(triathlon, 10), 265);
  assert.equal(offerPriceAnnual(triathlon, 30), 280);
});

test('an age-banded offer has no price until the age is known', () => {
  assert.equal(offerPriceAnnual(getOffer('karate-mix-boxing'), null), null);
});

test('Cardio-Budo has a single price, whatever the age', () => {
  const cardio = getOffer('cardio-1');
  assert.equal(offerPriceAnnual(cardio, 10), 180);
  assert.equal(offerPriceAnnual(cardio, 40), 180);
  assert.equal(offerPriceAnnual(cardio, null), 180);
});

// --- Minimum-age notice -----------------------------------------------------

test('warning when the member is below the karate floor of 6', () => {
  const w = offerMinAgeWarning('karate-mix-boxing', '2021-05-02', AUG_2026); // 5
  assert.ok(w, 'expected a warning');
  assert.equal(w.age, 5);
  assert.equal(w.seasonYear, 2026);
  assert.equal(w.minAge, 6);
  assert.match(w.message, /5 ans en 2026/);
  assert.match(w.message, /6 ans/);
  assert.match(w.message, /Karaté Shidokan \+ Shidokan Triathlon/);
});

test('warning when the member is below the triathlon floor of 8', () => {
  const w = offerMinAgeWarning('mix-boxing', '2019-05-02', AUG_2026); // 7
  assert.ok(w, 'expected a warning');
  assert.equal(w.age, 7);
  assert.match(w.message, /8 ans/);
});

test('no warning at the floor itself', () => {
  assert.equal(offerMinAgeWarning('karate-mix-boxing', '2020-03-04', AUG_2026), null); // 6
  assert.equal(offerMinAgeWarning('mix-boxing', '2018-03-04', AUG_2026), null); // 8
});

test('no member is ever too OLD for an offer', () => {
  for (const age of [14, 17, 18, 40, 80]) {
    const birthdate = `${2026 - age}-06-01`;
    for (const id of ['karate-mix-boxing', 'mix-boxing']) {
      assert.equal(offerMinAgeWarning(id, birthdate, AUG_2026), null, `${id} at ${age}`);
    }
  }
});

test('Cardio-Budo has no age floor → never warns', () => {
  for (const id of ['cardio-1', 'cardio-2', 'cardio-3']) {
    assert.equal(offerMinAgeWarning(id, '2019-01-01', AUG_2026), null);
    assert.equal(offerMinAgeWarning(id, '1950-01-01', AUG_2026), null);
  }
});

test('no warning without an offer or without a birthdate', () => {
  assert.equal(offerMinAgeWarning('', '2020-01-01', AUG_2026), null);
  assert.equal(offerMinAgeWarning('offre-inconnue', '2020-01-01', AUG_2026), null);
  assert.equal(offerMinAgeWarning('mix-boxing', '', AUG_2026), null);
});

// --- Offer catalogue --------------------------------------------------------

test('offers are listed by discipline, without an age category', () => {
  assert.deepEqual(
    OFFERS.map((o) => o.id),
    ['karate-mix-boxing', 'mix-boxing', 'cardio-1', 'cardio-2', 'cardio-3'],
  );
  for (const o of OFFERS) {
    assert.doesNotMatch(o.label, /Enfant|Ado|Adulte/, `${o.id} still carries an age category`);
  }
});

test('last season ids still resolve to their discipline offer', () => {
  assert.equal(getOffer('karate-mix-boxing-enfant').id, 'karate-mix-boxing');
  assert.equal(getOffer('karate-mix-boxing-adulte').id, 'karate-mix-boxing');
  assert.equal(getOffer('mix-boxing-enfant').id, 'mix-boxing');
  assert.equal(getOffer('mix-boxing-adulte').id, 'mix-boxing');
});

test('an unknown offer id resolves to nothing', () => {
  assert.equal(getOffer('offre-inconnue'), null);
  assert.equal(getOffer(''), null);
});

test('every age floor is a positive number of years', () => {
  for (const o of OFFERS) {
    if (o.minAge == null) continue;
    assert.ok(Number.isInteger(o.minAge) && o.minAge > 0, `${o.id}: bad minAge ${o.minAge}`);
  }
  assert.equal(getOffer('karate-mix-boxing').minAge, 6);
  assert.equal(getOffer('mix-boxing').minAge, 8);
});
