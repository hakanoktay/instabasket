// The welcome tab that opens once, right after installing.
const { test, expect } = require('./fixtures');

test('installing opens the welcome tab with the privacy promise first', async ({ context, extensionId }) => {
  const page = context.pages().find((p) => p.url().endsWith('/welcome.html'))
    || await context.waitForEvent('page', { predicate: (p) => p.url().endsWith('/welcome.html'), timeout: 5000 });
  expect(page.url()).toBe(`chrome-extension://${extensionId}/welcome.html`);
  await expect(page.locator('h1')).toHaveText(/Never asks for your password.\s*Your data never leaves your computer./);
  await expect(page.locator('.tag')).toHaveText(['No password', 'No tracking', 'No ads']);
  await expect(page.locator('.steps li')).toHaveCount(3);
  await expect(page.locator('a.cta')).toHaveAttribute('href', 'https://www.instagram.com/');
  await expect(page.locator('footer a')).toHaveText(['Zetasis', '☕ Buy me a coffee']);
  await expect(page.locator('footer a').first()).toHaveAttribute('href', 'https://zetasis.net');
  await expect(page.locator('img.logo')).toHaveJSProperty('complete', true);
  expect(await page.locator('img.logo').evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
});

test('the welcome page loads nothing from the internet', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`chrome-extension://${extensionId}/welcome.html`);
  await page.waitForLoadState('networkidle');
  expect(requests.filter((u) => !u.startsWith('chrome-extension://'))).toEqual([]);
});
