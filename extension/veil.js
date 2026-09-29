// KeepKeep's "veil": the anonymous-stories mode, visible like a private window.
//  - Passes the setting to stories-main.js (page context, can't read storage)
//    and turns on veil.css through an attribute on <html>.
//  - Marks what veil.css restyles: story-ring canvases (+ the tray's mask
//    badges), and in the story viewer the dark stage and the progress bars.
//  - Shows a mask capsule (top right) with a small sheet to turn it off; in the
//    viewer a status pill naming whose story you watch, and a heads-up when
//    you're about to reply or react, which the owner would see.
//  - "The veil drops": a short purple curtain when the mode is switched.
(() => {
  const MASK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 10.5l1.7-5a1 1 0 0 1 1.3-.6l3.5 1.3 3.5-1.3a1 1 0 0 1 1.3.6l1.7 5z" fill="currentColor"/><path d="M2.5 10.5h19"/><circle cx="7.5" cy="16" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/><path d="M10.1 16c1.3-.9 2.5-.9 3.8 0"/></svg>';
  const html = document.documentElement;
  let on = false;
  let root; // shadow root of our own layer
  let host;

  const inStories = () => location.pathname.startsWith('/stories/');
  const hideCapsule = () => /^\/(direct|accounts)\//.test(location.pathname);
  // /stories/<username>/<id>/ – highlights have no username in the address.
  const owner = () => {
    const m = location.pathname.match(/^\/stories\/([^/]+)\//);
    return m && m[1] !== 'highlights' ? m[1] : null;
  };

  // ---- Our layer (shadow DOM, never inside Instagram's own elements) ----

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .ui { font: 400 13px/17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #fff; }
    svg { display: block; width: 100%; height: 100%; }
    .grad { background: linear-gradient(135deg, #8119b5, #450b62); box-shadow: 0 4px 14px rgba(69, 11, 98, 0.35); }

    .capsule { position: fixed; top: 14px; right: 16px; z-index: 2147483646; display: flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px 0 8px; border: none; border-radius: 999px; cursor: pointer; color: #fff;
      font-family: inherit; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.2px; animation: pop 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .capsule:hover { filter: brightness(1.12); }
    /* Posts and Reels open with Instagram's close / arrow buttons top right. */
    .capsule.shift { right: 140px; }
    .sheet.shift { right: 140px; }
    .capsule .i { width: 20px; height: 20px; }
    .sheet { position: fixed; top: 54px; right: 16px; z-index: 2147483646; width: 264px; padding: 14px 16px 12px; border-radius: 14px;
      background: #fff; color: #000; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18); animation: drop 0.22s ease-out both; }
    .sheet.dark { background: #262626; color: #f5f5f5; }
    .sheet b { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .sheet b .i { width: 22px; height: 22px; padding: 3px; border-radius: 50%; color: #fff; flex: none; }
    .sheet p { margin: 8px 0 12px; color: #737373; font-size: 12px; line-height: 16px; }
    .sheet.dark p { color: #a8a8a8; }
    .sheet button { all: unset; cursor: pointer; font-weight: 600; font-size: 13px; color: #8119b5; }
    .sheet.dark button { color: #c07fe0; }
    .sheet button:hover { text-decoration: underline; }

    .status { position: fixed; top: 66px; left: 20px; z-index: 2147483646; display: flex; align-items: center; gap: 8px;
      padding: 6px 14px 6px 8px; border-radius: 999px; pointer-events: none; animation: pop 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .status .i { width: 22px; height: 22px; flex: none; }
    .status .t { display: flex; flex-direction: column; }
    .status .t b { font-size: 12px; line-height: 15px; }
    .status .t span { font-size: 11px; line-height: 14px; opacity: 0.85; }

    .warn { position: fixed; z-index: 2147483647; max-width: 280px; padding: 8px 12px; border-radius: 10px; pointer-events: none;
      font-size: 12px; line-height: 16px; animation: rise 0.18s ease-out both; }
    .warn::after { content: ""; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; margin-left: -5px;
      transform: rotate(45deg); background: #5a0f80; }

    .curtain { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
      background: linear-gradient(180deg, rgba(69, 11, 98, 0.55), rgba(129, 25, 181, 0.35) 55%, rgba(170, 86, 213, 0)); }
    .curtain.down { animation: veil-down 0.75s cubic-bezier(0.3, 0.7, 0.2, 1) both; }
    .curtain.up { animation: veil-up 0.6s cubic-bezier(0.4, 0, 0.6, 1) both; }

    @keyframes pop { from { opacity: 0; transform: scale(0.85); } }
    @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
    @keyframes rise { from { opacity: 0; transform: translateY(4px); } }
    @keyframes veil-down { 0% { transform: translateY(-100%); opacity: 1; } 55% { transform: none; opacity: 1; } 100% { transform: none; opacity: 0; } }
    @keyframes veil-up { 0% { transform: none; opacity: 0.9; } 100% { transform: translateY(-100%); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .curtain { display: none; } .capsule, .status, .sheet, .warn { animation: none; } }
  `;

  function layer() {
    if (!host) {
      host = document.createElement('div');
      host.id = 'keepkeep-veil';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${STYLE}</style><div class="ui"></div>`;
    }
    if (!host.isConnected) html.appendChild(host);
    return root.querySelector('.ui');
  }
  const el = (cls, inner = '', tag = 'div') => Object.assign(document.createElement(tag), { className: cls, innerHTML: inner });
  const find = (cls) => root?.querySelector('.' + cls);
  const isDark = () => html.classList.contains('__fb-dark-mode');

  // ---- Capsule + sheet (outside the viewer) ----

  function renderCapsule() {
    const show = on && !inStories() && !hideCapsule();
    if (!show) {
      find('capsule')?.remove();
      find('sheet')?.remove();
      return;
    }
    const shift = /^\/(p|reels?|tv)\//.test(location.pathname);
    if (find('capsule')) {
      find('capsule').classList.toggle('shift', shift);
      return;
    }
    const b = el('capsule grad', `<span class="i">${MASK}</span>Anonymous`, 'button');
    b.title = 'KeepKeep: watching stories anonymously';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      find('sheet') ? find('sheet').remove() : openSheet();
    });
    b.classList.toggle('shift', shift);
    layer().append(b);
  }

  function openSheet() {
    const s = el(`sheet${isDark() ? ' dark' : ''}`, `
      <b><span class="i grad">${MASK}</span>Watching stories anonymously</b>
      <p>Story owners won't see you in their viewers list. Stories stay unseen for you too. Replies and reactions are still visible.</p>
      <button type="button">Turn off</button>`);
    s.classList.toggle('shift', find('capsule')?.classList.contains('shift'));
    s.addEventListener('click', (e) => e.stopPropagation());
    s.querySelector('button').addEventListener('click', () => chrome.storage.local.set({ anonStories: false }));
    layer().append(s);
  }
  document.addEventListener('click', () => find('sheet')?.remove());

  // ---- Story viewer: status pill naming whose story it is ----

  function renderStatus() {
    const show = on && inStories();
    let s = find('status');
    if (!show) return s?.remove();
    const who = owner();
    const text = who ? `@${who} won't see you` : 'Hidden from viewers';
    if (!s) {
      s = el('status grad', `<span class="i">${MASK}</span><span class="t"><b>Anonymous</b><span></span></span>`);
      layer().append(s);
    }
    const line = s.querySelector('.t span');
    if (line.textContent !== text) line.textContent = text;
  }

  // ---- Heads-up before replying / reacting (the owner would see those) ----

  let warnFor = null;
  function showWarn(target, text) {
    hideWarn();
    warnFor = target;
    const w = el('warn grad');
    w.textContent = text;
    w.style.background = '#5a0f80';
    layer().append(w);
    const r = target.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    w.style.left = `${Math.max(8, Math.min(innerWidth - wr.width - 8, r.left + r.width / 2 - wr.width / 2))}px`;
    w.style.top = `${Math.max(8, r.top - wr.height - 10)}px`;
  }
  function hideWarn() {
    warnFor = null;
    find('warn')?.remove();
  }
  const replyBox = () => document.querySelector('textarea, div[contenteditable="true"][role="textbox"]');
  const who = () => (owner() ? `@${owner()}` : 'the owner');
  document.addEventListener('focusin', (e) => {
    if (!on || !inStories()) return;
    if (e.target.matches?.('textarea, [contenteditable="true"]')) showWarn(e.target, `Replying shows ${who()} that you watched.`);
  });
  document.addEventListener('focusout', (e) => warnFor === e.target && hideWarn());
  // Like / react / share buttons sit on the reply box's row.
  document.addEventListener('mouseover', (e) => {
    if (!on || !inStories()) return;
    const btn = e.target.closest?.('[role="button"], button');
    const box = replyBox();
    if (!btn || !box || btn.contains(box)) return;
    const a = btn.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const sameRow = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 30 && a.left >= b.left && a.width < 60;
    if (sameRow && warnFor !== btn) showWarn(btn, `Reactions are visible to ${who()}.`);
  });
  document.addEventListener('mouseout', (e) => {
    if (warnFor && warnFor.tagName !== 'TEXTAREA' && !warnFor.isContentEditable && !warnFor.contains(e.relatedTarget)) hideWarn();
  });

  // ---- Marking Instagram's elements for veil.css ----

  const seen = new WeakSet();
  function markRings() {
    for (const c of document.getElementsByTagName('canvas')) {
      if (seen.has(c)) continue;
      const r = c.getBoundingClientRect();
      if (!r.width) continue; // not laid out yet; look again later
      seen.add(c);
      const square = Math.abs(r.width - r.height) <= 2 && r.width >= 28 && r.width <= 220;
      const parent = c.parentElement;
      if (!square || !parent?.querySelector('img')) continue;
      c.dataset.kkRing = '';
      // Tray-sized rings get the mask badge.
      const badge = r.width >= 60 && r.width <= 110;
      if (badge) parent.dataset.kkRingHost = 'badge';
      else if (getComputedStyle(parent).position === 'static') parent.dataset.kkRingHost = 'relative';
    }
  }

  function markViewer() {
    if (!inStories()) return;
    // The stage: a full-window element with a dark, opaque background.
    for (const e of document.querySelectorAll('body div, body section')) {
      if (e.dataset.kkStage !== undefined) continue;
      const r = e.getBoundingClientRect();
      if (r.width < innerWidth - 2 || r.height < innerHeight - 2) continue;
      const m = getComputedStyle(e).backgroundColor.match(/\d+(\.\d+)?/g);
      if (!m || (m[3] !== undefined && +m[3] < 0.9)) continue;
      if (+m[0] + +m[1] + +m[2] < 3 * 60) e.dataset.kkStage = '';
    }
    // Progress bars: thin bars along the top of the story.
    for (const e of document.querySelectorAll('div')) {
      if (e.dataset.kkBar !== undefined) continue;
      const r = e.getBoundingClientRect();
      if (r.height > 0 && r.height <= 4 && r.width >= 10 && r.top < 120 && r.top > 0) {
        const bg = getComputedStyle(e).backgroundColor;
        if (/255, 255, 255/.test(bg)) e.dataset.kkBar = '';
      }
    }
  }

  let scanTimer = null;
  function scan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      markRings();
      if (on) markViewer();
    }, 250);
  }
  new MutationObserver(scan).observe(html, { childList: true, subtree: true });

  // ---- Switching ----

  function curtain(dir) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = el(`curtain ${dir}`);
    layer().append(c);
    c.addEventListener('animationend', () => c.remove());
  }

  function render() {
    renderCapsule();
    renderStatus();
    if (!on || !inStories()) hideWarn();
  }

  function apply(value, animate) {
    const changed = value !== on;
    on = value;
    html.dataset.keepkeepAnonStories = on ? '1' : '0';
    if (animate && changed) curtain(on ? 'down' : 'up');
    scan();
    render();
  }

  chrome.storage.local.get('anonStories').then(({ anonStories }) => apply(anonStories === true, false), () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.anonStories) apply(changes.anonStories.newValue === true, true);
  });
  // Instagram changes pages without reloading.
  let path = location.pathname;
  setInterval(() => {
    if (location.pathname !== path) {
      path = location.pathname;
      find('sheet')?.remove();
      scan();
    }
    if (on) render();
  }, 400);
})();
