// Starts Chromium with extension/ loaded unpacked and serves fake
// instagram.com pages from tests/pages/ (nothing goes to the real site).
const path = require('path');
const fs = require('fs');
const base = require('@playwright/test');

const EXTENSION = path.join(__dirname, '..', 'extension');
const PAGES = path.join(__dirname, 'pages');

exports.test = base.test.extend({
  context: async ({}, use) => {
    const context = await base.chromium.launchPersistentContext('', {
      channel: 'chromium', // full Chromium: the headless shell can't load extensions
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    // Instagram pages come from tests/pages/<name>.html: /?page=<name>
    await context.route(/^https:\/\/(www\.)?instagram\.com\//, (route) => {
      const name = new URL(route.request().url()).searchParams.get('page') || 'blank';
      const file = path.join(PAGES, `${name}.html`);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ contentType: 'text/html', body: fs.readFileSync(file) });
    });
    // Everything else Instagram-ish (CDN, API) is answered empty unless a test overrides it.
    await context.route(/cdninstagram\.com|fbcdn\.net/, (route) => route.fulfill({ status: 404, body: '' }));
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});
exports.expect = base.expect;
