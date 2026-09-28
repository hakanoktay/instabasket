// Adds "Add to basket" buttons to Instagram pages:
//   - next to the date under each post (home feed, post page, post modal)
//   - on hover over post thumbnails (profile grid, explore)
//   - next to the Follow button on profile pages
//
// Instagram's markup has no stable class names and its labels are localized, so
// buttons are anchored on things that rarely change: post links, <time>
// elements and the profile <header>.
(() => {
  const SCAN_DELAY = 250;
  const buttons = new Set(); // { host, button, key, kind, idle }
  let scanTimer;

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
  `;

  const storageKey = (item) => (item.kind === 'profile' ? 'p:' + item.username : 'm:' + item.key);

  // Creates a button for `url` inside its own shadow root so Instagram's CSS
  // can't touch it. `variant` is 'inline', 'overlay' or 'header'.
  function makeButton(url, item, variant) {
    const host = document.createElement('span');
    host.dataset.instabasket = variant;
    if (variant === 'overlay') Object.assign(host.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><button class="${variant}"></button>`;
    const button = root.querySelector('button');
    if (variant === 'overlay') button.style.pointerEvents = 'auto';

    const entry = { host, button, key: storageKey(item), idle: variant === 'overlay' ? '🧺' : '🧺 Add to basket' };
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
      button.textContent = variant === 'overlay' ? '…' : 'Adding…';
      await InstaBasketDrop.run(url);
      button.classList.remove('busy');
      refresh(entry);
    });
    return host;
  }

  function setSaved(entry, saved) {
    entry.button.classList.toggle('saved', saved);
    const overlay = entry.button.classList.contains('overlay');
    entry.button.textContent = saved ? (overlay ? '✓' : '✓ In basket') : entry.idle;
    entry.button.title = saved ? 'In basket' : 'Add to basket';
  }

  async function refresh(entry) {
    if (entry.button.classList.contains('busy')) return;
    try {
      const { [entry.key]: value } = await chrome.storage.local.get(entry.key);
      setSaved(entry, !!value);
    } catch {} // extension reloaded; the page needs a reload anyway
  }

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
      link.after(makeButton(item.url, item, 'inline'));
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
      link.appendChild(makeButton(item.url, item, 'overlay'));
    }
  }

  // Profile pages: next to Follow / Message (or Edit profile on your own profile).
  function addProfileButton() {
    const item = InstaBasket.parse(location.href);
    const existing = document.querySelector('[data-instabasket="header"]');
    const wanted = item?.kind === 'profile' ? storageKey(item) : null;
    if (existing) {
      const entry = [...buttons].find((b) => b.host === existing);
      if (entry?.key === wanted && existing.isConnected) return;
      existing.remove(); // navigated to another profile or away from profiles
    }
    if (!wanted) return;

    const header = document.querySelector('main header');
    if (!header) return;
    // The first button with visible text is Follow / Following / Edit profile;
    // the profile picture's button has none.
    const actions = [...header.querySelectorAll('button, [role="button"]')]
      .find((b) => b.textContent.trim() && !b.closest('[data-instabasket]'));
    const host = makeButton(InstaBasket.profileUrl(item.username), item, 'header');
    host.style.marginLeft = '8px';
    host.style.display = 'inline-flex';
    host.style.alignSelf = 'center';
    if (actions) {
      // Insert after the button's own wrapper so it sits in the same row.
      const wrapper = actions.parentElement?.children.length === 1 ? actions.parentElement : actions;
      wrapper.after(host);
    } else {
      header.appendChild(host);
    }
  }

  function scan() {
    for (const entry of buttons) if (!entry.host.isConnected) buttons.delete(entry);
    try {
      addDateButtons();
      addOverlayButtons();
      addProfileButton();
    } catch (e) {
      console.debug('[InstaBasket]', e);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DELAY);
  }

  // Instagram is a single-page app: posts load while scrolling and navigation
  // doesn't reload the page, so rescan whenever the DOM changes.
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener(() => buttons.forEach(refresh));
  scan();
})();
