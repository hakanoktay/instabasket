// The "Add to a list" card (extension/panel.js), driven directly on an
// extension page so it uses the real chrome.storage.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');

async function cardPage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  // Evaluated over the debugger, so the extension page's CSP doesn't apply.
  await page.evaluate(src('basket.js') + src('panel.js') + ';window.KeepKeep = KeepKeep; window.KeepKeepPanel = KeepKeepPanel;');
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      lists: [{ id: 'l1', name: 'Recipes', kind: 'm' }, { id: 'l2', name: 'Travel', kind: 'm' }],
      'm:AAA': { key: 'AAA', code: 'AAA', type: 'post', username: 'alice', lists: ['l1'] },
      'm:BBB': { key: 'BBB', code: 'BBB', type: 'post', username: 'bob', lists: [] },
    });
  });
  return page;
}

// Heights of the list picker, one per animation frame, while `steps` run.
const pickerHeights = (page, steps) => page.evaluate(async (steps) => {
  const picker = () => document.getElementById('keepkeep-host')?.shadowRoot.querySelector('.picker');
  const heights = [];
  let sampling = true;
  (function frame() {
    if (!sampling) return;
    heights.push(Math.round(picker()?.getBoundingClientRect().height ?? 0));
    requestAnimationFrame(frame);
  })();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const s of steps) {
    if (s.wait) await wait(s.wait);
    if (s.busy) KeepKeepPanel.showBusy();
    if (s.result) await KeepKeepPanel.showResult({ state: 'new', recordKey: s.result }, () => {});
  }
  sampling = false;
  return heights;
}, steps);

test('adding again while the card is shown does not blink the list picker', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  // First add: the picker opens.
  const first = await pickerHeights(page, [{ busy: true }, { wait: 150 }, { result: 'm:AAA' }, { wait: 600 }]);
  const open = first.at(-1);
  expect(open).toBeGreaterThan(50);

  // Second add while the first card is still shown: the picker must stay open.
  const second = await pickerHeights(page, [{ busy: true }, { wait: 250 }, { result: 'm:BBB' }, { wait: 600 }]);
  expect(Math.min(...second)).toBeGreaterThanOrEqual(open - 1);

  // And it now shows the second item's lists.
  const ticked = await page.evaluate(() => [...document.getElementById('keepkeep-host').shadowRoot
    .querySelectorAll('.box.on .name')].map((n) => n.textContent));
  expect(ticked).toEqual([]);
});

test('list boxes do nothing while the next item is being added', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  await pickerHeights(page, [{ busy: true }, { result: 'm:AAA' }, { wait: 600 }]);
  await page.evaluate(() => KeepKeepPanel.showBusy());
  // Clicking a box of the previous item now must not change any record.
  await page.evaluate(() => document.getElementById('keepkeep-host').shadowRoot.querySelector('.box:not(.new)').click());
  await page.keyboard.press('2');
  const lists = await page.evaluate(async () => (await chrome.storage.local.get(['m:AAA', 'm:BBB'])));
  expect(lists['m:AAA'].lists).toEqual(['l1']);
  expect(lists['m:BBB'].lists).toEqual([]);
});

// The owner's case: the countdown runs out and the card closes by itself;
// adding the next post must open the picker like a first add (from closed,
// growing only), never fold an old one first.
test('after the card closed by itself, the next add opens the picker without a blink', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  await pickerHeights(page, [{ busy: true }, { result: 'm:AAA' }, { wait: 600 }]);
  await page.evaluate(() => document.getElementById('keepkeep-host').shadowRoot
    .querySelector('.bar').dispatchEvent(new AnimationEvent('animationend')));
  await expect(page.locator('#keepkeep-host')).toHaveCount(0, { timeout: 2000 });

  const heights = await page.evaluate(async () => {
    const picker = () => document.getElementById('keepkeep-host').shadowRoot.querySelector('.picker');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    KeepKeepPanel.showBusy();
    const heights = [];
    let sampling = true;
    (function frame() {
      if (!sampling) return;
      heights.push(Math.round(picker().getBoundingClientRect().height));
      requestAnimationFrame(frame);
    })();
    await wait(200);
    await KeepKeepPanel.showResult({ state: 'new', recordKey: 'm:BBB' }, () => {});
    await wait(600);
    sampling = false;
    return heights;
  });
  expect(heights[0]).toBeLessThan(5);
  heights.forEach((h, i) => i && expect(h).toBeGreaterThanOrEqual(heights[i - 1] - 1));
  expect(heights.at(-1)).toBeGreaterThan(50);
});

test('closing folds the list picker up first, then the card goes', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  await pickerHeights(page, [{ busy: true }, { result: 'm:AAA' }, { wait: 600 }]);
  const frames = await page.evaluate(async () => {
    const host = document.getElementById('keepkeep-host');
    const card = host.shadowRoot.querySelector('.card');
    const picker = host.shadowRoot.querySelector('.picker');
    host.shadowRoot.querySelector('.close').click();
    const frames = [];
    while (host.isConnected) {
      frames.push({ h: Math.round(picker.getBoundingClientRect().height), o: +getComputedStyle(card).opacity });
      await new Promise(requestAnimationFrame);
    }
    return frames;
  });
  const firstFade = frames.findIndex((f) => f.o < 1);
  expect(firstFade).toBeGreaterThan(0);
  expect(frames[firstFade].h).toBeLessThan(5); // folded before fading
  frames.forEach((f, i) => i && expect(f.h).toBeLessThanOrEqual(frames[i - 1].h));
});

test('adding while the card is closing keeps the card', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  await pickerHeights(page, [{ busy: true }, { result: 'm:AAA' }, { wait: 600 }]);
  await page.evaluate(() => document.getElementById('keepkeep-host').shadowRoot.querySelector('.close').click());
  await pickerHeights(page, [{ wait: 100 }, { busy: true }, { wait: 100 }, { result: 'm:BBB' }, { wait: 800 }]);
  await expect(page.locator('#keepkeep-host')).toHaveCount(1);
  const card = await page.evaluate(() => {
    const root = document.getElementById('keepkeep-host').shadowRoot;
    return { leaving: root.querySelector('.card').classList.contains('leaving'), open: root.querySelector('.picker').classList.contains('open') };
  });
  expect(card).toEqual({ leaving: false, open: true });
});

// Two copies of the logo with the same gradient id made the visible one
// blank (the gradient resolved to the hidden copy in the drop zone).
test('the card has no duplicate ids, so the logo keeps its colours', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  await pickerHeights(page, [{ busy: true }, { result: 'm:AAA' }, { wait: 300 }]);
  const ids = await page.evaluate(() => [...document.getElementById('keepkeep-host').shadowRoot.querySelectorAll('[id]')].map((e) => e.id));
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});
