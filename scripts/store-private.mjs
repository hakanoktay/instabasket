// Builds the "Private by design" store screenshot (store/assets/screenshot-private.png,
// also docs/images/): the store images' layout on the left, and on the right a
// lock emblem with the real Settings → About card, captured from the extension.
// Usage (after `cd tests && npm install`):  node scripts/store-private.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tests/node_modules/playwright/index.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const b64 = (f) => fs.readFileSync(f).toString('base64');
const font = 'data:font/woff2;base64,' + b64(path.join(ROOT, 'store/source/inter.woff2'));
const logo = 'data:image/svg+xml;base64,' + b64(path.join(EXT, 'icons/logo.svg'));

// 1. The real About card, at 2× for sharpness.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-shot-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', deviceScaleFactor: 2, viewport: { width: 400, height: 580 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [worker] = ctx.serviceWorkers();
if (!worker) worker = await ctx.waitForEvent('serviceworker');
const id = new URL(worker.url()).host;
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.click('#settings');
await popup.waitForTimeout(500);
const about = 'data:image/png;base64,' + (await popup.locator('.about').screenshot({ omitBackground: true })).toString('base64');
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });

// 2. The slide.
const check = '<svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const lock = (c) => `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;
const eye = '<svg viewBox="0 0 24 24" fill="none" stroke="#8119b5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const noads = '<svg viewBox="0 0 24 24" fill="none" stroke="#8119b5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';

const html = `<!doctype html><style>
@font-face{font-family:Inter;src:url(${font}) format('woff2');font-weight:100 900}
*{box-sizing:border-box}
html,body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:Inter}
body{position:relative;background:
  radial-gradient(900px 600px at 0% 0%,#fbf7fd 0%,rgba(251,247,253,0) 60%),
  radial-gradient(700px 520px at 100% 100%,#dcc0f0 0%,rgba(220,192,240,0) 70%),
  linear-gradient(135deg,#f6effa,#efe2f7)}
.left{position:absolute;left:64px;top:0;bottom:0;width:420px;display:flex;flex-direction:column;justify-content:center}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:21px;color:#16101b;margin-bottom:26px}
.brand img{width:34px;height:34px;border-radius:8px}
h1{margin:0 0 22px;font-size:50px;line-height:1.02;font-weight:800;letter-spacing:-.035em;color:#16101b}
h1 em{font-style:normal;background:linear-gradient(90deg,#7a14b0,#a64bd6);-webkit-background-clip:text;color:transparent}
.lead{margin:0 0 28px;font-size:18.5px;line-height:1.5;color:#5b4f63}
ul.checks{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px}
ul.checks li{display:flex;align-items:center;gap:12px;font-size:16.5px;font-weight:600;color:#2a1d33}
ul.checks .c{flex:none;width:24px;height:24px;border-radius:50%;background:#6a0fa8;display:grid;place-items:center}
ul.checks .c svg{width:16px;height:16px}
.trust{position:absolute;left:64px;top:676px;display:flex;flex-direction:column;gap:10px}
.tags{display:flex;gap:8px}
.tag{display:flex;align-items:center;gap:8px;height:34px;padding:0 15px 0 12px;border-radius:999px;
  background:linear-gradient(135deg,#6a0fa8,#8119b5 55%,#9b3fd0);color:#fff;font:700 14.5px/1 Inter;box-shadow:0 6px 18px rgba(129,25,181,.22)}
.tag.soft{background:rgba(129,25,181,.10);color:#5a1385;box-shadow:none;border:1px solid rgba(129,25,181,.18)}
.tag svg{width:16px;height:16px}
.sub{font:500 14px/1.45 Inter;color:#5b4f63}
.right{position:absolute;left:520px;right:56px;top:96px;bottom:96px;border-radius:28px;
  background:linear-gradient(160deg,rgba(255,255,255,.75),rgba(255,255,255,.35));border:1px solid rgba(129,25,181,.14);
  box-shadow:0 30px 80px rgba(69,11,98,.14);display:flex;align-items:center;justify-content:center;gap:44px}
.emblem{position:relative;width:250px;height:250px;display:grid;place-items:center}
.emblem .ring{position:absolute;border-radius:50%;border:1.5px solid rgba(129,25,181,.16)}
.emblem .r1{inset:0}.emblem .r2{inset:28px;border-color:rgba(129,25,181,.22)}
.emblem .core{width:140px;height:140px;border-radius:40px;display:grid;place-items:center;
  background:linear-gradient(135deg,#6a0fa8,#8119b5 55%,#9b3fd0);box-shadow:0 24px 50px rgba(129,25,181,.35)}
.emblem .core svg{width:70px;height:70px}
.cap{position:absolute;bottom:-34px;left:50%;transform:translateX(-50%);white-space:nowrap;font-weight:700;font-size:14px;color:#5a1385;
  background:#fff;border:1px solid rgba(129,25,181,.18);border-radius:999px;padding:8px 14px;box-shadow:0 8px 20px rgba(69,11,98,.08)}
.card{width:368px;border-radius:16px;background:#fff;box-shadow:0 22px 60px rgba(69,11,98,.20);padding:6px}
.card img{display:block;width:100%}
.card .label{font-weight:700;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:#8a7a96;padding:10px 12px 8px}
</style>
<div class="left">
  <div class="brand"><img src="${logo}">KeepKeep</div>
  <h1>Private<br><em>by design</em></h1>
  <p class="lead">KeepKeep works inside the Instagram tab you're already signed in to. What you save stays on your computer.</p>
  <ul class="checks">
    <li><span class="c">${check}</span>Never asks for your password</li>
    <li><span class="c">${check}</span>Everything stays on your computer</li>
    <li><span class="c">${check}</span>No account, no ads, no tracking</li>
  </ul>
</div>
<div class="trust"><div class="tags"><div class="tag">${lock('#fff')}<span>No password</span></div><div class="tag soft">${eye}<span>No tracking</span></div><div class="tag soft">${noads}<span>No ads</span></div></div>
  <div class="sub">Never asks for your password.<br>Nothing leaves your computer.</div></div>
<div class="right">
  <div class="emblem"><div class="ring r1"></div><div class="ring r2"></div><div class="core">${lock('#fff')}</div><div class="cap">No login · No password</div></div>
  <div class="card"><div class="label">KeepKeep · Settings → About</div><img src="${about}"></div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
for (const dir of ['store/assets', 'docs/images']) await page.screenshot({ path: path.join(ROOT, dir, 'screenshot-private.png') });
await browser.close();
console.log('✓ store/assets/screenshot-private.png, docs/images/screenshot-private.png');
