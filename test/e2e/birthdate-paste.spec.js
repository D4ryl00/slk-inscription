import { test, expect } from '@playwright/test';

// A birthdate is carried around already written — in a message, a spreadsheet,
// another form — so members paste it rather than retype it. The native date
// field ignores a paste on its own, hence the handler in main.js.
//
// This has to be exercised through the real clipboard and real key events,
// because the bug it guards against was invisible to everything else: Firefox
// does fire the paste, but retargets it to <body> instead of the focused date
// field, so a listener on the input never runs. The parser was fine, its unit
// tests passed, and the field stayed empty.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Puts `text` on the real clipboard the way a person does: type, select, copy. */
async function copyToClipboard(page, text) {
  await page.evaluate(() => {
    const ta = document.createElement('textarea');
    ta.id = '__clip';
    ta.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
    document.body.appendChild(ta);
  });
  await page.click('#__clip');
  await page.keyboard.type(text);
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press(`${MOD}+c`);
  await page.evaluate(() => document.getElementById('__clip').remove());
}

const birthdate = (page) => page.locator('input[name="dateNaissance"]');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('a birthdate pasted in the French order fills the field', async ({ page }) => {
  await copyToClipboard(page, '16/05/1951');
  await birthdate(page).click();
  await page.keyboard.press(`${MOD}+v`);
  await expect(birthdate(page)).toHaveValue('1951-05-16');
});

test('a pasted birthdate reaches the price, not just the field', async ({ page }) => {
  await page.selectOption('#offerId', 'karate-mix-boxing');
  await expect(page.locator('#priceTotal')).toHaveText('—');

  await copyToClipboard(page, '16/05/1951');
  await birthdate(page).click();
  await page.keyboard.press(`${MOD}+v`);

  // Setting .value fires no 'input' event, so the handler owes the form a
  // refresh; without it the date lands but the tariff never follows.
  await expect(page.locator('#priceTotal')).toHaveText('330,00 €');
});

test('an ambiguous paste is left alone rather than guessed', async ({ page }) => {
  // Two-digit year: 1951 or 2051? Refused by design — a misread birthdate does
  // not show up on the price, so nothing would catch it.
  await copyToClipboard(page, '16/05/51');
  await birthdate(page).click();
  await page.keyboard.press(`${MOD}+v`);
  await expect(birthdate(page)).toHaveValue('');
});

test('pasting into another field is none of the handler business', async ({ page }) => {
  await copyToClipboard(page, '16/05/1951');
  await page.click('input[name="lieuNaissance"]');
  await page.keyboard.press(`${MOD}+v`);
  await expect(page.locator('input[name="lieuNaissance"]')).toHaveValue('16/05/1951');
  await expect(birthdate(page)).toHaveValue('');
});
