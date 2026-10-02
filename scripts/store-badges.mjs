// Adds the trust badges (No password · No tracking · No ads) to the store images.
// Inputs: store/source/*.png (the images without badges). Usage:
//   node scripts/store-badges.mjs store/assets [one-image-name]
// Needs Playwright (the path below is the one in Claude's cloud sandbox; locally use 'playwright').
import fs from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2];
const font = 'data:font/woff2;base64,' + fs.readFileSync(new URL('../store/source/inter.woff2', import.meta.url)).toString('base64');
const lock = (c) => `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;
const TEXT = 'No password <i>·</i> Nothing leaves your computer';
const ONLY = process.argv[3];
const jobs0 = [
  ...['screenshot-1-keep','screenshot-2-lists','screenshot-3-download','screenshot-4-anonymous','screenshot-5-video'].map(n => ({ n, w:1280, h:800,
    badge:`<div class="trust" style="left:64px;top:676px"><div class="tags"><div class="tag">${lock('#fff')}<span>No password</span></div><div class="tag soft"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg><span>No tracking</span></div><div class="tag soft"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg><span>No ads</span></div></div><div class="sub">Never asks for your password.<br>Nothing leaves your computer.</div></div>` })),
  { n:'promo-small-440x280', w:440, h:280, badge:`<div class="trust sm" style="left:34px;top:236px"><div class="tags dark"><div class="tag">${lock('#fff')}<span>No password</span></div><div class="tag soft"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg><span>No tracking</span></div><div class="tag soft"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg><span>No ads</span></div></div></div>` },
  { n:'promo-marquee-1400x560', w:1400, h:560, badge:`<div class="trust md" style="left:80px;top:458px"><div class="tags dark"><div class="tag">${lock('#fff')}<span>No password</span></div><div class="tag soft"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg><span>No tracking</span></div><div class="tag soft"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg><span>No ads</span></div></div><div class="sub dk">Never asks for your password. Nothing leaves your computer.</div></div>` },
];
const jobs = ONLY ? jobs0.filter(j => j.n === ONLY) : jobs0;
const b = await chromium.launch();
for (const j of jobs) {
  const img = 'data:image/png;base64,' + fs.readFileSync(new URL('../store/source/' + j.n + '.png', import.meta.url)).toString('base64');
  const p = await b.newPage({ viewport: { width: j.w, height: j.h } });
  await p.setContent(`<!doctype html><style>
  @font-face{font-family:Inter;src:url(${font}) format('woff2');font-weight:100 900}
  html,body{margin:0;width:${j.w}px;height:${j.h}px;overflow:hidden;background:#fff}
  .bg{position:absolute;inset:0;width:${j.w}px;height:${j.h}px}
  .pill{position:absolute;display:flex;align-items:center;gap:10px;height:40px;padding:0 18px 0 14px;border-radius:999px;
    background:rgba(255,255,255,.72);border:1px solid rgba(129,25,181,.16);box-shadow:0 4px 18px rgba(69,11,98,.06);
    font:600 15px/1 Inter;color:#2a1d33;letter-spacing:-.005em}
  .pill svg{width:17px;height:17px;flex:none}
  .pill i,.line i{font-style:normal;opacity:.45;margin:0 2px}
  .line{position:absolute;display:flex;align-items:center;gap:7px;font-family:Inter;font-weight:600;color:rgba(255,255,255,.92)}
  .line svg{width:1.05em;height:1.05em;flex:none}
    .trust{position:absolute;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
  .tag{display:flex;align-items:center;gap:8px;height:34px;padding:0 15px 0 12px;border-radius:999px;
    background:linear-gradient(135deg,#6a0fa8,#8119b5 55%,#9b3fd0);color:#fff;font:700 14.5px/1 Inter;letter-spacing:.005em;
    box-shadow:0 6px 18px rgba(129,25,181,.22)}
  .tags{display:flex;gap:8px}
  .tag.soft{background:rgba(129,25,181,.10);color:#5a1385;box-shadow:none;border:1px solid rgba(129,25,181,.18)}
  .tag.soft svg path,.tag.soft svg circle{stroke:#8119b5}
  .tags.dark .tag{background:#fff;color:#5a1385;box-shadow:0 6px 18px rgba(20,0,40,.25)}
  .tags.dark .tag svg path,.tags.dark .tag svg rect,.tags.dark .tag svg circle{stroke:#8119b5}
  .tags.dark .tag.soft{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.28);box-shadow:none}
  .tags.dark .tag.soft svg path,.tags.dark .tag.soft svg circle{stroke:#fff}
  .sub.dk{color:rgba(255,255,255,.78);font-size:15px}
  .trust.sm .tags{gap:6px}.trust.sm .tag{height:26px;font-size:11.5px;padding:0 10px 0 8px;gap:5px}.trust.sm .tag svg{width:12px;height:12px}
  .tag svg{width:16px;height:16px;flex:none}
  .sub{font:500 14px/1.45 Inter;color:#5b4f63;letter-spacing:-.003em}
  .sub i{font-style:normal;opacity:.5;margin:0 3px}
  </style><img class="bg" src="${img}">${j.badge}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/' + j.n + '.png' });
  await p.close();
}
await b.close();
