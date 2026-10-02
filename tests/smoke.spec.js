// Checks that the test setup itself works: the extension loads, its popup
// opens without errors and its content scripts run on an Instagram page.
const { test, expect } = require('./fixtures');

test('popup opens without errors', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('body')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('content scripts run on instagram.com', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://www.instagram.com/?page=video');
  await expect(page.locator('.keepkeep-video')).toHaveCount(1, { timeout: 5000 });
});

test('settings open and close without leaving focus on a hidden button', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const warnings = [];
  page.on('console', (m) => warnings.push(m.text()));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.click('#settings');
  await expect(page.locator('#settings-view')).toBeVisible();
  await expect(page.locator('#settings-back')).toBeFocused();
  await page.click('#settings-back');
  await expect(page.locator('#settings-view')).toBeHidden();
  await expect(page.locator('#settings')).toBeFocused();
  await page.click('#settings');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeFocused();
  expect(warnings.filter((w) => /aria-hidden/.test(w))).toEqual([]);
});

test('popup: credit line, and About in the settings', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('#credit')).toHaveText('Made by Zetasis · ☕ Buy me a coffee');
  expect(await page.locator('#credit a').evaluateAll((as) => as.map((a) => a.href))).toEqual(['https://zetasis.net/', 'https://buymeacoffee.com/zetasis']);
  await page.click('#settings');
  const about = page.locator('.about');
  await expect(about.locator('.version')).toHaveText(/^v\d/);
  await expect(about.locator('.tag')).toHaveText(['No password', 'No tracking', 'No ads']);
  await expect(about.locator('.about-links a')).toHaveText(['Made by Zetasis', '☕ Buy me a coffee', 'Privacy policy', 'Report a problem']);
  // Nothing widens the popup (measured after the pane's slide-in).
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(400);
  expect(await page.locator('.settings-body').evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
});
