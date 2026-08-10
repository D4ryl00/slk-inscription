import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OFFERS, ageInSeason, offerAgeWarning, seasonYear } from '../src/shared/config.js';

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

test('no warning when the age matches the offer band', () => {
  // Karaté + Triathlon Enfant/Ado = 6-13 ans.
  assert.equal(offerAgeWarning('karate-mix-boxing-enfant', '2020-03-04', AUG_2026), null); // 6
  assert.equal(offerAgeWarning('karate-mix-boxing-enfant', '2013-11-30', AUG_2026), null); // 13
  // Adulte = 14 ans et plus, unbounded above.
  assert.equal(offerAgeWarning('karate-mix-boxing-adulte', '2012-01-01', AUG_2026), null); // 14
  assert.equal(offerAgeWarning('karate-mix-boxing-adulte', '1960-01-01', AUG_2026), null); // 66
});

test('warning when the member is too young for the offer', () => {
  // Triathlon Enfant/Ado starts at 8 on the planning; a 7-year-old is flagged.
  const w = offerAgeWarning('mix-boxing-enfant', '2019-05-02', AUG_2026);
  assert.ok(w, 'expected a warning');
  assert.equal(w.age, 7);
  assert.equal(w.seasonYear, 2026);
  assert.match(w.message, /7 ans en 2026/);
  assert.match(w.message, /8 à 13 ans/);
  assert.match(w.message, /Shidokan Triathlon — Enfant \/ Ado/);
});

test('warning when the member is too old for a child offer', () => {
  const w = offerAgeWarning('karate-mix-boxing-enfant', '2012-09-09', AUG_2026); // 14
  assert.ok(w, 'expected a warning');
  assert.equal(w.age, 14);
  assert.match(w.message, /6 à 13 ans/);
});

test('warning when an adult offer is picked for a child', () => {
  const w = offerAgeWarning('mix-boxing-adulte', '2016-02-20', AUG_2026); // 10
  assert.ok(w, 'expected a warning');
  assert.equal(w.age, 10);
  assert.match(w.message, /14 ans et plus/);
});

test('the 6-year-old karateka of the combined offer is NOT warned', () => {
  // The band is a union: karate opens at 6 even though the triathlon opens at 8,
  // and there is no "Karaté seul" offer to buy instead.
  assert.equal(offerAgeWarning('karate-mix-boxing-enfant', '2020-07-01', AUG_2026), null);
});

test('Cardio-Budo has no age band → never warns', () => {
  for (const id of ['cardio-1', 'cardio-2', 'cardio-3']) {
    assert.equal(offerAgeWarning(id, '2019-01-01', AUG_2026), null);
    assert.equal(offerAgeWarning(id, '1950-01-01', AUG_2026), null);
  }
});

test('no warning without an offer or without a birthdate', () => {
  assert.equal(offerAgeWarning('', '2020-01-01', AUG_2026), null);
  assert.equal(offerAgeWarning('offre-inconnue', '2020-01-01', AUG_2026), null);
  assert.equal(offerAgeWarning('mix-boxing-enfant', '', AUG_2026), null);
});

test('every age band is coherent (min <= max) and the karate floor is 6', () => {
  for (const o of OFFERS) {
    if (!o.ageRange) continue;
    const { min, max } = o.ageRange;
    if (min != null && max != null) {
      assert.ok(min <= max, `${o.id}: min ${min} > max ${max}`);
    }
  }
  assert.equal(OFFERS.find((o) => o.id === 'karate-mix-boxing-enfant').ageRange.min, 6);
});
