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
