# KeepKeep App Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-tab KeepKeep page (`extension/app.html`) with the saved profiles and media, lists, settings, backup, about, welcome and what's new, opened from a visible button in the popup.

**Architecture:** One HTML shell with a sidebar and a main area; a tiny hash router in `app/core.js` where each view registers itself (`KeepKeepApp.view({...})`), so later features are one new file plus one `<script>` line. All data goes through `basket.js`; the storage format does not change. Downloads go through an open instagram.com tab (content script message), as the popup's Download does.

**Tech Stack:** Chrome MV3, plain JS (no build step, classic `<script>`s), CSS with the popup's tokens, Inter (bundled), Playwright tests in `tests/`.

**Spec:** `specs/2026-10-02-keepkeep-app-page.md`

## Global Constraints

- No build step; `extension/` loads unpacked as is. Classic scripts, no modules in pages.
- Nothing loaded from the internet by any page (fonts, images, scripts are bundled).
- Storage format unchanged: keys `p:<username>`, `m:<key>`, `u:<username>`, `lists`, `photoSize`, `anonStories`. Never delete or reset keys; `basket.js` is the only writer.
- All UI text in English; the name inside the extension is "KeepKeep".
- The privacy line is never a headline: "Never asks for your password. Nothing leaves your computer." with the badges No password · No tracking · No ads.
- KeepKeep never opens windows or tabs on its own except: the app on install (welcome) and after an update that has notes (what's new).
- Downloads go to `Downloads/KeepKeep`, one file per item, no dialogs.
- Every task ends with `cd tests && npm test` all green, then a commit on `v1.1.0` and a push.

## Review Focus

1. A large library (1,000+ media with thumbnails): the page must open quickly and scroll smoothly — cards render in chunks of 60 as the user scrolls (Task 2 test seeds 1,000 items and checks first paint renders ≤ 60 cards and more appear after scrolling).
2. Items with no preview or no known owner: cards show a placeholder and "Owner not found", never break the grid (Task 2 test).
3. Storage changing while the page is open (an item removed on Instagram while it is selected; a list deleted in the popup while selected in the sidebar): the selection drops removed items and the view falls back to "All" (Task 4 and Task 3 tests).
4. Download with no Instagram tab open: a clear message and an "Open Instagram" button, nothing else happens (Task 5 test).
5. Narrow windows (≤ 900 px): the sidebar collapses to icons and nothing overflows horizontally (Task 1 test).

---

## File Structure

```
extension/app.html          Create: shell (sidebar, topbar, main, script tags)
extension/app.css           Create: layout, sidebar, grid, cards, bars, welcome/what's-new full-width views
extension/app/core.js       Create: KeepKeepApp (router, state, el(), icons, sidebar, live updates)
extension/app/saved.js      Create: Media / Profiles views (grid, search, filters, sort, chunks, selection, bulk bar)
extension/app/lists.js      Create: sidebar lists (select, create, rename, delete, reorder, drop target)
extension/app/download.js   Create: download selected media through an Instagram tab
extension/app/settings.js   Create: Settings (photo size, anonymous), Backup (export/import), About
extension/app/welcome.js    Create: Welcome view (moves welcome.html's content)
extension/app/whats-new.js  Create: WHATS_NEW notes, shouldShowWhatsNew(), What's new view
extension/background.js     Modify: open app.html#welcome on install, #whats-new on update
extension/content.js        Modify: 'download-keys' message
extension/popup.html/.css/.js  Modify: "Open KeepKeep" button; Import → app.html#settings
extension/welcome.*, extension/import.*  Delete (moved into the app)
tests/app-*.spec.js         Create: one spec file per task
```

---

### Task 1: App shell, router, sidebar counts, popup button

**Files:**
- Create: `extension/app.html`, `extension/app.css`, `extension/app/core.js`
- Modify: `extension/popup.html`, `extension/popup.css`, `extension/popup.js`
- Test: `tests/app-shell.spec.js`

**Interfaces:**
- Produces: global `KeepKeepApp` with
  - `view({ id, title, nav: 'main'|'bottom'|null, icon, full: bool, render(main, params) })` — registers a view; `full: true` hides the sidebar.
  - `go(id, params?)` — sets `location.hash` to `#id` (`#id/param` for params).
  - `state` — `{ profiles, media, users, lists }` from `KeepKeep.load()`, refreshed on `chrome.storage.onChanged` (debounced 100 ms), then `emit('change')`.
  - `on(event, fn)`, `emit(event)` — events: `'change'`.
  - `el(tag, attrs, ...children)`, `icon(name)` — same helpers as `popup.js`.
- Default view: `media`. Unknown hash → `media`.

- [ ] **Step 1: Write the failing test** (`tests/app-shell.spec.js`)

```js
const { test, expect } = require('./fixtures');
const seed = (page, data) => page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, data);
const DATA = { lists: [], 'm:A': { key: 'A', username: 'alice', lists: [], addedAt: 1 }, 'p:alice': { username: 'alice', lists: [], addedAt: 2 } };

test('the popup button opens the app in a new tab', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const [app] = await Promise.all([context.waitForEvent('page'), popup.click('#open-app')]);
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
```

- [ ] **Step 2: Run, expect FAIL** — `cd tests && npx playwright test app-shell.spec.js` → fails (no `#open-app`, no app.html).
- [ ] **Step 3: Implement**
  - `app.html`: `<aside class="sidebar">` (brand, `<nav class="nav">` main items, `<div class="lists">`, bottom nav), `<main data-view>`; scripts in order: `basket.js`, `app/core.js`, `app/saved.js`, `app/lists.js`, `app/download.js`, `app/settings.js`, `app/welcome.js`, `app/whats-new.js`, then `KeepKeepApp.start()` from the end of `core.js` on `DOMContentLoaded`.
  - `core.js`: registry `views = new Map()`; `route()` reads `location.hash.slice(1).split('/')`, picks the view or `media`, sets `main.dataset.view`, toggles `body.full`, calls `render(main, params)`; `hashchange` → `route()`; `renderNav()` builds items from views with `nav` set, counts from `state` (`media.length`, `profiles.length`); `matchMedia('(max-width: 900px)')` toggles `body.narrow`.
  - `app.css`: tokens copied from `popup.css` `:root` (light + dark), `@font-face` Inter from `fonts/inter.woff2`; grid layout `body { display:grid; grid-template-columns: 248px 1fr }`, `.narrow` → `64px 1fr` with labels hidden; `body.full` → one column.
  - Popup: in `.header-actions` before `#anon-toggle`: `<button id="open-app" class="open-app" title="Open KeepKeep in a tab"><span class="i">(arrow-out icon)</span>Open KeepKeep</button>`; style: pill, height 30, brand tint background, brand text, 600 weight; `popup.js`: `chrome.tabs.create({ url: 'app.html#media' }); window.close();`.
- [ ] **Step 4: Run, expect PASS** — whole suite green.
- [ ] **Step 5: Commit** — `git add extension/app.html extension/app.css extension/app tests/app-shell.spec.js extension/popup.*` · `git commit -m "App page: shell, router, sidebar; popup 'Open KeepKeep' button"` · push.

### Task 2: Media and Profiles grids (search, filters, sort, chunks, live)

**Files:**
- Create: `extension/app/saved.js`; Modify: `extension/app.css`
- Test: `tests/app-saved.spec.js`

**Interfaces:**
- Consumes: `KeepKeepApp.view/state/on/el/icon` (Task 1).
- Produces: views `media` and `profiles`; `KeepKeepApp.saved = { selected: Set<recordKey>, filters: { q, type, owner, since, sort, list } , rerender() }`. `type` ∈ `all|posts|reels|stories` (posts = not reel/story); `since` ∈ `any|7|30|year`; `sort` ∈ `new|old`; `list` = list id or null.
- Card markup (tests rely on it): `.card[data-key="m:A"]` with `img` or `.placeholder`, `.owner`, `.type`, `.chips .chip` per list; profile cards `.card[data-key="p:alice"]`.

- [ ] **Step 1: Write the failing tests** (`tests/app-saved.spec.js`)

```js
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
  expect(await keys(page)).toEqual(['m:A', 'm:story:9', 'm:C', 'm:B']);
  await expect(page.locator('.card[data-key="m:C"] .placeholder')).toBeVisible();
  await expect(page.locator('.card[data-key="m:C"] .owner')).toHaveText('Owner not found');
  await expect(page.locator('.card[data-key="m:A"] .chip')).toHaveText(['Recipes']);
});

test('search, type, date and sort filters', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.fill('#search', 'bob');            expect(await keys(page)).toEqual(['m:B']);
  await page.fill('#search', 'recipes');        expect(await keys(page)).toEqual(['m:A']);
  await page.fill('#search', '');
  await page.selectOption('#f-type', 'stories'); expect(await keys(page)).toEqual(['m:story:9']);
  await page.selectOption('#f-type', 'posts');   expect(await keys(page)).toEqual(['m:A', 'm:C']);
  await page.selectOption('#f-type', 'all');
  await page.selectOption('#f-since', '30');     expect(await keys(page)).toEqual(['m:A', 'm:story:9', 'm:C']);
  await page.selectOption('#f-since', 'any');
  await page.selectOption('#f-sort', 'old');     expect(await keys(page)).toEqual(['m:B', 'm:C', 'm:story:9', 'm:A']);
  await page.selectOption('#f-owner', 'alice');  expect(await keys(page)).toEqual(['m:A', 'm:story:9'].reverse());
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
  expect(await page.locator('.grid .card').count()).toBeLessThanOrEqual(60);
  await page.locator('.grid .card').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.grid .card').count()).toBeGreaterThan(60);
});

test('saving elsewhere shows up at once', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.evaluate(() => chrome.storage.local.set({ 'm:NEW': { key: 'NEW', username: 'zed', lists: [], addedAt: Date.now() } }));
  await expect(page.locator('.card[data-key="m:NEW"]')).toBeVisible();
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `saved.js`:
  - `filterItems(kind)`: from `state.media` / `state.profiles`; `q` matches `username`, `users[u].fullName`, and names of the item's lists (case-insensitive); `type`; `owner`; `since` (`addedAt >= now - days*DAY`, `year` = Jan 1 this year); `list`; sort by `addedAt` desc/asc.
  - Topbar: `#search`, `#f-type`, `#f-owner` (owners from items, sorted), `#f-since`, `#f-sort`; media only for type.
  - Grid renders chunks of 60; an `IntersectionObserver` on a sentinel after the last card appends the next 60.
  - Media card: `a[href=url,target=_blank]` with `img[src=thumb]` or `.placeholder` "No preview"; `.type` badge (Post/Reel/Album/Video/Story); `.owner` (`@username` or "Owner not found"); `.date` ("2 days ago"); `.chips` of list names.
  - Profile card: round picture (`users[u].pic` or initial), `@username`, `.name`, `.media-count` (`n media`), chips.
  - `KeepKeepApp.on('change', rerender)` keeps scroll position (re-render only rendered count).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `"App page: media and profiles grids with search and filters"` · push.

### Task 3: Sidebar lists (select, create, rename, delete, reorder)

**Files:** Create `extension/app/lists.js`; Modify `extension/app.css`; Test `tests/app-lists.spec.js`

**Interfaces:**
- Consumes: `KeepKeep.createList(name, kind)`, `renameList(id, name)`, `deleteList(id)`, `reorderLists(kind, ids)`; `KeepKeepApp.saved.filters.list`, `saved.rerender()`.
- Produces: `.lists .list[data-id]` items (name, `.count`), `#new-list` button; `KeepKeepApp.lists.dropTarget(listEl)` used by Task 4 for card drops.

- [ ] **Step 1: Failing tests**

```js
const { test, expect } = require('./fixtures');
// open() and DATA as in app-saved.spec.js (copy them here).
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
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `lists.js`: render "All" + lists of the current kind (media view → `m`, profiles → `p`) with counts; click sets `filters.list` and `.on`; inline input for new/rename (Enter saves, Escape cancels); delete asks `confirm("Delete the list "X"? Its items stay saved.")`; pointer-event reordering with a 5 px threshold (same approach as `panel.js` `startSort`, vertical only), saved with `reorderLists`; on `change`, if the selected list no longer exists → `filters.list = null`.
- [ ] **Step 4: PASS.** **Step 5: Commit** — `"App page: lists in the sidebar"` · push.

### Task 4: Selection, bulk bar, drag cards to lists, remove with Undo

**Files:** Modify `extension/app/saved.js`, `extension/app/lists.js`, `extension/app.css`; Test `tests/app-select.spec.js`

**Interfaces:**
- Consumes: `KeepKeep.setInList(recordKey, listId, on)`, `KeepKeep.remove(recordKey)` → record, `KeepKeep.restore(recordKey, record)`.
- Produces: `.card .select` checkbox; `#bulk` bar with `.count`, `#bulk-add` (opens `.picker` of lists), `#bulk-out` (only with a list selected), `#bulk-download` (Task 5 wires it), `#bulk-remove`; `#toast` with `Undo`.

- [ ] **Step 1: Failing tests**

```js
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
  await page.mouse.move(list.x + 30, list.y + list.height / 2, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('m:B'))['m:B'].lists)).toEqual(['l1']);
});
```
(`open` and `DATA` copied from Task 2.)

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement**: `selected` Set; `.select` checkbox on cards (visible on hover or while any selected); Shift range by rendered order; `keydown` Cmd/Ctrl-A (not in inputs) selects all filtered items; `#bulk` fixed bottom bar shown when `selected.size`; picker lists the current kind's lists, each toggles add for all selected; remove saves `{key, record}` pairs from `KeepKeep.remove`, shows `#toast` "Removed N · Undo" for 6 s, Undo restores all; on `change`, drop keys no longer in state. Card drag: pointer-based, 6 px threshold, a small "N items" ghost follows the pointer (selected cards if the dragged one is selected, else just it); `lists.dropTarget` highlights the list under the pointer; drop → `setInList(k, id, true)` for each.
- [ ] **Step 4: PASS.** **Step 5: Commit** — `"App page: selection, bulk actions, drag to lists, Undo"` · push.

### Task 5: Download selected media through an Instagram tab

**Files:** Create `extension/app/download.js`; Modify `extension/content.js`; Test `tests/app-download.spec.js`

**Interfaces:**
- Consumes: `#bulk-download`; content script `download(code)`, `downloadStory(pk)` (existing, `content.js`).
- Produces: content message `{ type: 'download-keys', keys: string[] }` → response `{ ok: true, started: n }`, then downloads run one after another in that tab; app progress line `#bulk .progress` ("Downloading 3 of 12 in your Instagram tab").

- [ ] **Step 1: Failing tests**

```js
test('no Instagram tab: a clear message and Open Instagram', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('#bulk-download');
  await expect(page.locator('#notice')).toContainText('Open Instagram in a tab to download');
  await expect(page.locator('#notice a')).toHaveAttribute('href', 'https://www.instagram.com/');
});
test('with an Instagram tab, the keys are sent to it', async ({ context, extensionId }) => {
  const ig = await context.newPage(); await ig.goto('https://www.instagram.com/?page=blank');
  const page = await open(context, extensionId, DATA);
  await page.click('.card[data-key="m:A"] .select'); await page.click('.card[data-key="m:B"] .select');
  await page.click('#bulk-download');
  await expect(page.locator('#notice')).toContainText('Downloading 2 posts in your Instagram tab');
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement**: `download.js` finds `chrome.tabs.query({ url: ['https://www.instagram.com/*', 'https://instagram.com/*'] })`, prefers the active one; none → `#notice` with the message and a link; else `chrome.tabs.sendMessage(tab.id, { type: 'download-keys', keys })` (media keys only, profiles ignored) and shows the notice. `content.js`: on `download-keys` respond `{ ok: true, started: keys.length }` at once, then for each key in order: `story:<pk>` → `downloadStory(pk)`, else `download(code)` with 800 ms between posts.
- [ ] **Step 4: PASS.** **Step 5: Commit** — `"App page: download selected media through an Instagram tab"` · push.

### Task 6: Settings, Backup and About in the app

**Files:** Create `extension/app/settings.js`; Modify `extension/popup.js` (Import → `app.html#settings`), `tests/backup.spec.js`; Delete `extension/import.html`, `import.css`, `import.js`; Test `tests/app-settings.spec.js`

**Interfaces:**
- Consumes: `KeepKeep.exportData()`, `KeepKeep.importData(backup)` (existing, returns `{ profiles, media, lists, existing }` or throws `code: 'not-backup'|'newer'`).
- Produces: views `settings` (nav: bottom) and `about` (nav: bottom); inputs `input[name=photo-size]`, `#anon-stories`, `#export`, `#import-file`, `#backup-status`, `#import-result`; About links as in the popup plus "Show the welcome again" (`#welcome`) and "What's new" (`#whats-new`).

- [ ] **Step 1: Failing tests** — move the import-tab test from `tests/backup.spec.js` to `app-settings.spec.js`, pointing at `app.html#settings` and `#import-file`; add:

```js
test('settings change storage', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.check('input[name=photo-size][value=standard]');
  await page.uncheck('#anon-stories');
  await expect.poll(() => page.evaluate(() => chrome.storage.local.get(['photoSize', 'anonStories']))).toEqual({ photoSize: 'standard', anonStories: false });
});
test('popup Import opens the app settings', async ({ context, extensionId }) => {
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.click('#settings');
  const [tab] = await Promise.all([context.waitForEvent('page'), popup.click('#import')]);
  await expect(tab).toHaveURL(/app\.html#settings$/);
});
test('About has the version, badges and links', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  await expect(page.locator('.version')).toHaveText(/^v\d/);
  await expect(page.locator('.tag')).toHaveText(['No password', 'No tracking', 'No ads']);
  await expect(page.locator('a[href="#welcome"]')).toBeVisible();
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement** the views with the popup's option/toggle styles at page scale; Export same as popup (data URL to `KeepKeep/KeepKeep-backup-<date>.json`); Import with the drop zone and messages from `import.js` (moved). **Step 4: PASS.** **Step 5: Commit** — `"App page: Settings, Backup and About; import tab folded in"` · push.

### Task 7: Welcome inside the app

**Files:** Create `extension/app/welcome.js`; Modify `extension/background.js`, `extension/app.css` (welcome styles from `welcome.css`), `tests/welcome.spec.js`; Delete `extension/welcome.html`, `welcome.css`

**Interfaces:** view `welcome` (`full: true`, `nav: null`); `background.js` opens `app.html#welcome` on install.

- [ ] **Step 1: Failing test** — in `tests/welcome.spec.js` change the URL predicate to `/app.html#welcome` and add:

```js
await expect(page.locator('a.cta')).toHaveAttribute('href', 'https://www.instagram.com/');
await expect(page.locator('a.settings-cta')).toHaveAttribute('href', '#settings');
await page.click('a.go'); await expect(page).toHaveURL(/#media$/);
```
- [ ] **Step 2: FAIL.** **Step 3: Implement**: same content and order as today's welcome (brand, headline "Keep what you *find* on Instagram", keyword lead, three steps, anonymous note, **Open Instagram** + **Settings** buttons side by side, trust badges + line, Zetasis footer), then "Go to KeepKeep →" (`a.go`, `#media`). **Step 4: PASS.** **Step 5: Commit** — `"App page: welcome view; install opens it"` · push.

### Task 8: What's new after updates

**Files:** Create `extension/app/whats-new.js`; Modify `extension/background.js` (`importScripts('app/whats-new.js')`); Test `tests/app-whats-new.spec.js`

**Interfaces:**
- Produces: `WHATS_NEW = { '1.1.0': [ 'line', ... ] }`; `shouldShowWhatsNew(previous, current)` → `true` only if `WHATS_NEW[current]` exists and `current`'s major or minor is higher than `previous`'s; view `whats-new` (`full: true`) listing the notes of the current version with "Go to KeepKeep →".
- The file must work in both the service worker (no DOM) and the page: register the view only `if (typeof KeepKeepApp !== 'undefined')`.

- [ ] **Step 1: Failing tests**

```js
test('shouldShowWhatsNew', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/app.html`);
  const r = await page.evaluate(() => [
    shouldShowWhatsNew('1.0.0', '1.1.0'), shouldShowWhatsNew('1.1.0', '1.1.1'),
    shouldShowWhatsNew('1.1.0', '1.1.0'), shouldShowWhatsNew('1.0.0', '9.9.9'),
  ]);
  expect(r).toEqual([true, false, false, false]); // 9.9.9 has no notes
});
test('the view lists the notes', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/app.html#whats-new`);
  await expect(page.locator('.whats-new li').first()).toBeVisible();
});
```
- [ ] **Step 2: FAIL.** **Step 3: Implement**; notes for 1.1.0 (owner reviews wording): "KeepKeep now has its own page: everything you saved, in a big grid with search, filters and bulk actions." · "Reorder your lists by dragging them." · "Back up everything to one file and import it on another computer." · "Never asks for your password. Nothing leaves your computer." In `background.js`: `onInstalled` reason `update` → `if (shouldShowWhatsNew(previousVersion, chrome.runtime.getManifest().version)) chrome.tabs.create({ url: 'app.html#whats-new' })`. **Step 4: PASS.** **Step 5: Commit** — `"App page: what's new after updates"` · push.

### Task 9: Notes and docs

**Files:** Modify `CLAUDE.md` (Layout rows for `app.*`, `app/*.js`; remove `welcome.*`, `import.*` rows), `ROADMAP.md` (Library page → "App page", done items), `README.md` (a short "KeepKeep's own page" section). No test changes; run the suite. Commit `"Notes: the app page"` · push.

---

## Self-review

- Spec coverage: shell/router/sidebar/popup button (T1), grids/search/filters/live/chunks (T2), lists (T3), selection/bulk/drag/undo (T4), download via Instagram tab (T5), settings/backup/about + import folded in (T6), welcome (T7), what's new (T8), docs (T9). Out-of-scope items stay out.
- Names used across tasks: `KeepKeepApp.view/go/state/on/emit/el/icon`, `KeepKeepApp.saved.{selected,filters,rerender}`, `KeepKeepApp.lists.dropTarget`, `shouldShowWhatsNew`, message `download-keys` — consistent.
- Review Focus items have tests in T2 (big library, placeholder/owner), T3/T4 (storage changes), T5 (no Instagram tab), T1 (narrow window).
