import { test, expect } from '@playwright/test';

// Two layout bugs prompted this suite, and both had the same shape: an element
// ended up with a size the stylesheet never gave it. On iOS the date field grew
// past its panel (318px inside a 294px slot) because Safari sizes the native
// widget itself; on Android a consent checkbox was squeezed to a dot because
// `min-width: 0` had removed its automatic flex minimum.
//
// Each was checked by reintroducing it and watching what these tests did.
// The squeezed checkbox IS caught — drop `min-width: 0` back onto the controls
// and every project reports `[name=rgpdConsent] squeezed to 4x13`. The iOS date
// field is NOT: remove its `appearance: none` and all 16 tests stay green,
// because the overflow comes from Safari's native widget on the device, which
// no amount of emulation supplies. So this file is a net under the class of
// defect, not a substitute for opening the Netlify deploy preview on a real
// phone whenever form-control CSS changes.
//
// Geometry is asserted, never pixels: the club swaps the banner and the
// schedule every season, so image baselines would need constant re-approval.

/**
 * Collects every broken invariant on the page as a list of readable strings.
 * Runs in the browser, so it is self-contained: no imports, no closures.
 */
function invariants() {
  const out = [];
  const px = (v) => parseFloat(v) || 0;
  const visible = (el) => el.getClientRects().length > 0;
  const name = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const n = el.name ? `[name=${el.name}]` : '';
    return `${el.tagName.toLowerCase()}${id}${n}`;
  };
  const legendOf = (fs) => (fs.querySelector('legend')?.textContent || '').trim().slice(0, 40);

  // The page must never scroll sideways, at any width.
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    out.push(`document scrolls horizontally: ${de.scrollWidth} > ${de.clientWidth}`);
  }

  for (const fs of document.querySelectorAll('fieldset')) {
    if (!visible(fs)) continue;
    const cs = getComputedStyle(fs);
    const box = fs.getBoundingClientRect();
    const left = box.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const right = box.right - px(cs.borderRightWidth) - px(cs.paddingRight);

    // A control must stay within the panel that frames it. This is the iOS date
    // field: it overflowed its fieldset while the document itself still fitted.
    for (const el of fs.querySelectorAll('input, select, textarea')) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.right > right + 0.5 || b.left < left - 0.5) {
        out.push(
          `${name(el)} escapes fieldset "${legendOf(fs)}": ` +
            `${Math.round(b.left)}→${Math.round(b.right)} outside ${Math.round(left)}→${Math.round(right)}`,
        );
      }
    }
  }

  // A box or radio sits in a flex row next to its label; it must never be the
  // thing that gives way when the text is long. 12px is already small — the
  // Android regression had shrunk one to a few pixels.
  for (const el of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
    if (!visible(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 12 || b.height < 12) {
      out.push(`${name(el)} squeezed to ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
  }

  // Fields sharing a grid line up. `.col2` spans both columns, so it is only
  // comparable with the rest once the grid has collapsed to a single column.
  for (const grid of document.querySelectorAll('.grid2')) {
    if (!visible(grid)) continue;
    const singleColumn = getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1;
    const widths = [];
    for (const label of grid.children) {
      if (!singleColumn && label.classList.contains('col2')) continue;
      const ctrl = label.querySelector('input, select, textarea');
      if (!ctrl || !visible(ctrl)) continue;
      widths.push({ el: name(ctrl), w: Math.round(ctrl.getBoundingClientRect().width) });
    }
    const distinct = [...new Set(widths.map((x) => x.w))];
    if (distinct.length > 1) {
      out.push(`fields in one .grid2 have different widths: ${widths.map((x) => `${x.el}=${x.w}`).join(', ')}`);
    }
  }

  return out;
}

/** Picks an offer by id and waits for the conditional blocks to settle. */
async function chooseOffer(page, offerId) {
  await page.selectOption('#offerId', offerId);
  await page.waitForFunction(
    (id) => document.getElementById('offerId').value === id,
    offerId,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#offerId')).toBeVisible();
});

test('the empty form holds its layout', async ({ page }) => {
  expect(await page.evaluate(invariants)).toEqual([]);
});

test('the layout holds once the karate blocks appear', async ({ page }) => {
  await chooseOffer(page, 'karate-mix-boxing');
  await expect(page.locator('#karateFields')).toBeVisible();
  await expect(page.locator('#motivationsField')).toBeVisible();
  expect(await page.evaluate(invariants)).toEqual([]);
});

test('the layout holds once the cardio day picker appears', async ({ page }) => {
  await chooseOffer(page, 'cardio-1');
  await expect(page.locator('#cardioDaysWrap')).toBeVisible();
  expect(await page.evaluate(invariants)).toEqual([]);
});

// Guards the rule that decides where a required mark goes: onto the legend for a
// real group (several boxes sharing a name), onto each label otherwise. Grouping
// the three consents into a fieldset had silently moved all three onto the
// legend, leaving each consent unmarked.
test('required marks land on group legends but stay on individual consents', async ({ page }) => {
  await chooseOffer(page, 'karate-mix-boxing');
  const marks = await page.evaluate(() => ({
    onLegends: [...document.querySelectorAll('legend .req')].map((el) =>
      el.parentElement.textContent.replace('*', '').trim().slice(0, 30),
    ),
    onConsents: document.querySelectorAll('.check-text .req').length,
  }));
  expect(marks.onLegends).toHaveLength(2); // "Nouvel adhérent ?" and the social-media question
  expect(marks.onConsents).toBe(3);
});
