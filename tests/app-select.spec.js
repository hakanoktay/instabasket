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
