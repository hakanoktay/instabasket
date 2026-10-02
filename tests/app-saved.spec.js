const { test, expect } = require('./fixtures');
const open = async (context, extensionId, data, hash = 'media') => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, data);
  await page.goto(`chrome-extension://${extensionId}/app.html#${hash}`); await page.reload();
  return page;
};
const DAY = 86400000;
const DATA = {
  lists: [{ id: 'l1', name: 'Recipes', kind: 'm' }],
  'm:A': { key: 'A', type: 'post', username: 'alice', lists: ['l1'], addedAt: Date.now() - 1 * DAY },
  'm:B': { key: 'B', type: 'reel', username: 'bob', lists: [], addedAt: Date.now() - 40 * DAY },
  'm:story:9': { key: 'story:9', type: 'story', username: 'alice', lists: [], addedAt: Date.now() - 2 * DAY },
  'm:C': { key: 'C', type: 'album', lists: [], addedAt: Date.now() - 3 * DAY },
  'u:alice': { username: 'alice', fullName: 'Alice A' },
};
const keys = (page) => page.locator('.grid .card').evaluateAll((cs) => cs.map((c) => c.dataset.key));

test('media grid: newest first, placeholder and unknown owner', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await expect(page.locator('.grid .card')).toHaveCount(4);
  expect(await keys(page)).toEqual(['m:A', 'm:story:9', 'm:C', 'm:B']);
  await expect(page.locator('.card[data-key="m:C"] .placeholder')).toBeVisible();
  await expect(page.locator('.card[data-key="m:C"] .owner')).toHaveText('Owner not found');
  await expect(page.locator('.card[data-key="m:A"] .chip')).toHaveText(['Recipes']);
});

test('search, type, date and sort filters', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await page.fill('#search', 'bob');            await expect(page.locator('.grid .card')).toHaveCount(1); expect(await keys(page)).toEqual(['m:B']);
  await page.fill('#search', 'recipes');        await expect(page.locator('.grid .card')).toHaveCount(1); expect(await keys(page)).toEqual(['m:A']);
  await page.fill('#search', '');
  await page.selectOption('#f-type', 'stories'); expect(await keys(page)).toEqual(['m:story:9']);
  await page.selectOption('#f-type', 'posts');   expect(await keys(page)).toEqual(['m:A', 'm:C']);
  await page.selectOption('#f-type', 'all');
  await page.selectOption('#f-since', '30');     expect(await keys(page)).toEqual(['m:A', 'm:story:9', 'm:C']);
  await page.selectOption('#f-since', 'any');
  await page.selectOption('#f-sort', 'old');     expect(await keys(page)).toEqual(['m:B', 'm:C', 'm:story:9', 'm:A']);
  await page.selectOption('#f-owner', 'alice');  expect(await keys(page)).toEqual(['m:A', 'm:story:9'].reverse());
});

test('cards: relative date, links and no native drag', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, { ...DATA, 'm:A': { ...DATA['m:A'], url: 'https://www.instagram.com/p/A/', thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } });
  const a = page.locator('.card[data-key="m:A"] a');
  await expect(a).toHaveAttribute('href', 'https://www.instagram.com/p/A/');
  await expect(a).toHaveAttribute('target', '_blank');
  await expect(a).toHaveAttribute('draggable', 'false');
  await expect(page.locator('.card[data-key="m:A"] img')).toHaveAttribute('draggable', 'false');
  await expect(page.locator('.card[data-key="m:A"] .date')).toHaveText('yesterday');
  await expect(page.locator('.card[data-key="m:story:9"] .date')).toHaveText('2 days ago');
  await expect(page.locator('.card[data-key="m:C"] a')).toHaveCount(0);
  await expect(page.locator('#f-owner option')).toHaveText(['All owners', 'alice', 'bob']);
  expect(await page.evaluate(() => Object.keys(KeepKeepApp.saved.filters).sort())).toEqual(['list', 'owner', 'q', 'since', 'sort', 'type']);
});

test('profiles grid shows name and media count', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, { ...DATA, 'p:alice': { username: 'alice', lists: [], addedAt: 5 } }, 'profiles');
  await expect(page.locator('.card[data-key="p:alice"] .name')).toHaveText('Alice A');
  await expect(page.locator('.card[data-key="p:alice"] .media-count')).toHaveText('2 media');
});

test('a big library renders in chunks', async ({ context, extensionId }) => {
  const big = { lists: [] };
  for (let i = 0; i < 1000; i++) big['m:K' + i] = { key: 'K' + i, username: 'u' + (i % 50), lists: [], addedAt: i, thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
  const page = await open(context, extensionId, big);
  await expect(page.locator('.grid .card').first()).toBeVisible();
  expect(await page.locator('.grid .card').count()).toBeLessThanOrEqual(60);
  await page.locator('.grid .card').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.grid .card').count()).toBeGreaterThan(60);
});

test('saving elsewhere shows up at once, keeping the filters', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.selectOption('#f-sort', 'old');
  await page.evaluate(() => chrome.storage.local.set({ 'm:NEW': { key: 'NEW', username: 'zed', lists: [], addedAt: Date.now() } }));
  await expect(page.locator('.card[data-key="m:NEW"]')).toBeVisible();
  await expect(page.locator('#f-sort')).toHaveValue('old');
  await expect(page.locator('#f-owner option')).toContainText(['zed']);
});
