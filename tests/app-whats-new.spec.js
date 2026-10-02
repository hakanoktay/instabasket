// What's new: opens once after an update that has notes (never on patch-only updates).
const { test, expect } = require('./fixtures');

test('shouldShowWhatsNew', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  const r = await page.evaluate(() => [
    shouldShowWhatsNew('1.0.0', '1.1.0'), shouldShowWhatsNew('1.1.0', '1.1.1'),
    shouldShowWhatsNew('1.1.0', '1.1.0'), shouldShowWhatsNew('1.0.0', '9.9.9'),
    shouldShowWhatsNew('1.1.0', '1.0.0'), shouldShowWhatsNew('1.0.0', 'x'), shouldShowWhatsNew(undefined, '1.1.0'),
  ]);
  expect(r).toEqual([true, false, false, false, false, false, false]); // 9.9.9 has no notes
});

test('pagesToOpen: install opens welcome, update opens what\'s new only when it should', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  const r = await page.evaluate(() => [
    pagesToOpen({ reason: 'install' }, '1.1.0'),
    pagesToOpen({ reason: 'update', previousVersion: '1.0.0' }, '1.1.0'),
    pagesToOpen({ reason: 'update', previousVersion: '1.1.0' }, '1.1.1'),
    pagesToOpen({ reason: 'update', previousVersion: '1.0.0' }, '1.2.0'),
    pagesToOpen({ reason: 'chrome_update' }, '1.1.0'),
  ]);
  expect(r).toEqual(['app.html#welcome', 'app.html#whats-new', null, null, null]);
});

test('the view lists the notes', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#whats-new`);
  await expect(page.locator('.whats-new li').first()).toBeVisible();
  await expect(page.locator('.whats-new h1')).toContainText("What's new in KeepKeep 1.1.0");
  await expect(page.locator('.whats-new li')).toHaveCount(4);
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.click('.whats-new a.go');
  await expect(page).toHaveURL(/#media$/);
});
