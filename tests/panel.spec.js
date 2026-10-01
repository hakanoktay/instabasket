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

test('the picker opens with its animation after the card was closed', async ({ context, extensionId }) => {
  const page = await cardPage(context, extensionId);
  await pickerHeights(page, [{ busy: true }, { result: 'm:AAA' }, { wait: 600 }]);
  await page.evaluate(() => KeepKeepPanel.hide());
  const heights = await pickerHeights(page, [{ busy: true }, { wait: 100 }, { result: 'm:BBB' }, { wait: 600 }]);
  expect(heights[0]).toBeLessThan(5); // closed while busy, like a first add
  expect(heights.at(-1)).toBeGreaterThan(50);
});
