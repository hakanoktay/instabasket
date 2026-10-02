// Thumbnail grids: every kind of tile gets KeepKeep's corner button.
const { test, expect } = require('./fixtures');

test('tiles with a background-image cover (profile Reels tab) or a video (Explore) get the button too', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://www.instagram.com/explore/?page=tiles');
  for (const href of ['/alice/reel/REEL1/', '/p/VIDEO1/', '/p/PHOTO1/']) {
    await expect(page.locator(`a[href="${href}"] [data-keepkeep="overlay"]`)).toHaveCount(1, { timeout: 5000 });
  }
});
