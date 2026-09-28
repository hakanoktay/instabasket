// Adds "Add to basket" buttons to Instagram pages:
//   - Profile, Media and Download icons in each post's action bar, left of the
//     save icon (home feed, post page, post modal)
//   - on hover over post thumbnails (profile grid, explore)
//   - next to the Follow button on profile pages
//   - "Profile", "Media" and "Download" icons in the right-hand action column of the Reels viewer
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

  // Outline icons for "not saved", filled ones for "saved" – the same
  // convention as Instagram's bookmark (outline → filled when saved).
  const ICONS = {
    basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1.6 9.1a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M2.5 10h19M8 10l3-6M16 10l-3-6"/></svg>',
    basketFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1.6 9.1a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M2.5 10h19M8 10l3-6M16 10l-3-6" fill="none"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 12.5-4.3"/><path d="M19 14v6M16 17h6"/></svg>',
    // Like Instagram's "Following" icon: a filled person with a check.
    profileFilled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4" fill="currentColor"/><path d="M3 21a7 7 0 0 1 12.5-4.3" fill="currentColor"/><path d="M15.5 18l2.5 2.5 4.5-5"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="13" height="13" rx="3"/><circle cx="6.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><path d="M2.5 13.5l3.5-3.5 5.5 5.5"/><path d="M19 14.5v7M15.5 18h7"/></svg>',
    mediaFilled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M5 2h7a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zM6.5 5.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM3 13.3v.2A1.5 1.5 0 0 0 4.5 15h6.3l-4.8-4.8z"/><path d="M15.5 18.5l2.5 2.5 4.5-5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v12M7 10.5l5 5 5-5"/><path d="M4 16.5v2a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-2"/></svg>',
  };


  // Instagram's colours: blue for actions, red for destructive ones, grey
  // secondary buttons. A saved button shows its state; hovering it turns it
  // into "Remove" (like "Following" → "Unfollow").
  const STYLE = `
    :host { all: initial; }
    button {
      --blue: #0095f6; --red: #ed4956; --green: #58c322; /* Instagram's success green */ --text: #000; --muted: #737373; --secondary: #efefef; --secondary-hover: #dbdbdb;
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
    .saved .done { display: inline-flex; color: var(--green); }
    .saved:hover .done { display: none; }
    .saved:hover .rm { display: inline-flex; }

    /* Next to a post's date: a text button, like Instagram's blue "Follow" links. */
    .inline { margin-left: 10px; font-size: 12px; vertical-align: middle; color: var(--blue); }
    .inline .view svg { width: 14px; height: 14px; }
    .inline:hover { color: var(--text); }
    .inline.saved { color: var(--green); }
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
    .overlay.saved { background: var(--green); }
    .overlay.saved .done { color: #fff; }
    .overlay.saved:hover { background: var(--red); }
    .overlay .label { display: none; }

    /* Reels viewer: icon with a caption, like Instagram's own icon column. */
    .reel { flex-direction: column; color: inherit; font-weight: 400; font-size: 12px; padding: 4px; }
    .reel .view { flex-direction: column; gap: 6px; }
    .reel .view svg { width: 24px; height: 24px; }
    .reel:hover { opacity: 0.7; }
    .reel.saved:hover { color: var(--red); opacity: 1; }

    /* A post's action bar (like, comment, share … save): icons only, 24px, like Instagram's. */
    .action { color: inherit; padding: 8px; }
    .action .view svg { width: 24px; height: 24px; }
    .action .label { display: none; }
    .action:hover { opacity: 0.5; }
    .action.saved:hover { color: var(--red); opacity: 1; }
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
      <button class="${variant}${InstaBasketPanel.isDarkPage() && variant !== 'reel' && variant !== 'action' ? ' dark' : ''}">
        <span class="view add">${ICONS[opts.icon || 'basket']}<span class="label">${label}</span></span>
        <span class="view done">${ICONS[(opts.icon || 'basket') + 'Filled']}<span class="label">${savedLabel}</span></span>
        <span class="view rm">${ICONS.trash}<span class="label">Remove</span></span>
      </button>`;
    const button = root.querySelector('button');
    if (variant === 'overlay') button.style.pointerEvents = 'auto';

    const entry = { host, button, target, title: opts.title || label };
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

  // A plain command button with no saved state (Download), styled like the others.
  function makeCommandButton(variant, run, opts) {
    const host = document.createElement('span');
    host.dataset.instabasket = variant;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <button class="${variant}" title="${opts.title}">
        <span class="view add">${ICONS[opts.icon]}<span class="label">${opts.label}</span></span>
      </button>`;
    const button = root.querySelector('button');
    for (const type of ['mousedown', 'pointerdown', 'touchstart']) button.addEventListener(type, (e) => e.stopPropagation());
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (button.classList.contains('busy')) return;
      button.classList.add('busy');
      try {
        await run();
      } finally {
        button.classList.remove('busy');
      }
    });
    return host;
  }

  function setSaved(entry, saved) {
    entry.button.classList.toggle('saved', saved);
    entry.button.title = saved ? 'In basket · click to remove' : entry.title;
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

  // Posts in the feed, on the post page and in the post modal. Every post has a
  // date that links to the post, which tells us which post it is. The Profile
  // and Media icons go into the post's action bar, just left of the save
  // (bookmark) icon. The action bar has no language-independent markers, so it's
  // found by position: the row of 24px icons in the post, save being the
  // rightmost. If it can't be found after a few tries, a text button is put
  // next to the date instead.
  const actionTries = new WeakMap();

  function addPostButtons() {
    for (const time of document.querySelectorAll('a[href] time[datetime]')) {
      const link = time.closest('a');
      if (link.dataset.instabasketDone) continue;
      const item = postItem(link.getAttribute('href'));
      if (!item) {
        link.dataset.instabasketDone = '1';
        continue;
      }
      const bar = findActionBar(link);
      if (bar) {
        link.dataset.instabasketDone = '1';
        if (!bar.saveItem.querySelector(':scope > [data-instabasket="action-group"]')) addActionButtons(bar, item);
        continue;
      }
      const tries = (actionTries.get(link) || 0) + 1;
      actionTries.set(link, tries);
      if (tries >= 6) {
        link.dataset.instabasketDone = '1';
        link.after(makeButton('inline', fixed(item, item.url)));
      }
    }
  }

  // Walks up from the post's date link to the smallest element that holds an
  // icon row, and returns that row: { row, save, container }.
  function findActionBar(link) {
    let el = link.parentElement;
    for (let depth = 0; el && depth < 14; depth++, el = el.parentElement) {
      const icons = [...el.querySelectorAll('svg')].filter((s) => {
        if (s.closest('[data-instabasket]')) return false;
        const r = s.getBoundingClientRect();
        return r.width >= 18 && r.width <= 32 && r.height >= 18 && r.height <= 32;
      });
      if (icons.length < 4) continue;
      // Group icons into rows by their vertical centre.
      const rows = [];
      for (const s of icons) {
        const r = s.getBoundingClientRect();
        const y = r.top + r.height / 2;
        let row = rows.find((g) => Math.abs(g.y - y) < 5);
        if (!row) rows.push((row = { y, icons: [] }));
        row.icons.push(s);
      }
      const rects = (g) => g.icons.map((s) => s.getBoundingClientRect());
      const best = rows
        .filter((g) => g.icons.length >= 4)
        .map((g) => ({ ...g, span: Math.max(...rects(g).map((r) => r.right)) - Math.min(...rects(g).map((r) => r.left)) }))
        .filter((g) => g.span >= 150)
        .sort((a, b) => b.icons.length - a.icons.length)[0];
      if (!best) continue;
      // The save icon is the rightmost one; the row is the element holding all of them.
      const save = best.icons.reduce((a, b) => (b.getBoundingClientRect().left > a.getBoundingClientRect().left ? b : a));
      let row = save.parentElement;
      while (row && !best.icons.every((s) => row.contains(s))) row = row.parentElement;
      if (!row) return null;
      let saveItem = save;
      while (saveItem.parentElement !== row) saveItem = saveItem.parentElement;
      return { row, saveItem, save, container: el };
    }
    return null;
  }

  function addActionButtons(bar, item) {
    const { row, saveItem, save, container } = bar;
    const mediaTarget = fixed(item, item.url);
    const profileTarget = async (allowFetch) => {
      const username = await postOwner(container, row, item, allowFetch);
      return username && { url: InstaBasket.profileUrl(username), key: 'p:' + username };
    };
    const group = document.createElement('span');
    group.dataset.instabasket = 'action-group';
    // Attached to the save icon and positioned just left of it, outside the
    // bar's own layout: Instagram lays the bar out differently in the feed
    // (a fixed grid) and in the post view (a flexible row), and adding an
    // element to either can push the save icon onto a new line.
    if (getComputedStyle(saveItem).position === 'static') saveItem.style.position = 'relative';
    Object.assign(group.style, {
      position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
      display: 'inline-flex', alignItems: 'center', color: getComputedStyle(save).color, whiteSpace: 'nowrap',
    });
    group.append(
      makeButton('action', profileTarget, { icon: 'profile', label: 'Profile', title: 'Add this profile to basket' }),
      makeButton('action', mediaTarget, { icon: 'media', label: 'Media', title: 'Add this post to basket' }),
      makeCommandButton('action', () => InstaBasketDrop.download(item.code), {
        icon: 'download', label: 'Download', title: 'Download all photos and videos of this post (best quality)',
      }),
    );
    saveItem.appendChild(group);
  }

  // The post's owner: the first profile link in the post above its action bar
  // (the header, or the caption), else looked up from the post.
  async function postOwner(container, row, item, allowFetch) {
    if (item.username) return item.username;
    if (owners.has(item.code)) return owners.get(item.code);
    const barTop = row.getBoundingClientRect().top;
    // Widen the search step by step, but stop before it reaches another post.
    for (let el = container; el && el !== document.body; el = el.parentElement) {
      const otherPost = [...el.querySelectorAll('a[href] time[datetime]')].some((t) => {
        const other = postItem(t.closest('a').getAttribute('href')); // null for comment timestamps
        return other && other.code !== item.code;
      });
      if (otherPost) break;
      for (const a of el.querySelectorAll('a[href]')) {
        if (a.closest('[data-instabasket]')) continue;
        const r = a.getBoundingClientRect();
        if (!r.width || r.top >= barTop) continue;
        const p = InstaBasket.parse(new URL(a.getAttribute('href'), location.href).href);
        if (p?.kind === 'profile') return p.username;
      }
    }
    if (!allowFetch) return null;
    owners.set(item.code, (await InstaApi.media(item.code).catch(() => ({}))).username || null);
    return owners.get(item.code);
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
        const title = icon === 'profile' ? 'Add this profile to basket' : 'Add this reel to basket';
        const host = makeButton('reel', target, { icon, label, savedLabel: label, title });
        Object.assign(host.style, { display: 'flex', justifyContent: 'center', padding: '6px 0', color });
        column.insertBefore(host, found.first);
      }
      const downloadButton = makeCommandButton('reel', async () => {
        const media = reelMedia(column, memory);
        if (media?.code) await InstaBasketDrop.download(media.code);
        else InstaBasketPanel.showError("Couldn't tell which reel this is");
      }, { icon: 'download', label: 'Download', title: 'Download this reel (best quality)' });
      Object.assign(downloadButton.style, { display: 'flex', justifyContent: 'center', padding: '6px 0', color });
      column.insertBefore(downloadButton, found.first);
    }
  }

  function scan() {
    for (const entry of buttons) if (!entry.host.isConnected) buttons.delete(entry);
    try {
      addPostButtons();
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
