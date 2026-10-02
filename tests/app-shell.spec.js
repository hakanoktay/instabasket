const { test, expect } = require('./fixtures');
const seed = (page, data) => page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, data);
const DATA = { lists: [], 'm:A': { key: 'A', username: 'alice', lists: [], addedAt: 1 }, 'p:alice': { username: 'alice', lists: [], addedAt: 2 } };

test('the popup button opens the app in a new tab', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const [app] = await Promise.all([
    context.waitForEvent('page', { predicate: (p) => /app\.html#media$/.test(p.url()) }),
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

test('the header fits with the page buttons shown (a post tab is open)', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const r = await popup.evaluate(() => {
    document.querySelector('.page-actions').hidden = false;
    document.querySelectorAll('.page-btn').forEach((b) => { b.hidden = false; });
    const h = document.querySelector('#main-view > header');
    const hr = h.getBoundingClientRect();
    const kids = [...document.querySelectorAll('#main-view > header h1, #main-view > header button')].map((e) => e.getBoundingClientRect());
    return { over: Math.max(...kids.map((k) => k.right)) - hr.right, spread: Math.max(...kids.map((k) => k.top + k.height / 2)) - Math.min(...kids.map((k) => k.top + k.height / 2)), scroll: h.scrollWidth - h.clientWidth };
  });
  expect(r.over).toBeLessThanOrEqual(0);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.spread).toBeLessThanOrEqual(3); // one row, nothing wrapped
});

test('a broken hash shows the media view without a page error', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${extensionId}/app.html#100%`);
  await expect(page.locator('main')).toHaveAttribute('data-view', 'media');
  expect(errors).toEqual([]);
});
