// Export & import (basket.js exportData / importData, the popup's Backup
// section and the import tab). Importing only ever adds.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('./fixtures');

const DATA = {
  lists: [
    { id: 'l1', name: 'Recipes', kind: 'm' },
    { id: 'p1', name: 'Designers', kind: 'p' },
    { id: 'l2', name: 'Travel', kind: 'm' },
  ],
  'm:AAA': { key: 'AAA', code: 'AAA', type: 'post', username: 'alice', lists: ['l1', 'l2'], thumb: 'data:image/jpeg;base64,AAAA', addedAt: 1 },
  'm:BBB': { key: 'BBB', code: 'BBB', type: 'reel', username: 'bob', lists: [], addedAt: 2 },
  'p:alice': { username: 'alice', lists: ['p1'], addedAt: 3 },
  'u:alice': { username: 'alice', pic: 'data:image/jpeg;base64,BBBB' },
  photoSize: 'standard',
  anonStories: true,
};

async function extensionPage(context, extensionId, data = DATA) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(data);
  }, data);
  return page;
}
const stored = (page) => page.evaluate(() => chrome.storage.local.get(null));
const exported = (page) => page.evaluate(() => KeepKeep.exportData());
const importIt = (page, backup) => page.evaluate(async (b) => {
  try {
    return await KeepKeep.importData(b);
  } catch (e) {
    return { error: e.code };
  }
}, backup);

test('export, clear everything, import: the same data comes back', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  const backup = await exported(page);
  expect(backup).toMatchObject({ format: 'keepkeep-backup', version: 1, lists: DATA.lists, settings: { photoSize: 'standard', anonStories: true } });
  await page.evaluate(() => chrome.storage.local.clear());
  expect(await importIt(page, backup)).toEqual({ profiles: 1, media: 2, lists: 3, existing: 0 });
  const all = await stored(page);
  for (const k of ['lists', 'm:AAA', 'm:BBB', 'p:alice', 'u:alice']) expect(all[k]).toEqual(DATA[k]);
  // Settings belong to this computer: an import doesn't set them.
  expect(all.photoSize).toBeUndefined();
});

test('importing the same backup twice adds nothing twice', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  const backup = await exported(page);
  const before = await stored(page);
  expect(await importIt(page, backup)).toEqual({ profiles: 0, media: 0, lists: 0, existing: 3 });
  expect(await stored(page)).toEqual(before);
});

test('importing into a filled KeepKeep merges lists and items, deleting nothing', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  const backup = await exported(page);
  // The other computer: its own "travel" list (other id, other case), a post
  // in it, an extra list and an item of its own.
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      lists: [{ id: 'x9', name: 'travel ', kind: 'm' }, { id: 'l1', name: 'Shoes', kind: 'm' }],
      'm:AAA': { key: 'AAA', code: 'AAA', username: 'alice', lists: ['x9'], thumb: 'data:mine' },
      'm:CCC': { key: 'CCC', code: 'CCC', username: 'carol', lists: ['l1'] },
      photoSize: 'original',
    });
  });
  expect(await importIt(page, backup)).toEqual({ profiles: 1, media: 1, lists: 2, existing: 1 });
  const all = await stored(page);
  // Same-named list matched; "Recipes" is new but its id l1 was taken here.
  const recipes = all.lists.find((l) => l.name === 'Recipes');
  expect(recipes.id).not.toBe('l1');
  expect(all.lists.map((l) => l.name)).toEqual(['travel ', 'Shoes', 'Recipes', 'Designers']);
  // The post here keeps its own data and gains the backup's lists.
  expect(all['m:AAA'].thumb).toBe('data:mine');
  expect(all['m:AAA'].lists.sort()).toEqual(['x9', recipes.id].sort());
  // Nothing of this computer's is lost.
  expect(all['m:CCC'].lists).toEqual(['l1']);
  expect(all.photoSize).toBe('original');
  expect(all['m:BBB']).toBeTruthy();
});

test('a wrong file or a newer backup is refused and nothing changes', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  const before = await stored(page);
  expect(await importIt(page, { hello: 'world' })).toEqual({ error: 'not-backup' });
  expect(await importIt(page, null)).toEqual({ error: 'not-backup' });
  expect(await importIt(page, { format: 'keepkeep-backup', version: 99, items: {} })).toEqual({ error: 'newer' });
  expect(await stored(page)).toEqual(before);
});

test('a backup with 1.0.0-style shared lists is split like stored data', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId, {});
  const old = {
    format: 'keepkeep-backup', version: 1,
    lists: [{ id: 'o1', name: 'Fav' }],
    items: { 'p:dan': { username: 'dan', lists: ['o1'] }, 'm:DDD': { key: 'DDD', lists: ['o1'] } },
  };
  expect(await importIt(page, old)).toEqual({ profiles: 1, media: 1, lists: 2, existing: 0 });
  const all = await stored(page);
  expect(all.lists).toEqual([{ id: 'o1', name: 'Fav', kind: 'm' }, { id: 'o1-p', name: 'Fav', kind: 'p' }]);
  expect(all['p:dan'].lists).toEqual(['o1-p']);
  expect(all['m:DDD'].lists).toEqual(['o1']);
});

test('popup Export saves a backup file to Downloads/KeepKeep', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  await page.click('#settings');
  await page.click('#export');
  await expect(page.locator('#backup-status')).toHaveText(/^Saved to Downloads\/KeepKeep as KeepKeep-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      // The test browser stores downloads under its own names: take the newest.
      const [d] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
      if (d?.state === 'complete') return d.filename;
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(backup.format).toBe('keepkeep-backup');
  expect(backup.items['m:AAA']).toEqual(DATA['m:AAA']);
});

test('the import tab adds a chosen file and says what it added', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  const backup = await exported(page);
  await page.evaluate(() => chrome.storage.local.clear());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeep-'));
  const good = path.join(dir, 'KeepKeep-backup.json');
  const bad = path.join(dir, 'notes.json');
  fs.writeFileSync(good, JSON.stringify(backup));
  fs.writeFileSync(bad, 'not json');

  await page.goto(`chrome-extension://${extensionId}/import.html`);
  await page.setInputFiles('#file', good);
  await expect(page.locator('#result')).toHaveText(/Added 1 profile, 2 posts and 3 lists\./);
  await page.setInputFiles('#file', good);
  await expect(page.locator('#result')).toHaveText(/Everything in this backup was already here\.3 items were already here/);
  await page.setInputFiles('#file', bad);
  await expect(page.locator('#result')).toHaveText(/This file isn't a KeepKeep backup\./);
  fs.rmSync(dir, { recursive: true, force: true });
});
