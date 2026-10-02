// Adds KeepKeep's Save buttons to Instagram pages:
//   - Profile, Media and Download icons in each post's action bar, left of the
//     save icon (home feed, post page, post modal)
//   - on hover over post thumbnails (profile grid, explore)
//   - next to the Follow button on profile pages
//   - "Profile", "Media" and "Download" icons in the right-hand action column of the Reels viewer
//   - the same three in a small bar on the story on screen (story viewer), plus D to download it
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
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 12.5-4.3"/><path d="M19 14v6M16 17h6"/></svg>',
    // Like Instagram's "Following" icon: a filled person with a check.
    profileFilled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4" fill="currentColor"/><path d="M3 21a7 7 0 0 1 12.5-4.3" fill="currentColor"/><path d="M15.5 18l2.5 2.5 4.5-5"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="13" height="13" rx="3"/><circle cx="6.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><path d="M2.5 13.5l3.5-3.5 5.5 5.5"/><path d="M19 14.5v7M15.5 18h7"/></svg>',
    mediaFilled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M5 2h7a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zM6.5 5.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM3 13.3v.2A1.5 1.5 0 0 0 4.5 15h6.3l-4.8-4.8z"/><path d="M15.5 18.5l2.5 2.5 4.5-5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v12M7 10.5l5 5 5-5"/><path d="M4 16.5v2a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-2"/></svg>',
  };


  // KeepKeep's brand purple for our own buttons, green for saved, red for
  // remove; icons in Instagram's own rows stay in Instagram's colour. A saved
  // button shows its state; hovering it turns it into "Remove" (like
  // "Following" → "Unfollow").
  const STYLE = `
    :host { all: initial; }
    button {
      /* KeepKeep brand (#8119B5, deep #450B62; #AA56D5 on dark), Instagram's success green and delete red. */
      --brand: #8119b5; --brand-tint: rgba(129, 25, 181, 0.1); --brand-tint-strong: rgba(129, 25, 181, 0.18);
      --red: #ed4956; --green: #58c322; --text: #000; --muted: #737373; --secondary: #efefef; --secondary-hover: #dbdbdb;
      position: relative; display: inline-flex; align-items: center; cursor: pointer; white-space: nowrap;
      font: 600 14px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      border: none; background: none; padding: 0; color: var(--text);
    }
    button.dark {
      --text: #f5f5f5; --muted: #a8a8a8; --secondary: #363636; --secondary-hover: #262626;
      --brand: #aa56d5; --brand-tint: rgba(170, 86, 213, 0.16); --brand-tint-strong: rgba(170, 86, 213, 0.26);
    }
    button.busy { opacity: 0.5; cursor: progress; }
    .view { display: inline-flex; align-items: center; gap: 6px; }
    .view svg { width: 16px; height: 16px; flex: none; }
    .rm, .done { display: none; }
    .saved .add { display: none; }
    .saved .done { display: inline-flex; color: var(--green); }
    .saved:hover .done { display: none; }
    .saved:hover .rm { display: inline-flex; }

    /* Next to a post's date (fallback): a text button in the brand colour. */
    .inline { margin-left: 10px; font-size: 12px; vertical-align: middle; color: var(--brand); }
    .inline .view svg { width: 14px; height: 14px; }
    .inline:hover { opacity: 0.75; }
    .inline.saved { color: var(--green); }
    .inline.saved:hover { color: var(--red); }

    /* Profile header: shaped like Instagram's "Message" button, in a light brand tint. */
    .header { height: 32px; padding: 0 16px; border-radius: 8px; background: var(--brand-tint); color: var(--brand); transition: background 0.12s; }
    .header:hover { background: var(--brand-tint-strong); }
    .header.saved { background: var(--secondary); }
    .header.saved:hover { background: var(--secondary-hover); color: var(--red); }

    /* Thumbnails: a round icon button in the corner, shown on hover. */
    .overlay {
      position: absolute; top: 8px; right: 8px; z-index: 2; width: 32px; height: 32px; justify-content: center;
      border-radius: 50%; background: linear-gradient(135deg, rgba(129, 25, 181, 0.92), rgba(69, 11, 98, 0.92)); color: #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      opacity: 0; transform: scale(0.9); transition: opacity 0.15s, transform 0.15s, background 0.15s;
    }
    .overlay .view svg { width: 18px; height: 18px; }
    :host-context(a:hover) .overlay, .overlay.saved, .overlay.busy { opacity: 1; transform: none; }
    .overlay:hover { background: linear-gradient(135deg, #8f2bc4, #55127a); }
    .overlay.saved { background: var(--green); }
    .overlay.saved .done { color: #fff; }
    .overlay.saved:hover { background: var(--red); }
    .overlay .label { display: none; }

    /* Reels viewer: icon with a caption, like Instagram's own icon column. */
    /* Reels column and post action bars: our icons in the brand colour. */
    .reel { flex-direction: column; color: var(--brand); font-weight: 400; font-size: 12px; padding: 4px; }
    .reel .view { flex-direction: column; gap: 6px; }
    .reel .view svg { width: 24px; height: 24px; }
    .reel:hover { opacity: 0.7; }
    .reel.saved:hover { color: var(--red); opacity: 1; }

    /* A post's action bar (like, comment, share … save): icons only, 24px, like Instagram's. */
    .action { color: var(--brand); padding: 8px; }
    .action .view svg { width: 24px; height: 24px; }
    .action .label { display: none; }
    .action:hover { opacity: 0.5; }
    .action.saved:hover { color: var(--red); opacity: 1; }

    /* Story viewer: small icons in a dark pill on the story. */
    .story { color: #e2bff4; padding: 6px; border-radius: 50%; }
    .story .view svg { width: 16px; height: 16px; }
    .story .label { display: none; }
    .story:hover { background: rgba(255, 255, 255, 0.16); }
    .story.saved .done { color: #7ee04a; }
    .story.saved:hover .rm { color: #ff6b76; }

  `;

  function isLightColor(color) {
    const [r, g, b] = (color.match(/\d+(\.\d+)?/g) || [0, 0, 0]).map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  }

  const storageKey = (item) => (item.kind === 'profile' ? 'p:' + item.username : 'm:' + item.key);

  // Creates a button inside its own shadow root so Instagram's CSS can't touch
  // it. `target()` returns { url, key } for what the button adds (or null if it
  // can't be determined yet); it's re-evaluated because in the Reels viewer the
  // same button can end up pointing at a different reel.
  //   opts.icon / opts.label: icon and text shown while not saved
  function makeButton(variant, target, opts = {}) {
    const host = document.createElement('span');
    host.dataset.keepkeep = variant;
    if (variant === 'overlay') Object.assign(host.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const root = host.attachShadow({ mode: 'open' });
    const label = opts.label || 'Save';
    const savedLabel = opts.savedLabel || 'Saved';
    const icon = opts.icon || 'media';
    root.innerHTML = `<style>${STYLE}</style>
      <button class="${variant}${(opts.dark ?? KeepKeepPanel.isDarkPage()) ? ' dark' : ''}">
        <span class="view add">${ICONS[icon]}<span class="label">${label}</span></span>
        <span class="view done">${ICONS[icon + 'Filled']}<span class="label">${savedLabel}</span></span>
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
      if (!t) await KeepKeepDrop.run(null); // shows "not an Instagram profile or post"
      else if (button.classList.contains('saved')) await KeepKeepDrop.remove(t.key);
      else await KeepKeepDrop.run(t.item || t.url);
      button.classList.remove('busy');
      refresh(entry);
    });
    return host;
  }

  // A plain command button with no saved state (Download), styled like the others.
  function makeCommandButton(variant, run, opts) {
    const host = document.createElement('span');
    host.dataset.keepkeep = variant;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <button class="${variant}${(opts.dark ?? KeepKeepPanel.isDarkPage()) ? ' dark' : ''}" title="${opts.title}">
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
    entry.button.title = saved ? 'Saved in KeepKeep · click to remove' : entry.title;
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
    const item = KeepKeep.parse(url.href);
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
  const actionGroups = new WeakMap(); // post date link → its button group

  function addPostButtons() {
    for (const time of document.querySelectorAll('a[href] time[datetime]')) {
      const link = time.closest('a');
      const done = link.dataset.keepkeepDone;
      // Instagram re-renders action bars (e.g. after the story viewer closes)
      // while keeping the post's date link: if our group went with the old
      // bar, place it again.
      if (done === '1' && actionGroups.get(link)?.isConnected !== false) continue;
      // Posts that aren't laid out (e.g. the feed hidden behind the story
      // viewer) can't be measured: try again once they're visible, without
      // counting it as a failed try.
      if (!link.getBoundingClientRect().width) continue;
      const item = postItem(link.getAttribute('href'));
      if (!item) {
        link.dataset.keepkeepDone = '1';
        continue;
      }
      const bar = findActionBar(link);
      if (bar) {
        link.dataset.keepkeepDone = '1';
        // A post that only got the fallback text button gets the real ones now.
        if (done === 'inline') link.parentElement?.querySelector(':scope > [data-keepkeep="inline"]')?.remove();
        const existing = bar.saveItem.querySelector(':scope > [data-keepkeep="action-group"]');
        actionGroups.set(link, existing || addActionButtons(bar, item));
        continue;
      }
      if (done === 'inline') continue;
      const tries = (actionTries.get(link) || 0) + 1;
      actionTries.set(link, tries);
      if (tries >= 6) {
        link.dataset.keepkeepDone = 'inline';
        link.after(makeButton('inline', fixed(item, item.url), { title: 'Save this post to KeepKeep' }));
      }
    }
  }

  // Walks up from the post's date link to the smallest element that holds an
  // icon row, and returns that row: { row, save, container }.
  function findActionBar(link) {
    let el = link.parentElement;
    for (let depth = 0; el && depth < 14; depth++, el = el.parentElement) {
      const icons = [...el.querySelectorAll('svg')].filter((s) => {
        if (s.closest('[data-keepkeep]')) return false;
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
      return username && { url: KeepKeep.profileUrl(username), key: 'p:' + username };
    };
    const group = document.createElement('span');
    group.dataset.keepkeep = 'action-group';
    // Attached to the save icon and positioned just left of it, outside the
    // bar's own layout: Instagram lays the bar out differently in the feed
    // (a fixed grid) and in the post view (a flexible row), and adding an
    // element to either can push the save icon onto a new line.
    if (getComputedStyle(saveItem).position === 'static') saveItem.style.position = 'relative';
    Object.assign(group.style, {
      position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    });
    const dark = isLightColor(getComputedStyle(save).color); // light icons → dark background
    group.append(
      makeButton('action', profileTarget, { icon: 'profile', label: 'Profile', title: 'Save this profile to KeepKeep', dark }),
      makeButton('action', mediaTarget, { icon: 'media', label: 'Media', title: 'Save this post to KeepKeep', dark }),
      makeCommandButton('action', () => KeepKeepDrop.download(item.code), {
        icon: 'download', label: 'Download', title: 'Download all photos and videos of this post (best quality)', dark,
      }),
    );
    saveItem.appendChild(group);
    return group;
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
        if (a.closest('[data-keepkeep]')) continue;
        const r = a.getBoundingClientRect();
        if (!r.width || r.top >= barTop) continue;
        const p = KeepKeep.parse(new URL(a.getAttribute('href'), location.href).href);
        if (p?.kind === 'profile') return p.username;
      }
    }
    if (!allowFetch) return null;
    owners.set(item.code, (await InstaApi.media(item.code).catch(() => ({}))).username || null);
    return owners.get(item.code);
  }

  // Thumbnails on profile grids and explore: links to posts that wrap a cover.
  function addOverlayButtons() {
    for (const link of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
      if (link.dataset.keepkeepDone) continue;
      // A tile shows a picture, an autoplaying video (Explore) or a background
      // image (a profile's Reels tab). Feed posts carry a <time> and get the
      // action-bar buttons instead.
      if (!link.querySelector('img, video, [style*="background-image"]') || link.querySelector('time')) continue;
      const rect = link.getBoundingClientRect();
      if (rect.width && rect.width < 100) continue;
      link.dataset.keepkeepDone = '1';
      const item = postItem(link.getAttribute('href'));
      if (!item) continue;
      if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
      link.appendChild(makeButton('overlay', fixed(item, item.url), { title: 'Save this post to KeepKeep' }));
    }
  }

  // Profile pages: next to Follow / Message (or Edit profile on your own profile).
  function addProfileButton() {
    const item = KeepKeep.parse(location.href);
    const wanted = item?.kind === 'profile' ? storageKey(item) : null;
    const existing = document.querySelector('[data-keepkeep="header"]');
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
      .find((b) => b.textContent.trim() && !b.closest('[data-keepkeep]'));
    const host = makeButton('header', fixed(item, KeepKeep.profileUrl(item.username)), {
      icon: 'profile', label: 'Save profile', title: 'Save this profile to KeepKeep',
    });
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
      if (s.closest('[data-keepkeep]')) return false;
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
      const item = KeepKeep.parse(location.href);
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
      if (a.closest('[data-keepkeep]')) continue;
      const r = a.getBoundingClientRect();
      if (!r.width || r.bottom < v.top || r.top > v.bottom || r.right < v.left - 600 || r.left > v.right) continue;
      const item = KeepKeep.parse(new URL(a.getAttribute('href'), location.href).href);
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
      if (column.querySelector(':scope > [data-keepkeep="reel"]')) continue;

      const memory = { media: null };
      const mediaTarget = async () => {
        const media = reelMedia(column, memory);
        return media && { url: media.url, key: storageKey(media) };
      };
      const profileTarget = async (allowFetch) => {
        const username = await reelOwner(column, reelMedia(column, memory), allowFetch);
        return username && { url: KeepKeep.profileUrl(username), key: 'p:' + username };
      };

      // Instagram's own icons are white on a dark background: use the brand's light tone there.
      const dark = isLightColor(getComputedStyle(found.first.querySelector('svg') || found.first).color);
      for (const [icon, label, target] of [['profile', 'Profile', profileTarget], ['media', 'Media', mediaTarget]]) {
        const title = icon === 'profile' ? 'Save this profile to KeepKeep' : 'Save this reel to KeepKeep';
        const host = makeButton('reel', target, { icon, label, savedLabel: label, title, dark });
        Object.assign(host.style, { display: 'flex', justifyContent: 'center', padding: '6px 0' });
        column.insertBefore(host, found.first);
      }
      const downloadButton = makeCommandButton('reel', async () => {
        const media = reelMedia(column, memory);
        if (media?.code) await KeepKeepDrop.download(media.code);
        else KeepKeepPanel.showError("Couldn't tell which reel this is");
      }, { icon: 'download', label: 'Download', title: 'Download this reel (best quality)', dark });
      Object.assign(downloadButton.style, { display: 'flex', justifyContent: 'center', padding: '6px 0' });
      column.insertBefore(downloadButton, found.first);
    }
  }

  // ---- Story viewer (/stories/<username>/<id>/) ----
  //
  // Profile, Media and Download for the story on screen: a small vertical pill
  // on the story's right edge, centred, shown while the pointer is over the
  // story. The story is found by its shape (a tall card in the middle of the
  // window). The story item comes from the address bar, or – when Instagram
  // hasn't put its id there yet (the first story opened) – from the picture on
  // screen, whose CDN address carries the id in ig_cache_key. Highlights
  // (/stories/highlights/<id>/) name neither the owner nor the item: the item
  // comes from the picture, the owner from the story's header link (or, until
  // that's on screen, from Instagram's highlight data, asked once).

  let storyBar = null;
  let storyCardRect = null;
  let storyCardSeen = 0;
  let pointer = { x: -1, y: -1 };
  addEventListener('mousemove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });

  // The id of the story on screen, read from its picture's CDN address.
  function storyIdOnScreen() {
    const card = storyCardRect;
    if (!card) return null;
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll('img[src*="ig_cache_key"], video[poster*="ig_cache_key"]')) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < bestArea || r.right < card.left || r.left > card.right || r.bottom < card.top || r.top > card.bottom) continue;
      best = el;
      bestArea = area;
    }
    const src = best && (best.getAttribute('src') || best.getAttribute('poster'));
    const keyParam = src && new URL(src, location.href).searchParams.get('ig_cache_key');
    if (!keyParam) return null;
    try {
      const id = atob(keyParam.split('.')[0]);
      return /^\d+$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  // Instagram's data for a highlight, asked once per highlight: its owner and
  // the ids of its stories in the viewer's order. null while asking or if it
  // couldn't be read.
  const highlights = new Map(); // highlight id → { username, pks } | null
  function highlightData(id) {
    if (!highlights.has(id)) {
      highlights.set(id, null);
      InstaApi.highlight(id).then((h) => highlights.set(id, { username: h.username, pks: h.pks }), () => {});
    }
    return highlights.get(id);
  }

  // The owner of the highlight on screen: the header's profile link (picture
  // and title link to /<username>/), else Instagram's highlight data.
  function highlightOwner(id) {
    const card = storyCardRect;
    if (card) {
      for (const a of document.querySelectorAll('a[href]')) {
        const m = a.getAttribute('href').match(/^\/([A-Za-z0-9._]{1,30})\/$/);
        if (!m) continue;
        const r = a.getBoundingClientRect();
        if (!r.width || r.left < card.left || r.right > card.right || r.top < card.top || r.bottom > card.top + card.height * 0.2) continue;
        return m[1].toLowerCase();
      }
    }
    return highlightData(id)?.username || null;
  }

  // Which story of the highlight is on screen, from the progress bar at the
  // top of the story: one thin segment per story, and only the one playing
  // holds a fill. Videos play from blob: addresses with no id in them, so this
  // is how a video story is found. Returns { index, count } or null.
  function progressPosition() {
    const card = storyCardRect;
    if (!card) return null;
    const rows = new Map();
    for (const d of document.querySelectorAll('div')) {
      const r = d.getBoundingClientRect();
      if (!r.height || r.height > 4 || r.width < 1 || r.top < card.top || r.top > card.top + 60 || r.left < card.left - 1 || r.right > card.right + 1) continue;
      const k = Math.round(r.top);
      rows.set(k, [...(rows.get(k) || []), d]);
    }
    const row = [...rows.values()].sort((a, b) => b.length - a.length)[0];
    if (!row || row.length < 2) return null;
    const set = new Set(row);
    const width = (d) => d.getBoundingClientRect().width;
    const box = row.reduce((w, d) => (width(d) > width(w) ? d : w));
    const fills = row.filter((d) => d !== box && set.has(d.parentElement) && d.parentElement !== box);
    const segments = row.filter((d) => d !== box && !fills.includes(d));
    const index = segments.findIndex((s) => fills.some((f) => s.contains(f)));
    return index < 0 ? null : { index, count: segments.length };
  }

  // The story of a highlight on screen: its picture's id, or (a video) the
  // progress bar's position in Instagram's list – only if the counts agree.
  function highlightStoryId(id) {
    const fromPicture = storyIdOnScreen();
    if (fromPicture) return fromPicture;
    const pks = highlightData(id)?.pks;
    const pos = pks && progressPosition();
    return pos && pos.count === pks.length ? pks[pos.index] : null;
  }

  const currentStory = () => {
    const hl = location.pathname.match(/^\/stories\/highlights\/(\d+)\/?$/);
    if (hl) {
      const username = highlightOwner(hl[1]);
      if (!username) return null;
      const id = highlightStoryId(hl[1]);
      const url = `https://www.instagram.com/stories/highlights/${hl[1]}/`;
      return id
        ? { kind: 'media', key: 'story:' + id, code: null, type: 'highlight', highlightId: hl[1], username, url }
        : { kind: 'media', key: null, highlightId: hl[1], username, url };
    }
    const item = KeepKeep.parse(location.href);
    if (item?.key?.startsWith('story:')) return item;
    const m = location.pathname.match(/^\/stories\/([A-Za-z0-9._]{1,30})\/?$/);
    if (!m || m[1] === 'highlights') return null;
    const username = m[1].toLowerCase();
    const id = storyIdOnScreen();
    return id
      ? { kind: 'media', key: 'story:' + id, code: null, type: 'story', username, url: `https://www.instagram.com/stories/${username}/${id}/` }
      : { kind: 'media', key: null, username };
  };

  function storyCard() {
    let best = null;
    let bestArea = 0;
    for (const e of document.querySelectorAll('body div, body section')) {
      const r = e.getBoundingClientRect();
      if (r.height < innerHeight * 0.55 || r.width < 200) continue;
      const ratio = r.width / r.height;
      if (ratio < 0.4 || ratio > 0.75 || Math.abs(r.left + r.width / 2 - innerWidth / 2) > 120) continue;
      if (r.width * r.height > bestArea) {
        best = r;
        bestArea = r.width * r.height;
      }
    }
    return best;
  }

  function placeStoryBar() {
    if (!storyBar) return;
    const card = storyCard();
    // While stories change the card can vanish for a moment: keep the last
    // position instead of hiding (no flicker).
    if (card) {
      storyCardRect = card;
      storyCardSeen = Date.now();
    } else if (Date.now() - storyCardSeen > 1500) {
      storyCardRect = null;
    }
    const r = storyCardRect;
    const story = r && currentStory();
    if (!r || !story?.username) {
      storyBar.style.opacity = '0';
      storyBar.style.pointerEvents = 'none';
      return;
    }
    const h = storyBar.offsetHeight;
    storyBar.style.top = `${Math.round(r.top + r.height / 2 - h / 2)}px`;
    storyBar.style.left = `${Math.round(r.right - 12 - storyBar.offsetWidth)}px`;
    const over = (x, y, b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    const show = over(pointer.x, pointer.y, r) || over(pointer.x, pointer.y, storyBar.getBoundingClientRect());
    storyBar.style.opacity = show ? '1' : '0';
    storyBar.style.pointerEvents = show ? 'auto' : 'none';
  }

  function addStoryButtons() {
    if (!location.pathname.startsWith('/stories/')) {
      storyBar?.remove();
      storyBar = null;
      return;
    }
    if (!storyBar?.isConnected) {
      storyBar = document.createElement('div');
      storyBar.dataset.keepkeep = 'story-bar';
      Object.assign(storyBar.style, {
        // Above everything (KeepKeep's own layers included) and on a solid
        // enough backing to stay readable over any story or text, at any zoom.
        position: 'fixed', zIndex: '2147483647', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px',
        borderRadius: '999px', background: 'rgba(16, 4, 24, 0.85)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.14)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.18s',
        top: '-200px', left: '-200px',
      });
      const profileTarget = async () => {
        const s = currentStory();
        return s?.username && { url: KeepKeep.profileUrl(s.username), key: 'p:' + s.username };
      };
      const mediaTarget = async () => {
        const s = currentStory();
        return s?.key && { url: s.url, key: storageKey(s), item: s };
      };
      storyBar.append(
        makeButton('story', profileTarget, { icon: 'profile', label: 'Profile', title: 'Save this profile to KeepKeep', dark: true }),
        makeButton('story', mediaTarget, { icon: 'media', label: 'Media', title: 'Add this story to Media', dark: true }),
        makeCommandButton('story', downloadCurrentStory, { icon: 'download', label: 'Download', title: 'Download all of these stories (D)', dark: true }),
      );
      document.body.appendChild(storyBar);
    }
    placeStoryBar();
  }

  async function downloadCurrentStory() {
    const s = currentStory();
    if (s?.highlightId) await KeepKeepDrop.downloadHighlight(s.highlightId);
    else if (s?.key) await KeepKeepDrop.downloadStory(s.key.slice(6));
    else KeepKeepPanel.showError("Couldn't tell which story this is");
  }

  // D downloads the story on screen (not while typing a reply).
  addEventListener('keydown', (e) => {
    if (e.key !== 'd' && e.key !== 'D') return;
    if (e.metaKey || e.ctrlKey || e.altKey || !location.pathname.startsWith('/stories/')) return;
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    const s = currentStory();
    if (!s?.key && !s?.highlightId) return;
    e.preventDefault();
    e.stopPropagation();
    downloadCurrentStory();
  }, true);
  // The story card moves and resizes as stories change; keep the bar on it.
  // Moving to the next story changes only the address (or the picture), so
  // check here too and refresh the saved states when the story changes.
  let lastStoryKey = null;
  setInterval(() => {
    if (!storyBar) return;
    placeStoryBar();
    const key = currentStory()?.key || null;
    if (key !== lastStoryKey) {
      lastStoryKey = key;
      buttons.forEach(refresh);
    }
    if (location.href !== lastHref) scheduleScan();
  }, 200);

  function scan() {
    for (const entry of buttons) if (!entry.host.isConnected) buttons.delete(entry);
    try {
      addPostButtons();
      addOverlayButtons();
      addProfileButton();
      addReelButtons();
      addStoryButtons();
    } catch (e) {
      console.debug('[KeepKeep]', e);
    }
    // Scrolling through reels changes the URL without reloading; reel buttons
    // may now point at a different reel.
    if (location.href !== lastHref) {
      lastHref = location.href;
      buttons.forEach(refresh);
    }
  }

  // Throttled, not debounced: a scan runs at most SCAN_DELAY after the first
  // change. Instagram can keep the page busy non-stop (a playing video, a
  // scrolling song title), and a debounce then never let a scan run – posts
  // arriving meanwhile got no buttons.
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, SCAN_DELAY);
  }

  // Instagram is a single-page app: posts load while scrolling and navigation
  // doesn't reload the page, so rescan whenever the DOM changes or the page scrolls.
  // After the extension is reloaded or updated, buttons from the previous copy
  // are still on the page but no longer work; replace them.
  document.querySelectorAll('[data-keepkeep]').forEach((el) => el.remove());
  document.querySelectorAll('[data-keepkeep-done]').forEach((el) => delete el.dataset.keepkeepDone);

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('scroll', scheduleScan, { capture: true, passive: true });
  // Some changes don't touch the DOM at all – closing the story viewer only
  // makes the feed behind it visible again – so also look every second.
  setInterval(() => document.visibilityState === 'visible' && scheduleScan(), 1000);
  chrome.storage.onChanged.addListener(() => buttons.forEach(refresh));
  scan();
})();
