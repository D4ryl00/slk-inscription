import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePastedBirthdate } from '../src/birthdate.js';

// Fixed reference so "not in the future" stays stable whenever the suite runs.
const REF = new Date('2026-09-08T12:00:00Z');
const parse = (text) => parsePastedBirthdate(text, REF);

test('French order, any non-digit as separator', () => {
  for (const text of ['31/01/2000', '31-01-2000', '31.01.2000', '31 01 2000', '31/01-2000']) {
    assert.equal(parse(text), '2000-01-31', text);
  }
});

test('ISO order is recognised by its leading 4-digit group', () => {
  assert.equal(parse('2000-01-31'), '2000-01-31');
  assert.equal(parse('2000/01/31'), '2000-01-31');
});

test('single-digit day and month are padded', () => {
  assert.equal(parse('1/2/2000'), '2000-02-01');
});

// A date on the 19th or 20th opens on digits that read as a year of their own
// ('20/05' → '2005'), so the layout cannot be settled on the first four digits.
test('8 bare digits on the 19th or 20th are still read day-first', () => {
  assert.equal(parse('20051987'), '1987-05-20');
  assert.equal(parse('19051987'), '1987-05-19');
  assert.equal(parse('20122001'), '2001-12-20');
  assert.equal(parse('19011900'), '1900-01-19');
});

test('every real ddmmyyyy paste round-trips, whatever the day', () => {
  const pad = (n) => String(n).padStart(2, '0');
  const failures = [];
  for (let y = 1900; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1 || dt.getUTCFullYear() !== y) continue;
        const want = `${y}-${pad(m)}-${pad(d)}`;
        if (parse(`${pad(d)}${pad(m)}${y}`) !== want) failures.push(`${pad(d)}${pad(m)}${y}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('8 bare digits: day first unless they open on a plausible year', () => {
  assert.equal(parse('31012000'), '2000-01-31');
  assert.equal(parse('20000131'), '2000-01-31');
});

test('surrounding whitespace is ignored', () => {
  assert.equal(parse('  31/01/2000\n'), '2000-01-31');
});

test('a two-digit year is refused, not guessed', () => {
  assert.equal(parse('31/01/00'), null);
  assert.equal(parse('31/01/99'), null);
});

test('impossible dates are refused', () => {
  assert.equal(parse('31/02/2000'), null); // February has no 31st
  assert.equal(parse('29/02/2001'), null); // 2001 is not a leap year
  assert.equal(parse('00/01/2000'), null);
  assert.equal(parse('31/13/2000'), null);
});

test('29/02 of a leap year is accepted', () => {
  assert.equal(parse('29/02/2000'), '2000-02-29');
});

test('years outside a plausible lifetime are refused', () => {
  assert.equal(parse('31/01/1899'), null);
  assert.equal(parse('31/01/2030'), null); // in the future
});

test('anything that is not a full numeric date is refused', () => {
  for (const text of ['1er janvier 2000', '2000-01', 'janvier', '', '   ', '1234567', null, undefined]) {
    assert.equal(parse(text), null, String(text));
  }
});
