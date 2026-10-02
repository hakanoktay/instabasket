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

test('select, add to a list, remove from it', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:B"] .select'); await page.click('.card[data-key="m:C"] .select', { modifiers: [] });
  await expect(page.locator('#bulk .count')).toHaveText('2 selected');
  await page.click('#bulk-add'); await page.click('.picker .item:has-text("Recipes")');
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get(['m:B', 'm:C'])))).toMatchObject({ 'm:B': { lists: ['l1'] }, 'm:C': { lists: ['l1'] } });
  await page.click('.lists .list[data-id="l1"]');
  await page.click('.card[data-key="m:B"] .select'); await page.click('#bulk-out');
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('m:B'))['m:B'].lists)).toEqual([]);
});
test('shift-click selects a range; Cmd/Ctrl-A selects all shown', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:C"] .select', { modifiers: ['Shift'] });
  await expect(page.locator('#bulk .count')).toHaveText('3 selected');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('#bulk .count')).toHaveText('4 selected');
});
test('remove from KeepKeep, then Undo', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('#bulk-remove');
  await expect(page.locator('.card[data-key="m:A"]')).toHaveCount(0);
  await page.click('#toast button:has-text("Undo")');
  await expect(page.locator('.card[data-key="m:A"]')).toBeVisible();
  expect(await page.evaluate(async () => (await chrome.storage.local.get('m:A'))['m:A'])).toEqual(DATA['m:A']);
});
test('items removed elsewhere leave the selection', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:B"] .select');
  await page.evaluate(() => chrome.storage.local.remove('m:A'));
  await expect(page.locator('#bulk .count')).toHaveText('1 selected');
});
test('drag cards onto a sidebar list', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  const card = await page.locator('.card[data-key="m:B"]').boundingBox();
  const list = await page.locator('.lists .list[data-id="l1"]').boundingBox();
  await page.mouse.move(card.x + 30, card.y + 30); await page.mouse.down();
  await page.mouse.move(list.x + 30, list.y + list.height / 2, { steps: 12 });
  await expect(page.locator('.lists .list[data-id="l1"]')).toHaveClass(/drop/);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('m:B'))['m:B'].lists)).toEqual(['l1']);
});
test('profiles: select and remove without touching media; Escape clears; Cmd-A ignored while typing', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, { ...DATA, 'p:alice': { username: 'alice', lists: [], addedAt: 5 }, 'p:bob': { username: 'bob', lists: [], addedAt: 4 } }, 'profiles');
  await page.click('.card[data-key="p:alice"] .select');
  await expect(page.locator('#bulk-download')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bulk')).toBeHidden();
  await page.click('#search'); await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('#bulk')).toBeHidden();
  await page.locator('body').click({ position: { x: 600, y: 5 } });
  await page.click('.card[data-key="p:alice"] .select'); await page.click('#bulk-remove');
  await expect(page.locator('.card[data-key="p:alice"]')).toHaveCount(0);
  expect(await page.evaluate(async () => !!(await chrome.storage.local.get('m:A'))['m:A'])).toBe(true);
});

test('items that leave the view leave the selection (Remove from list)', async ({ context, extensionId }) => {
  const data = { ...DATA, 'm:B': { ...DATA['m:B'], lists: ['l1'] } };
  const page = await open(context, extensionId, data);
  await page.click('.lists .list[data-id="l1"]');
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:B"] .select');
  await expect(page.locator('#bulk .count')).toHaveText('2 selected');
  await page.click('#bulk-out');
  await expect(page.locator('.grid .card')).toHaveCount(0);
  await expect(page.locator('#bulk')).toBeHidden();
  expect(await page.evaluate(() => KeepKeepApp.saved.selected.size)).toBe(0);
});
test('a filter that hides selected items deselects them; Remove only acts on shown ones', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:B"] .select');
  await page.fill('#search', 'alice');
  await expect(page.locator('#bulk .count')).toHaveText('1 selected');
  await page.click('#bulk-remove');
  await expect.poll(() => page.evaluate(async () => Object.keys(await chrome.storage.local.get(['m:A', 'm:B'])))).toEqual(['m:B']);
});

test('leaving for Settings drops the selection and its bar', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select');
  await expect(page.locator('#bulk')).toBeVisible();
  await page.click('.nav [data-view="settings"]');
  await expect(page.locator('main')).toHaveAttribute('data-view', 'settings');
  await expect(page.locator('#bulk')).toBeHidden();
  const before = await page.evaluate(() => chrome.storage.local.get(null));
  await page.click('.nav [data-view="media"]');
  await expect(page.locator('#bulk')).toBeHidden();
  expect(await page.evaluate(() => chrome.storage.local.get(null))).toEqual(before);
  expect(before['m:A']).toEqual(DATA['m:A']);
});

test('1,000 selected: Add to list is one quick batch', async ({ context, extensionId }) => {
  const data = { lists: [{ id: 'l1', name: 'Recipes', kind: 'm' }] };
  for (let i = 0; i < 1000; i++) data['m:K' + i] = { key: 'K' + i, type: 'post', username: 'u' + (i % 20), lists: [], addedAt: 1000 + i };
  const page = await open(context, extensionId, data);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('#bulk .count')).toHaveText('1000 selected');
  await page.click('#bulk-add');
  const t0 = Date.now();
  await page.click('.picker .item:has-text("Recipes")');
  await expect.poll(() => page.evaluate(async () => Object.entries(await chrome.storage.local.get(null))
    .filter(([k, v]) => k.startsWith('m:') && v.lists.includes('l1')).length), { intervals: [50] }).toBe(1000);
  expect(Date.now() - t0).toBeLessThan(2000);
});

test('two removals within the toast: Undo brings back all of them', async ({ context, extensionId }) => {
  const data = { lists: [] };
  for (const k of ['A', 'B', 'C', 'D', 'E', 'F']) data['m:' + k] = { key: k, type: 'post', username: 'alice', lists: [], addedAt: k.charCodeAt(0) };
  const page = await open(context, extensionId, data);
  for (const k of ['A', 'B']) await page.click(`.card[data-key="m:${k}"] .select`);
  await page.click('#bulk-remove');
  await expect(page.locator('#toast')).toContainText('Removed 2');
  for (const k of ['C', 'D', 'E']) await page.click(`.card[data-key="m:${k}"] .select`);
  await page.click('#bulk-remove');
  await expect(page.locator('#toast')).toContainText('Removed 5');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await page.click('#toast button:has-text("Undo")');
  await expect(page.locator('.grid .card')).toHaveCount(6);
  expect(await page.evaluate(() => chrome.storage.local.get(null))).toEqual(data);
});

test('narrow window: the toolbar list menu filters like the sidebar', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, DATA);
  await page.reload();
  await expect(page.locator('.lists')).toBeHidden();
  await expect(page.locator('#f-list option')).toHaveText(['All lists', 'Recipes']);
  await page.selectOption('#f-list', 'l1');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.locator('.card[data-key="m:A"]')).toBeVisible();
  await page.click('.card[data-key="m:A"] .select');
  await expect(page.locator('#bulk-out')).toBeVisible();
  await page.selectOption('#f-list', '');
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await expect(page.locator('#bulk')).toBeHidden();
});

test('a small window: the bulk bar in a list fits on screen', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 560, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, DATA);
  await page.reload();
  await page.selectOption('#f-list', 'l1');
  await page.click('.card[data-key="m:A"] .select');
  await expect(page.locator('#bulk-out')).toBeVisible();
  await expect(page.locator('#bulk-out')).toHaveAttribute('title', 'Remove from list');
  const box = await page.locator('#bulk').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(560);
});
