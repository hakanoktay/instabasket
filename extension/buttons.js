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
  const buttons = new Set(); // { host, button, target, label }
  const owners = new Map(); // shortcode → username, for reels whose owner link isn't found
  let scanTimer;
  let lastHref = location.href;

  const ICONS = {
    basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1.6 9.1a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M2.5 10h19M8 10l3-6M16 10l-3-6"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 12.5-4.3"/><path d="M19 14v6M16 17h6"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M3 13l4-4 5 5"/><path d="M20 14v6M17 17h6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  };

  // Instagram's colours: blue for actions, red for destructive ones, grey
  // secondary buttons. A saved button shows its state; hovering it turns it
  // into "Remove" (like "Following" → "Unfollow").
  const STYLE = `
    :host { all: initial; }
    button {
      --blue: #0095f6; --red: #ed4956; --text: #000; --muted: #737373; --secondary: #efefef; --secondary-hover: #dbdbdb;
      position: relative; display: inline-flex; align-items: center; cursor: pointer; white-space: nowrap;
      font: 600 14px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      border: none; background: none; padding: 0; color: var(--text);
    }
    button.dark { --text: #f5f5f5; --muted: #a8a8a8; --secondary: #363636; --secondary-hover: #262626; }
    button.busy { opacity: 0.5; cursor: progress; }
    .view { display: inline-flex; align-items: center; gap: 6px; }
    .view svg { width: 16px; height: 16px; flex: none; }
    .rm, .done { display: none; }
    .saved .add { display: none; }
    .saved .done { display: inline-flex; }
    .saved:hover .done { display: none; }
    .saved:hover .rm { display: inline-flex; }

    /* Next to a post's date: a text button, like Instagram's blue "Follow" links. */
    .inline { margin-left: 10px; font-size: 12px; vertical-align: middle; color: var(--blue); }
    .inline .view svg { width: 14px; height: 14px; }
    .inline:hover { color: var(--text); }
    .inline.saved { color: var(--muted); }
    .inline.saved:hover { color: var(--red); }

    /* Profile header: a grey secondary button, like "Message". */
    .header { height: 32px; padding: 0 16px; border-radius: 8px; background: var(--secondary); }
    .header:hover { background: var(--secondary-hover); }
    .header.saved:hover { color: var(--red); }

    /* Thumbnails: a round icon button in the corner, shown on hover. */
    .overlay {
      position: absolute; top: 8px; right: 8px; z-index: 2; width: 32px; height: 32px; justify-content: center;
      border-radius: 50%; background: rgba(0, 0, 0, 0.6); color: #fff; backdrop-filter: blur(4px);
      opacity: 0; transform: scale(0.9); transition: opacity 0.15s, transform 0.15s, background 0.15s;
    }
    .overlay .view svg { width: 18px; height: 18px; }
    :host-context(a:hover) .overlay, .overlay.saved, .overlay.busy { opacity: 1; transform: none; }
    .overlay:hover { background: rgba(0, 0, 0, 0.8); }
    .overlay.saved { background: var(--blue); }
    .overlay.saved:hover { background: var(--red); }
    .overlay .label { display: none; }

    /* Reels viewer: icon with a caption, like Instagram's own icon column. */
    .reel { flex-direction: column; color: inherit; font-weight: 400; font-size: 12px; padding: 4px; }
    .reel .view { flex-direction: column; gap: 6px; }
    .reel .view svg { width: 26px; height: 26px; }
    .reel:hover { opacity: 0.7; }
    .reel.saved { color: var(--blue); }
    .reel.saved:hover { color: var(--red); opacity: 1; }
  `;

  const storageKey = (item) => (item.kind === 'profile' ? 'p:' + item.username : 'm:' + item.key);

  // Creates a button inside its own shadow root so Instagram's CSS can't touch
  // it. `target()` returns { url, key } for what the button adds (or null if it
  // can't be determined yet); it's re-evaluated because in the Reels viewer the
  // same button can end up pointing at a different reel.
  //   opts.icon / opts.label: icon and text shown while not saved
  function makeButton(variant, target, opts = {}) {
    const host = document.createElement('span');
    host.dataset.instabasket = variant;
    if (variant === 'overlay') Object.assign(host.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const root = host.attachShadow({ mode: 'open' });
    const label = opts.label || 'Add to basket';
    const savedLabel = opts.savedLabel || 'In basket';
    root.innerHTML = `<style>${STYLE}</style>
      <button class="${variant}${InstaBasketPanel.isDarkPage() && variant !== 'reel' ? ' dark' : ''}">
        <span class="view add">${ICONS[opts.icon || 'basket']}<span class="label">${label}</span></span>
        <span class="view done">${ICONS.check}<span class="label">${savedLabel}</span></span>
        <span class="view rm">${ICONS.trash}<span class="label">Remove</span></span>
      </button>`;
    const button = root.querySelector('button');
    if (variant === 'overlay') button.style.pointerEvents = 'auto';

    const entry = { host, button, target, label };
    buttons.add(entry);
    setSaved(entry, false);
    refresh(entry);

    // Stop the click from reaching Instagram (e.g. opening the post under an overlay).
    for (const type of ['mousedown', 'pointerdown', 'touchstart']) button.addEventListener(type, (e) => e.stopPropagation());
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (button.classList.contains('busy')) return;
      button.classList.add('busy');
      const t = await target(true);
      if (!t) await InstaBasketDrop.run(null); // shows "not an Instagram profile or post"
      else if (button.classList.contains('saved')) await InstaBasketDrop.remove(t.key);
      else await InstaBasketDrop.run(t.url);
      button.classList.remove('busy');
      refresh(entry);
    });
    return host;
  }

  function setSaved(entry, saved) {
    entry.button.classList.toggle('saved', saved);
    entry.button.title = saved ? 'In basket · click to remove' : entry.label;
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
      link.after(makeButton('inline', fixed(item, item.url)));
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
      link.appendChild(makeButton('overlay', fixed(item, item.url)));
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
    const host = makeButton('header', fixed(item, InstaBasket.profileUrl(item.username)));
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

  // The reel's current <video>. Instagram sometimes swaps the video element
  // while keeping the icon column, so it's looked up from the column each time.
  function reelVideo(column) {
    for (let el = column.parentElement; el; el = el.parentElement) {
      const video = el.querySelector('video');
      if (video) return video;
    }
    return null;
  }

  // Which reel a column belongs to. The Reels viewer changes the address bar to
  // /reels/CODE/ for the reel on screen, so that's used when the reel itself
  // has no link to its own page. `memory.media` keeps the answer for when the
  // reel is scrolled away and the address bar shows another one.
  function reelMedia(column, memory) {
    const video = reelVideo(column);
    if (!video) return memory.media;
    for (const a of reelContainer(video, column)?.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]') || []) {
      const item = postItem(a.getAttribute('href'));
      if (item) return (memory.media = item);
    }
    const v = video.getBoundingClientRect();
    if (v.top < innerHeight / 2 && v.bottom > innerHeight / 2) {
      const item = InstaBasket.parse(location.href);
      if (item?.kind === 'media' && item.code) memory.media = item;
    }
    return memory.media;
  }

  // The reel's owner: the username link next to the reel (bottom left in the
  // Reels viewer). Matched by position so links elsewhere on the page (like
  // your own profile in the sidebar) are never picked. Falls back to looking
  // the reel up when no such link is found.
  async function reelOwner(column, media, allowFetch) {
    const video = reelVideo(column);
    const v = video ? video.getBoundingClientRect() : { width: 0 };
    let best = null;
    for (const a of v.width ? document.querySelectorAll('main a[href]') : []) {
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
      const rect = video.getBoundingClientRect();
      if (rect.width < 150 || rect.height < 250) continue;
      const found = findReelColumn(video);
      if (!found) continue; // not laid out yet; retried on the next scan
      const { column } = found;
      // The column is what's marked, not the video: a new <video> in the same
      // reel must not get a second pair of buttons.
      if (column.querySelector(':scope > [data-instabasket="reel"]')) continue;

      const memory = { media: null };
      const mediaTarget = async () => {
        const media = reelMedia(column, memory);
        return media && { url: media.url, key: storageKey(media) };
      };
      const profileTarget = async (allowFetch) => {
        const username = await reelOwner(column, reelMedia(column, memory), allowFetch);
        return username && { url: InstaBasket.profileUrl(username), key: 'p:' + username };
      };

      // Match the colour of Instagram's own icons (white on the dark Reels page).
      const color = getComputedStyle(found.first.querySelector('svg') || found.first).color;
      for (const [icon, label, target] of [['profile', 'Profile', profileTarget], ['media', 'Media', mediaTarget]]) {
        const host = makeButton('reel', target, { icon, label, savedLabel: label });
        Object.assign(host.style, { display: 'flex', justifyContent: 'center', padding: '6px 0', color });
        column.insertBefore(host, found.first);
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
  // After the extension is reloaded or updated, buttons from the previous copy
  // are still on the page but no longer work; replace them.
  document.querySelectorAll('[data-instabasket]').forEach((el) => el.remove());
  document.querySelectorAll('[data-instabasket-done]').forEach((el) => delete el.dataset.instabasketDone);

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('scroll', scheduleScan, { capture: true, passive: true });
  chrome.storage.onChanged.addListener(() => buttons.forEach(refresh));
  scan();
})();
