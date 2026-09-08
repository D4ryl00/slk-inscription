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
