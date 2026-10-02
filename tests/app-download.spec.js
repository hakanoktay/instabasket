const { test, expect } = require('./fixtures');
const open = async (context, extensionId, data, hash = 'media') => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, data);
  await page.goto(`chrome-extension://${extensionId}/app.html#${hash}`); await page.reload();
  return page;
};
const DATA = {
  'm:A': { key: 'A', type: 'post', username: 'alice', lists: [], addedAt: Date.now() - 1000 },
  'm:B': { key: 'B', type: 'reel', username: 'bob', lists: [], addedAt: Date.now() - 2000 },
};

test('no Instagram tab: a clear message and Open Instagram', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('#bulk-download');
  await expect(page.locator('#notice')).toContainText('Open Instagram in a tab to download');
  await expect(page.locator('#notice a')).toHaveAttribute('href', 'https://www.instagram.com/');
  await expect(page.locator('#notice a')).toHaveAttribute('target', '_blank');
  await page.click('#notice .close');
  await expect(page.locator('#notice')).toHaveCount(0);
});
test('with an Instagram tab, the keys are sent to it', async ({ context, extensionId }) => {
  const ig = await context.newPage(); await ig.goto('https://www.instagram.com/?page=blank');
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:B"] .select');
  await page.click('#bulk-download');
  await expect(page.locator('#notice')).toContainText('Downloading 2 posts in your Instagram tab');
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:B"] .select');
  await page.click('.card[data-key="m:A"] .select'); await page.click('#bulk-download');
  await expect(page.locator('#notice')).toContainText('Downloading 1 post in your Instagram tab');
});
test('content script acknowledges at once; two requests are both accepted and run one after another', async ({ context, extensionId }) => {
  const ig = await context.newPage(); await ig.goto('https://www.instagram.com/?page=blank');
  const page = await open(context, extensionId, DATA);
  const res = await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
    const t0 = Date.now();
    const a = await chrome.tabs.sendMessage(tab.id, { type: 'download-keys', keys: ['m:A', 'm:story:9'] });
    const b = await chrome.tabs.sendMessage(tab.id, { type: 'download-keys', keys: ['m:B'] });
    return { a, b, ms: Date.now() - t0 };
  });
  expect(res.a).toEqual({ ok: true, started: 2 });
  expect(res.b).toEqual({ ok: true, started: 1 });
  expect(res.ms).toBeLessThan(700);
});
test('a tab the content script is not in: reload message', async ({ context, extensionId }) => {
  const ig = await context.newPage(); await ig.goto('https://www.instagram.com/?page=blank');
  const page = await open(context, extensionId, DATA);
  // Simulate an old tab: the content script there answers nothing.
  await page.evaluate(() => { const real = chrome.tabs.sendMessage; chrome.tabs.sendMessage = () => Promise.reject(new Error('Could not establish connection')); window.__real = real; });
  await page.click('.card[data-key="m:A"] .select'); await page.click('#bulk-download');
  await expect(page.locator('#notice')).toContainText('Reload your Instagram tab, then try again');
});
