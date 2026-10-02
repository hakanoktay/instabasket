// Highlights (/stories/highlights/<id>/): the story pill saves the right
// owner and story and downloads the whole highlight; the app shows saved
// stories and highlights as such and downloads a highlight story by itself.
const { test, expect } = require('./fixtures');

const HL = 'https://www.instagram.com/stories/highlights/111/';
const cand = (n) => ({ image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/v/${n}.jpg`, width: 1080, height: 1920 }] } });
const ITEM = (pk, t) => ({ pk, id: `${pk}_1`, media_type: 1, taken_at: t, expiring_at: t + 86400, user: { username: 'alice' }, ...cand(pk) });

// Instagram's answers, with a count of each request.
async function fakeApi(context) {
  const calls = { highlight: 0, info: 0 };
  await context.route(/\/api\/v1\/feed\/reels_media\/\?reel_ids=highlight%3A111/, (r) => {
    calls.highlight++;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ reels: { 'highlight:111': { user: { username: 'alice' }, title: 'Trips', items: [ITEM('222', 1719323002), ITEM('223', 1719323062)] } } }) });
  });
  await context.route(/\/api\/v1\/media\/222\/info\//, (r) => {
    calls.info++;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [ITEM('222', 1719323002)] }) });
  });
  return calls;
}

async function openHighlight(context, page = 'highlight') {
  const tab = await context.newPage();
  await tab.setViewportSize({ width: 1280, height: 720 });
  await tab.goto(`${HL}?page=${page}`);
  await tab.mouse.move(640, 360); // the pill shows while the pointer is over the story
  const bar = tab.locator('[data-keepkeep="story-bar"]');
  await expect(bar).toHaveCSS('opacity', '1', { timeout: 5000 });
  return { tab, buttons: bar.locator('button') };
}

const stored = (page) => page.evaluate(() => chrome.storage.local.get(null));

test('a highlight address is not a user called "highlights"', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  expect(await page.evaluate((u) => KeepKeep.parse(u), HL)).toBeNull();
  expect(await page.evaluate(() => KeepKeep.parse('https://www.instagram.com/stories/alice/333/').username)).toBe('alice');
});

test('the pill saves the owner and the story on screen, as a highlight', async ({ context, extensionId }) => {
  await fakeApi(context);
  const { tab, buttons } = await openHighlight(context);
  await buttons.nth(0).click(); // Profile
  await buttons.nth(1).click(); // Media
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect.poll(async () => Object.keys(await stored(ext)).filter((k) => /^[pm]:/.test(k)).sort()).toEqual(['m:story:222', 'p:alice']);
  await expect.poll(async () => (await stored(ext))['m:story:222']).toMatchObject({
    key: 'story:222', type: 'highlight', highlightId: '111', username: 'alice', url: HL,
  });
  expect((await stored(ext))['m:story:222'].expiresAt).toBeUndefined();
  await tab.close();
});

test('a video story (no picture id) is found from the progress bar', async ({ context, extensionId }) => {
  await fakeApi(context);
  const { buttons } = await openHighlight(context, 'highlight-video');
  await buttons.nth(1).click(); // Media
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  // The second segment holds the fill: the second story of the highlight.
  await expect.poll(async () => (await stored(ext))['m:story:223']?.type).toBe('highlight');
  expect((await stored(ext))['m:story:222']).toBeUndefined();
});

test('without a header link, the owner comes from Instagram (asked once)', async ({ context, extensionId }) => {
  const calls = await fakeApi(context);
  const { buttons } = await openHighlight(context, 'highlight-nolink');
  await buttons.nth(0).click();
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect.poll(async () => !!(await stored(ext))['p:alice']).toBe(true);
  expect(calls.highlight).toBe(1);
});

test('Download (and D) saves the whole highlight, named …_highlight', async ({ context }) => {
  const calls = await fakeApi(context);
  const { tab } = await openHighlight(context);
  await tab.keyboard.press('d');
  const names = tab.locator('#keepkeep-downloads .bubble.item .name');
  await expect(names).toHaveCount(2);
  for (const n of await names.allTextContents()) expect(n).toMatch(/^alice_\d{10}_highlight\.jpg$/);
  expect(calls.highlight).toBeGreaterThanOrEqual(1);
});

test('the app files saved stories and highlights under Stories, with their labels', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(() => chrome.storage.local.set({
    lists: [],
    'm:P': { key: 'P', type: 'post', username: 'bob', lists: [], addedAt: 3 },
    'm:story:1': { key: 'story:1', type: 'story-video', username: 'bob', lists: [], addedAt: 2 },
    'm:story:2': { key: 'story:2', type: 'highlight', highlightId: '9', username: 'bob', lists: [], addedAt: 1 },
  }));
  await page.goto(`chrome-extension://${extensionId}/app.html#media`); await page.reload();
  const keys = () => page.locator('.grid .card').evaluateAll((cs) => cs.map((c) => c.dataset.key));
  await page.selectOption('#f-type', 'stories');
  await expect.poll(keys).toEqual(['m:story:1', 'm:story:2']);
  await expect(page.locator('.card[data-key="m:story:1"] .type')).toHaveText('Story');
  await expect(page.locator('.card[data-key="m:story:2"] .type')).toHaveText('Highlight');
  await page.selectOption('#f-type', 'posts');
  await expect.poll(keys).toEqual(['m:P']);
});

test('the app downloads a saved highlight story by itself, not the whole highlight', async ({ context, extensionId }) => {
  const calls = await fakeApi(context);
  const ig = await context.newPage();
  await ig.goto('https://www.instagram.com/?page=blank');
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(() => chrome.storage.local.set({
    lists: [], 'm:story:222': { key: 'story:222', type: 'highlight', highlightId: '111', username: 'alice', lists: [], addedAt: 1 },
  }));
  await page.goto(`chrome-extension://${extensionId}/app.html#media`); await page.reload();
  await page.click('.card[data-key="m:story:222"] .select');
  await page.click('#bulk-download');
  await expect(ig.locator('#keepkeep-downloads .bubble.item .name')).toHaveText([/^alice_\d{10}_highlight\.jpg$/]);
  expect(calls.info).toBe(1);
  expect(calls.highlight).toBe(0);
});

test('anonymous mode answers the "will be able to see" gate on highlights too', async ({ context }) => {
  const tab = await context.newPage();
  await tab.setViewportSize({ width: 1280, height: 720 });
  await tab.goto(`${HL}?page=highlight-gate`);
  const card = tab.locator('.gate');
  await expect(card).toContainText('Watching anonymously');
  await expect(card).toContainText("alice won't see that you viewed their story.");
});
