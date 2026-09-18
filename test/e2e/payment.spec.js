import { test, expect } from '@playwright/test';

// Members read "Mode de règlement en ligne (carte bancaire)" as an obligation
// and did not realise they could settle at the office instead. Every method is
// now a tick box and none is ticked on arrival, so the form commits to nothing
// on the member's behalf. What follows is the behaviour that makes that safe:
// the card can no longer be charged a remainder nobody asked for, and the
// amounts must add up to the total before the form will go anywhere.

// Enough of the form for a price to exist: the tariff needs a birthdate, and
// the new-member answer is pinned so the flat fee is part of every total below
// rather than something the numbers silently depend on.
const TOTAL = '271,00 €'; // 265 € (tarif Enfant/Ado) + 6 € de frais nouvel adhérent

async function priceable(page) {
  await page.check('input[name="nouvelAdherent"][value="Oui"]');
  await page.fill('input[name="dateNaissance"]', '2010-05-04');
  await page.selectOption('#offerId', 'karate-mix-boxing');
  await expect(page.locator('#priceTotal')).toHaveText(TOTAL);
}

const submit = (page) => page.locator('#submitBtn');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await priceable(page);
});

test('no method is ticked on arrival, and nothing can be submitted yet', async ({ page }) => {
  await expect(page.locator('#payByCard')).not.toBeChecked();
  for (const key of ['cheque', 'cheques_vacances', 'especes']) {
    await expect(page.locator(`input[name="offlineUse_${key}"]`)).not.toBeChecked();
    // An amount field on show without its method ticked would read as a thing
    // to fill in, which is the confusion this whole block exists to remove.
    await expect(page.locator(`[data-amount-for="${key}"]`)).toBeHidden();
  }
  await expect(page.locator('#cardPlanWrap')).toBeHidden();
  await expect(submit(page)).toBeDisabled();
  // The label must not promise an outcome that is not on offer.
  await expect(submit(page)).toHaveText("Payer et m'inscrire");
  await expect(page.locator('#priceDetail')).toContainText('Choisissez votre mode de règlement');
});

test('the instalment choice belongs to the card and appears with it', async ({ page }) => {
  await expect(page.locator('#cardPlanWrap')).toBeHidden();
  await page.check('#payByCard');
  await expect(page.locator('#cardPlanWrap')).toBeVisible();
  await expect(page.locator('#cardAmountLine')).toContainText('271,00 €');
  await expect(submit(page)).toBeEnabled();
  await expect(submit(page)).toHaveText("Payer 271,00 € en ligne et m'inscrire");
});

test('an offline amount is deducted from what the card takes', async ({ page }) => {
  await page.check('#payByCard');
  await page.check('input[name="offlineUse_cheque"]');
  await page.fill('input[name="offline_cheque"]', '100');
  await expect(page.locator('#priceCb')).toHaveText('171,00 €');
  await expect(submit(page)).toHaveText("Payer 171,00 € en ligne et m'inscrire");
});

test('an uncovered remainder blocks the form instead of reaching the card', async ({ page }) => {
  await page.check('input[name="offlineUse_cheque"]');
  await page.fill('input[name="offline_cheque"]', '100');
  await expect(page.locator('#paymentError')).toContainText('Il reste 171,00 € à régler');
  await expect(page.locator('#priceCb')).toHaveText('0,00 €');
  await expect(submit(page)).toBeDisabled();
});

test('"max" covers the total offline and the card is never involved', async ({ page }) => {
  await page.check('input[name="offlineUse_especes"]');
  await page.click('.max-btn[data-offline-max="especes"]');
  await expect(page.locator('input[name="offline_especes"]')).toHaveValue('271.00');
  await expect(page.locator('#paymentError')).toBeHidden();
  await expect(submit(page)).toBeEnabled();
  await expect(submit(page)).toHaveText('Valider mon inscription (règlement au bureau)');
});

// The amount field is hidden with its method, so a value left behind would keep
// weighing on the total out of sight.
test('unticking a method drops the amount it carried', async ({ page }) => {
  await page.check('#payByCard');
  await page.check('input[name="offlineUse_cheque"]');
  await page.fill('input[name="offline_cheque"]', '100');
  await expect(page.locator('#priceCb')).toHaveText('171,00 €');

  await page.uncheck('input[name="offlineUse_cheque"]');
  await expect(page.locator('input[name="offline_cheque"]')).toHaveValue('');
  await expect(page.locator('#priceCb')).toHaveText('271,00 €');
});

test('a card ticked over a total already covered says so instead of erroring', async ({ page }) => {
  await page.check('input[name="offlineUse_especes"]');
  await page.click('.max-btn[data-offline-max="especes"]');
  await page.check('#payByCard');
  await expect(page.locator('#cardAmountLine')).toContainText('couvrent déjà le total');
  await expect(page.locator('#paymentError')).toBeHidden();
  await expect(submit(page)).toBeEnabled();
});
