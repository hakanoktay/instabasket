// Run with: cd tests && npm test
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30_000,
  workers: 1, // each test starts its own Chromium with the extension
  reporter: 'list',
});
