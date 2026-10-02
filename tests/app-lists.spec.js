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

test('clicking a list filters the grid; All clears it', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.lists .list[data-id="l1"]');
  expect(await page.locator('.grid .card').evaluateAll((c) => c.map((x) => x.dataset.key))).toEqual(['m:A']);
  await page.click('.lists .list.all');
  await expect(page.locator('.grid .card')).toHaveCount(4);
});
test('create, rename and delete a list', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('#new-list'); await page.fill('.lists input', 'Shoes'); await page.keyboard.press('Enter');
  await expect(page.locator('.lists .list .name')).toHaveText(['Recipes', 'Shoes']);
  await page.hover('.lists .list:has-text("Shoes")'); await page.click('.lists .list:has-text("Shoes") .rename');
  await page.fill('.lists input', 'Sneakers'); await page.keyboard.press('Enter');
  await expect(page.locator('.lists .list .name')).toHaveText(['Recipes', 'Sneakers']);
  page.once('dialog', (d) => d.accept());
  await page.hover('.lists .list:has-text("Sneakers")'); await page.click('.lists .list:has-text("Sneakers") .delete');
  await expect(page.locator('.lists .list .name')).toHaveText(['Recipes']);
});
test('a list deleted elsewhere while selected falls back to All', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.lists .list[data-id="l1"]');
  await page.evaluate(() => KeepKeep.deleteList('l1'));
  await expect(page.locator('.lists .list.all')).toHaveClass(/on/);
  await expect(page.locator('.grid .card')).toHaveCount(4);
});
test('drag a list to reorder', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, { ...DATA, lists: [...DATA.lists, { id: 'l2', name: 'Travel', kind: 'm' }] });
  const a = await page.locator('.lists .list[data-id="l2"]').boundingBox();
  const b = await page.locator('.lists .list[data-id="l1"]').boundingBox();
  await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 4, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await page.evaluate(() => KeepKeep.getLists('m'))).map((l) => l.id)).toEqual(['l2', 'l1']);
});
test('profiles view shows profile lists; switching clears the list filter', async ({ context, extensionId }) => {
  const data = { ...DATA, lists: [...DATA.lists, { id: 'p1', name: 'Friends', kind: 'p' }], 'p:alice': { username: 'alice', lists: ['p1'], addedAt: 1 } };
  const page = await open(context, extensionId, data);
  await page.click('.lists .list[data-id="l1"]');
  await page.click('#nav-main [data-view="profiles"]');
  await expect(page.locator('.lists .list .name')).toHaveText(['Friends']);
  await expect(page.locator('.lists .list.all')).toHaveClass(/on/);
});
