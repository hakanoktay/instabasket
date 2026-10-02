// App page: Settings (photo size, anonymous, Backup export / import) and About.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('./fixtures');

const DATA = {
  lists: [{ id: 'l1', name: 'Recipes', kind: 'm' }, { id: 'p1', name: 'Designers', kind: 'p' }, { id: 'l2', name: 'Travel', kind: 'm' }],
  'm:AAA': { key: 'AAA', code: 'AAA', type: 'post', username: 'alice', lists: ['l1', 'l2'], addedAt: 1 },
  'm:BBB': { key: 'BBB', code: 'BBB', type: 'reel', username: 'bob', lists: [], addedAt: 2 },
  'p:alice': { username: 'alice', lists: ['p1'], addedAt: 3 },
};
async function extensionPage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, DATA);
  return page;
}
const exported = (page) => page.evaluate(() => KeepKeep.exportData());

test('Import in the app adds a chosen file and says what it added', async ({ context, extensionId }) => {
  const page = await extensionPage(context, extensionId);
  const backup = await exported(page);
  await page.evaluate(() => chrome.storage.local.clear());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeep-'));
  const good = path.join(dir, 'KeepKeep-backup.json');
  const bad = path.join(dir, 'notes.json');
  fs.writeFileSync(good, JSON.stringify(backup));
  fs.writeFileSync(bad, 'not json');

  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.setInputFiles('#import-file', good);
  await expect(page.locator('#import-result')).toHaveText(/Added 1 profile, 2 posts and 3 lists\./);
  await page.setInputFiles('#import-file', good);
  await expect(page.locator('#import-result')).toHaveText(/Everything in this backup was already here\.3 items were already here/);
  await page.setInputFiles('#import-file', bad);
  await expect(page.locator('#import-result')).toHaveText(/This file isn't a KeepKeep backup\./);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('settings change storage', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.check('input[name=photo-size][value=standard]');
  await page.uncheck('#anon-stories');
  await expect.poll(() => page.evaluate(() => chrome.storage.local.get(['photoSize', 'anonStories']))).toEqual({ photoSize: 'standard', anonStories: false });
});

test('settings follow changes made elsewhere (the popup)', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.evaluate(() => chrome.storage.local.set({ photoSize: 'standard', anonStories: true }));
  await expect(page.locator('input[name=photo-size][value=standard]')).toBeChecked();
  await expect(page.locator('#anon-stories')).toBeChecked();
});

test('popup Import opens the app settings', async ({ context, extensionId }) => {
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.click('#settings');
  const [tab] = await Promise.all([context.waitForEvent('page', (p) => /app\.html#settings$/.test(p.url())), popup.click('#import')]);
  await expect(tab).toHaveURL(/app\.html#settings$/);
});

test('app Export saves a backup file', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.click('#export');
  await expect(page.locator('#backup-status')).toHaveText(/^Saved to Downloads\/KeepKeep as KeepKeep-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test('Settings and About sit in the sidebar footer', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  await expect(page.locator('#nav-bottom .item')).toHaveText(['Settings', 'About']);
  await expect(page.locator('#nav-bottom .item.active')).toHaveText('About');
});

test('About has the version, badges and links', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  await expect(page.locator('.version')).toHaveText(/^v\d/);
  await expect(page.locator('.tag')).toHaveText(['No password', 'No tracking', 'No ads']);
  await expect(page.locator('a[href="#welcome"]')).toBeVisible();
  await expect(page.locator('a[href="#whats-new"]')).toBeVisible();
  await expect(page.locator('a[href="https://zetasis.net"]')).toBeVisible();
});
