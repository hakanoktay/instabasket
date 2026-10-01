// The store name: long and searchable in the store ("KeepKeep – … for
// Instagram"), just "KeepKeep" inside the extension; scripts/package.sh
// accepts it and still refuses names that misuse the trademark.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));

test('the manifest has the store name and the short name', () => {
  expect(manifest.name).toBe('KeepKeep – Downloader & Anonymous Story Viewer for Instagram');
  expect([...manifest.name].length).toBeLessThanOrEqual(75);
  expect(manifest.short_name).toBe('KeepKeep');
  expect(manifest.action.default_title).toBe('KeepKeep');
});

// Runs package.sh on a copy of the extension whose manifest has `name`.
function packageWith(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeep-pkg-'));
  fs.cpSync(path.join(ROOT, 'extension'), path.join(dir, 'extension'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  const file = path.join(dir, 'extension', 'manifest.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^  "name": ".*",$/m, `  "name": ${JSON.stringify(name)},`));
  try {
    execFileSync('bash', [path.join(dir, 'scripts', 'package.sh')], { stdio: 'pipe' });
    return 'ok';
  } catch (e) {
    return e.stderr.toString().trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('package.sh accepts the store name', () => {
  expect(packageWith(manifest.name)).toBe('ok');
});

test('package.sh counts characters, not bytes', () => {
  const at75 = 'KeepKeep – ' + 'x'.repeat(75 - 'KeepKeep – '.length - ' for Instagram'.length) + ' for Instagram';
  expect([...at75].length).toBe(75); // 77 bytes, because of the en dash
  expect(packageWith(at75)).toBe('ok');
  expect(packageWith(at75.replace('x', 'xx'))).toMatch(/76 characters; the store allows 75/);
});

test('package.sh refuses names that misuse the trademark', () => {
  for (const bad of ['InstaKeep – Downloader', 'KeepKeep – Instagram Downloader', 'KeepKeep – Gram Saver for Instagram', 'KeepKeep for Insta']) {
    expect(packageWith(bad), bad).toMatch(/may only end the name/);
  }
});
