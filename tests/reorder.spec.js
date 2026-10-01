// Reordering lists by dragging their boxes in the "Add to a list" card.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');

async function cardWithLists(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(src('basket.js') + src('panel.js') + ';window.KeepKeep = KeepKeep; window.KeepKeepPanel = KeepKeepPanel;');
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      lists: [
        { id: 'l1', name: 'Recipes', kind: 'm' },
        { id: 'p1', name: 'Designers', kind: 'p' },
        { id: 'l2', name: 'Travel', kind: 'm' },
        { id: 'l3', name: 'Shoes', kind: 'm' },
      ],
      'm:AAA': { key: 'AAA', code: 'AAA', type: 'post', username: 'alice', lists: ['l1'] },
    });
    KeepKeepPanel.showBusy();
    await KeepKeepPanel.showResult({ state: 'new', recordKey: 'm:AAA' }, () => {});
  });
  await page.waitForTimeout(800); // the picker has opened
  return page;
}

const box = (page, name) => page.locator('.box', { hasText: name });
const names = (page) => page.locator('.box[data-id] .name').allTextContents();
const stored = (page) => page.evaluate(() => chrome.storage.local.get(null));

async function drag(page, from, to) {
  const a = await box(page, from).boundingBox();
  const b = await box(page, to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400); // settle
}

test('list boxes have no order numbers', async ({ context, extensionId }) => {
  const page = await cardWithLists(context, extensionId);
  await expect(page.locator('.box .key')).toHaveCount(0);
  for (const text of await page.locator('.box[data-id]').allTextContents()) expect(text).not.toMatch(/\d\s*$/);
  await expect(page.locator('.hint')).toHaveText('Press 1–9');
});

test('dragging a box reorders the lists and saves the order', async ({ context, extensionId }) => {
  const page = await cardWithLists(context, extensionId);
  expect(await names(page)).toEqual(['Recipes', 'Travel', 'Shoes']);
  await drag(page, 'Shoes', 'Recipes');
  expect(await names(page)).toEqual(['Shoes', 'Recipes', 'Travel']);

  const all = await stored(page);
  // The other kind's list keeps its place; only media lists moved.
  expect(all.lists.map((l) => l.id)).toEqual(['l3', 'p1', 'l1', 'l2']);
  // Dragging is not a click: the item's lists did not change.
  expect(all['m:AAA'].lists).toEqual(['l1']);
  // Nothing is left mid-animation.
  await expect(page.locator('.box.dragging, .box.settling')).toHaveCount(0);
  for (const t of await page.locator('.box').evaluateAll((bs) => bs.map((b) => b.style.transform))) expect(t).toBe('');
});

test('keys 1–9 follow the new order', async ({ context, extensionId }) => {
  const page = await cardWithLists(context, extensionId);
  await drag(page, 'Shoes', 'Recipes');
  await page.keyboard.press('1');
  await expect.poll(async () => (await stored(page))['m:AAA'].lists).toEqual(['l1', 'l3']);
});

test('a click without moving still ticks the box', async ({ context, extensionId }) => {
  const page = await cardWithLists(context, extensionId);
  await box(page, 'Travel').click();
  await expect.poll(async () => (await stored(page))['m:AAA'].lists).toEqual(['l1', 'l2']);
  expect(await names(page)).toEqual(['Recipes', 'Travel', 'Shoes']);
});

test('the next card shows the lists in the saved order', async ({ context, extensionId }) => {
  const page = await cardWithLists(context, extensionId);
  await drag(page, 'Recipes', 'Shoes');
  expect(await names(page)).toEqual(['Travel', 'Shoes', 'Recipes']);
  await page.evaluate(async () => {
    KeepKeepPanel.hide(true);
    KeepKeepPanel.showBusy();
    await KeepKeepPanel.showResult({ state: 'dup', recordKey: 'm:AAA' }, () => {});
  });
  expect(await names(page)).toEqual(['Travel', 'Shoes', 'Recipes']);
});

test('reordering is off while searching', async ({ context, extensionId }) => {
  const page = await cardWithLists(context, extensionId);
  // The search field appears from 7 lists; type into it directly.
  await page.evaluate(() => {
    const input = document.getElementById('keepkeep-host').shadowRoot.querySelector('.search input');
    input.value = 'e';
    input.dispatchEvent(new Event('input'));
  });
  await drag(page, 'Shoes', 'Recipes');
  expect((await stored(page)).lists.map((l) => l.id)).toEqual(['l1', 'p1', 'l2', 'l3']);
});
