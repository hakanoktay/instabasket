// Adds "Add to basket" buttons to Instagram pages:
//   - next to the date under each post (home feed, post page, post modal)
//   - on hover over post thumbnails (profile grid, explore)
//   - next to the Follow button on profile pages
//   - "Profile" and "Media" icons in the right-hand action column of the Reels viewer
//
// Instagram's markup has no stable class names and its labels are localized, so
// buttons are anchored on things that rarely change: post links, <time>
// elements, the profile <header> and, in the Reels viewer, the position of the
// icon column next to the video.
(() => {
  const SCAN_DELAY = 250;
  const buttons = new Set(); // { host, button, variant, idle, target }
  const owners = new Map(); // shortcode → username, for reels whose owner link isn't found
  const reelSeen = new WeakMap(); // <video> → the reel it was showing when last on screen
  let scanTimer;
  let lastHref = location.href;

  const ICONS = {
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 12.5-4.3"/><path d="M19 14v6M16 17h6"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M3 13l4-4 5 5"/><path d="M20 14v6M17 17h6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>',
  };

  const STYLE = `
    :host { all: initial; }
    button {
      display: inline-flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap;
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border-radius: 8px; border: 1px solid #c13584; background: #fff; color: #c13584;
      padding: 5px 9px;
    }
    button:hover { background: #fdf2f8; }
    button.saved { border-color: #16a34a; color: #16a34a; background: #fff; cursor: default; }
    button.busy { opacity: 0.6; cursor: progress; }
    .inline { margin-left: 8px; vertical-align: middle; }
    .header { padding: 7px 12px; font-size: 14px; }
    .overlay {
      position: absolute; top: 8px; right: 8px; z-index: 2; padding: 6px 8px;
      border: none; background: rgba(0, 0, 0, 0.65); color: #fff; font-size: 12px;
      opacity: 0; transition: opacity 0.12s;
    }
    /* Shown when hovering the thumbnail; always shown once it's in the basket. */
    :host-context(a:hover) .overlay, .overlay.saved, .overlay.busy { opacity: 1; }
    .overlay:hover { background: rgba(0, 0, 0, 0.8); }
    .overlay.saved { background: rgba(22, 163, 74, 0.9); color: #fff; }
    /* Reels viewer: styled like Instagram's own icon column (icon + small caption). */
    .reel {
      flex-direction: column; gap: 6px; padding: 4px; border: none; background: none;
      color: inherit; font-weight: 400;
    }
    .reel:hover { background: none; opacity: 0.7; }
    .reel.saved { color: #22c55e; background: none; border: none; }
    .reel svg { width: 26px; height: 26px; display: block; }
  `;

  const storageKey = (item) => (item.kind === 'profile' ? 'p:' + item.username : 'm:' + item.key);

  // Creates a button inside its own shadow root so Instagram's CSS can't touch
  // it. `target()` returns { url, key } for what the button adds (or null if it
  // can't be determined yet); it's re-evaluated because in the Reels viewer the
  // same button can end up pointing at a different reel.
  function makeButton(variant, target, opts = {}) {
    const host = document.createElement('span');
    host.dataset.instabasket = variant;
    if (variant === 'overlay') Object.assign(host.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><button class="${opts.cls || variant}"></button>`;
    const button = root.querySelector('button');
    if (variant === 'overlay') button.style.pointerEvents = 'auto';

    const entry = { host, button, variant, target, idle: opts.idle, icon: opts.icon, caption: opts.caption };
    buttons.add(entry);
    setSaved(entry, false);
    refresh(entry);

    // Stop the click from reaching Instagram (e.g. opening the post under an overlay).
    for (const type of ['mousedown', 'pointerdown', 'touchstart']) button.addEventListener(type, (e) => e.stopPropagation());
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (button.classList.contains('saved') || button.classList.contains('busy')) return;
      button.classList.add('busy');
      if (!entry.icon) button.textContent = variant === 'overlay' ? '…' : 'Adding…';
      const t = await target(true);
      if (t) await InstaBasketDrop.run(t.url);
      else await InstaBasketDrop.run(null); // shows "not an Instagram profile or post"
      button.classList.remove('busy');
      refresh(entry);
    });
    return host;
  }

  function setSaved(entry, saved) {
    const { button } = entry;
    button.classList.toggle('saved', saved);
    button.title = saved ? 'In basket' : entry.caption ? `Add ${entry.caption.toLowerCase()} to basket` : 'Add to basket';
    if (entry.icon) {
      button.innerHTML = (saved ? ICONS.check : ICONS[entry.icon]) + `<span>${entry.caption}</span>`;
    } else {
      const overlay = entry.variant === 'overlay';
      button.textContent = saved ? (overlay ? '✓' : '✓ In basket') : entry.idle;
    }
  }

  async function refresh(entry) {
    if (entry.button.classList.contains('busy')) return;
    try {
      const t = await entry.target(false);
      const value = t && (await chrome.storage.local.get(t.key))[t.key];
      setSaved(entry, !!value);
    } catch {} // extension reloaded; the page needs a reload anyway
  }

  const fixed = (item, url) => async () => ({ url, key: storageKey(item) });

  // A post permalink: /p/CODE/, /reel/CODE/ or /username/p/CODE/, but not
  // comment links like /p/CODE/c/123/.
  function postItem(href) {
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (url.pathname.split('/').filter(Boolean).length > 3) return null;
    const item = InstaBasket.parse(url.href);
    return item?.kind === 'media' && item.code ? item : null;
  }

  // Posts in the feed, on the post page and in the post modal: the date under
  // the action bar is a link to the post.
  function addDateButtons() {
    for (const time of document.querySelectorAll('a[href] time[datetime]')) {
      const link = time.closest('a');
      if (link.dataset.instabasketDone) continue;
      link.dataset.instabasketDone = '1';
      const item = postItem(link.getAttribute('href'));
      if (!item) continue;
      link.after(makeButton('inline', fixed(item, item.url), { idle: '🧺 Add to basket' }));
    }
  }

  // Thumbnails on profile grids and explore: links to posts that wrap an image.
  function addOverlayButtons() {
    for (const link of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
      if (link.dataset.instabasketDone) continue;
      if (!link.querySelector('img') || link.querySelector('time')) continue;
      const rect = link.getBoundingClientRect();
      if (rect.width && rect.width < 100) continue;
      link.dataset.instabasketDone = '1';
      const item = postItem(link.getAttribute('href'));
      if (!item) continue;
      if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
      link.appendChild(makeButton('overlay', fixed(item, item.url), { idle: '🧺' }));
    }
  }

  // Profile pages: next to Follow / Message (or Edit profile on your own profile).
  function addProfileButton() {
    const item = InstaBasket.parse(location.href);
    const wanted = item?.kind === 'profile' ? storageKey(item) : null;
    const existing = document.querySelector('[data-instabasket="header"]');
    if (existing) {
      if (existing.dataset.key === wanted) return;
      existing.remove(); // navigated to another profile or away from profiles
    }
    if (!wanted) return;

    const header = document.querySelector('main header');
    if (!header) return;
    // The first button with visible text is Follow / Following / Edit profile;
    // the profile picture's button has none.
    const actions = [...header.querySelectorAll('button, [role="button"]')]
      .find((b) => b.textContent.trim() && !b.closest('[data-instabasket]'));
    const host = makeButton('header', fixed(item, InstaBasket.profileUrl(item.username)), { idle: '🧺 Add to basket' });
    host.dataset.key = wanted;
    Object.assign(host.style, { marginLeft: '8px', display: 'inline-flex', alignSelf: 'center' });
    if (actions) {
      // Insert after the button's own wrapper so it sits in the same row.
      const wrapper = actions.parentElement?.children.length === 1 ? actions.parentElement : actions;
      wrapper.after(host);
    } else {
      header.appendChild(host);
    }
  }

  // ---- Reels viewer (/reels/...) ----

  // Instagram's icon column (like, comment, share, save, …) sits just to the
  // right of the video. Find the icons there and return the element that holds
  // them all, plus the child of it that holds the first icon.
  function findReelColumn(video) {
    const v = video.getBoundingClientRect();
    const icons = [...document.querySelectorAll('svg')].filter((s) => {
      if (s.closest('[data-instabasket]')) return false;
      const r = s.getBoundingClientRect();
      return r.width >= 16 && r.width <= 48 && r.left >= v.right - 4 && r.left <= v.right + 160 &&
        r.top >= v.top - 20 && r.bottom <= v.bottom + 20;
    });
    if (icons.length < 3) return null;
    let column = icons[0].parentElement;
    while (column && !icons.every((s) => column.contains(s))) column = column.parentElement;
    if (!column || column.contains(video)) return null;
    let first = icons[0];
    while (first.parentElement !== column) first = first.parentElement;
    return { column, first };
  }

  // The element holding one reel: the smallest ancestor of both the video and its icon column.
  function reelContainer(video, column) {
    let el = video.parentElement;
    while (el && !el.contains(column)) el = el.parentElement;
    return el;
  }

  // Which reel a video is. The Reels viewer changes the address bar to
  // /reels/CODE/ for the reel on screen, so that's used when the reel itself
  // has no link to its own page.
  function reelMedia(video, container) {
    for (const a of container.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')) {
      const item = postItem(a.getAttribute('href'));
      if (item) return item;
    }
    const v = video.getBoundingClientRect();
    const onScreen = v.top < innerHeight / 2 && v.bottom > innerHeight / 2;
    if (onScreen) {
      const item = InstaBasket.parse(location.href);
      if (item?.kind === 'media' && item.code) reelSeen.set(video, item);
    }
    // Remember it after scrolling away, when the address bar shows another reel.
    return reelSeen.get(video) || null;
  }

  // The reel's owner: the username link next to the reel (bottom left in the
  // Reels viewer). Matched by position so links elsewhere on the page (like
  // your own profile in the sidebar) are never picked. Falls back to looking
  // the reel up when no such link is found.
  async function reelOwner(video, media, allowFetch) {
    const v = video.getBoundingClientRect();
    let best = null;
    for (const a of document.querySelectorAll('main a[href]')) {
      if (a.closest('[data-instabasket]')) continue;
      const r = a.getBoundingClientRect();
      if (!r.width || r.bottom < v.top || r.top > v.bottom || r.right < v.left - 600 || r.left > v.right) continue;
      const item = InstaBasket.parse(new URL(a.getAttribute('href'), location.href).href);
      if (item?.kind !== 'profile') continue;
      const distance = Math.hypot(Math.max(0, v.left - r.right), v.bottom - r.bottom);
      if (!best || distance < best.distance) best = { username: item.username, distance };
    }
    if (best) return best.username;
    if (!media) return null;
    if (!owners.has(media.code) && allowFetch) {
      owners.set(media.code, (await InstaApi.media(media.code).catch(() => ({}))).username || null);
    }
    return owners.get(media.code) || null;
  }

  function addReelButtons() {
    if (!location.pathname.startsWith('/reels/')) return;
    for (const video of document.querySelectorAll('video')) {
      if (video.dataset.instabasketDone) continue;
      const rect = video.getBoundingClientRect();
      if (rect.width < 150 || rect.height < 250) continue;
      const found = findReelColumn(video);
      if (!found) continue; // not laid out yet; retried on the next scan
      video.dataset.instabasketDone = '1';
      const container = reelContainer(video, found.column);

      const mediaTarget = async () => {
        const media = reelMedia(video, container);
        return media && { url: media.url, key: storageKey(media) };
      };
      const profileTarget = async (allowFetch) => {
        const username = await reelOwner(video, reelMedia(video, container), allowFetch);
        return username && { url: InstaBasket.profileUrl(username), key: 'p:' + username };
      };

      // Match the colour of Instagram's own icons (white on the dark Reels page).
      const color = getComputedStyle(found.first.querySelector('svg') || found.first).color;
      for (const [icon, caption, target] of [['profile', 'Profile', profileTarget], ['media', 'Media', mediaTarget]]) {
        const host = makeButton('reel', target, { cls: 'reel', icon, caption });
        Object.assign(host.style, { display: 'flex', justifyContent: 'center', padding: '6px 0', color });
        found.column.insertBefore(host, found.first);
      }
    }
  }

  function scan() {
    for (const entry of buttons) if (!entry.host.isConnected) buttons.delete(entry);
    try {
      addDateButtons();
      addOverlayButtons();
      addProfileButton();
      addReelButtons();
    } catch (e) {
      console.debug('[InstaBasket]', e);
    }
    // Scrolling through reels changes the URL without reloading; reel buttons
    // may now point at a different reel.
    if (location.href !== lastHref) {
      lastHref = location.href;
      buttons.forEach(refresh);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DELAY);
  }

  // Instagram is a single-page app: posts load while scrolling and navigation
  // doesn't reload the page, so rescan whenever the DOM changes or the page scrolls.
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('scroll', scheduleScan, { capture: true, passive: true });
  chrome.storage.onChanged.addListener(() => buttons.forEach(refresh));
  scan();
})();
