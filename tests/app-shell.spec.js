const { test, expect } = require('./fixtures');
const seed = (page, data) => page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, data);
const DATA = { lists: [], 'm:A': { key: 'A', username: 'alice', lists: [], addedAt: 1 }, 'p:alice': { username: 'alice', lists: [], addedAt: 2 } };

test('the popup button opens the app in a new tab', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const [app] = await Promise.all([
    context.waitForEvent('page', { predicate: (p) => p.url().includes('/app.html') }),
    popup.click('#open-app'),
  ]);
  await expect(app).toHaveURL(`chrome-extension://${extensionId}/app.html#media`);
});

test('sidebar shows counts and the router switches views', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await seed(page, DATA);
  await page.reload();
  await expect(page.locator('.nav [data-view="media"] .count')).toHaveText('1');
  await expect(page.locator('.nav [data-view="profiles"] .count')).toHaveText('1');
  await page.click('.nav [data-view="profiles"]');
  await expect(page).toHaveURL(/#profiles$/);
  await expect(page.locator('main')).toHaveAttribute('data-view', 'profiles');
  await page.goto(`chrome-extension://${extensionId}/app.html#nonsense`);
  await expect(page.locator('main')).toHaveAttribute('data-view', 'media');
});

test('narrow windows collapse the sidebar and do not scroll sideways', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await expect(page.locator('body')).toHaveClass(/narrow/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800);
});

test('the popup header stays on one line with the Open KeepKeep button', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  expect(await popup.evaluate(() => { const h = document.querySelector('#main-view > header'); return h.scrollWidth - h.clientWidth; })).toBeLessThanOrEqual(0);
  expect(await popup.locator('#main-view > header').evaluate((h) => h.getBoundingClientRect().height)).toBeLessThanOrEqual(56);
});
