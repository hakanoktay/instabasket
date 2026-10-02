// No "basket" left from the InstaBasket days in what users see.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

test('the profile page button says "Save profile", not basket', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://www.instagram.com/alice/?page=profile');
  const button = page.locator('[data-keepkeep="header"]');
  await expect(button).toHaveCount(1, { timeout: 5000 });
  await expect(button.locator('button')).toHaveAttribute('title', 'Save this profile to KeepKeep');
  await expect(button.locator('.add .label')).toHaveText('Save profile');
  await expect(button.locator('.done .label')).toHaveText('Saved');
});

test('no user-visible "basket" text in the extension', () => {
  const dir = path.join(__dirname, '..', 'extension');
  for (const f of fs.readdirSync(dir).filter((f) => /\.(js|html|css)$/.test(f))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
      .replace(/\/\/.*$/gm, '') // comments
      .replace(/basket\.js|['"]basket['"]/g, ''); // file name and the old storage key stay
    expect(text.match(/.{0,30}basket.{0,30}/gi), f).toBeNull();
  }
});
