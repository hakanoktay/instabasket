// When a drag carrying a URL enters an Instagram page (from the address bar or
// from a link/post on the page), shows a drop zone in the corner and adds the
// dropped profile or post to the basket. `run` is shared with buttons.js.
var InstaBasketDrop = (() => {
  const HIDE_DELAY = 400;
  const RETRY_AFTER = 6 * 60 * 60 * 1000; // retry missing details at most every 6 hours
  let host, zone, label, listsEl, hideTimer, resetTimer, busy = false;

  // ---- Adding to the basket ----

  // Fetches an account's name and picture into the u: cache. Used for saved
  // profiles and for the owners of saved media alike.
  async function enrichUser(username) {
    let info = {};
    try {
      info = await InstaApi.profile(username);
    } catch {}
    const pic = await InstaApi.thumbnail(info.picUrl, 96);
    const update = { username, triedAt: Date.now() };
    if (info.fullName) update.fullName = info.fullName;
    if (pic) update.pic = pic;
    return InstaBasket.saveUser(update);
  }

  async function ensureUser(username) {
    if (!(await InstaBasket.getUser(username))?.pic) await enrichUser(username);
  }

  async function enrichMedia(item) {
    let info = {};
    if (item.code) {
      try {
        info = await InstaApi.media(item.code);
      } catch {}
    }
    const thumb = await InstaApi.thumbnail(info.thumbUrl, 240);
    const update = { key: item.key, triedAt: Date.now() };
    const username = item.username || info.username;
    if (username) update.username = username;
    if (info.type) update.type = info.type;
    if (thumb) update.thumb = thumb;
    return InstaBasket.saveMedia(update);
  }

  // Adds a profile or a media item. Adding media never adds its owner as a
  // profile. `recordKey` in the result is used to offer the list picker.
  async function add(raw) {
    const item = InstaBasket.parse(raw);
    if (!item) return { state: 'bad', text: 'Not an Instagram profile or post' };

    if (item.kind === 'profile') {
      const recordKey = 'p:' + item.username;
      if (await InstaBasket.getProfile(item.username)) {
        return { state: 'dup', text: `@${item.username} is already in profiles`, recordKey };
      }
      await InstaBasket.saveProfile({ username: item.username, addedAt: Date.now(), lists: [] });
      await ensureUser(item.username);
      return { state: 'done', text: `@${item.username} added ✓`, recordKey };
    }

    const recordKey = 'm:' + item.key;
    if (await InstaBasket.getMedia(item.key)) return { state: 'dup', text: 'Already in media', recordKey };
    await InstaBasket.saveMedia({ ...item, addedAt: Date.now(), lists: [] });
    const saved = await enrichMedia(item);
    if (saved.username) await ensureUser(saved.username);
    return {
      state: 'done',
      text: saved.username ? `Media from @${saved.username} added ✓` : 'Media added ✓ (owner not found)',
      recordKey,
    };
  }

  // Fills in details that couldn't be fetched when something was added
  // (network errors etc.) in the background while Instagram is open.
  async function fillMissing() {
    const { profiles, media, users } = await InstaBasket.load();
    const stale = (x) => !x?.triedAt || Date.now() - x.triedAt > RETRY_AFTER;
    const usernames = new Set([...profiles.map((p) => p.username), ...media.map((m) => m.username).filter(Boolean)]);
    const jobs = [
      ...media.filter((m) => (!m.username || (m.code && !m.thumb)) && stale(m)).map((m) => async () => {
        const saved = await enrichMedia(m);
        if (saved.username) await ensureUser(saved.username);
      }),
      ...[...usernames].filter((u) => !users[u]?.pic && stale(users[u])).map((u) => () => enrichUser(u)),
    ];
    for (const job of jobs.slice(0, 10)) {
      await job().catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ---- Drop zone ----

  function hasUrl(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('text/uri-list');
  }

  function build() {
    host = document.createElement('div');
    host.id = 'instabasket-host';
    // Shadow DOM keeps Instagram's CSS away from the drop zone.
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .zone {
          position: fixed; top: 20px; right: 20px; z-index: 2147483647;
          width: 250px; min-height: 140px; padding: 12px; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          text-align: center; background: rgba(255, 255, 255, 0.97); color: #262626;
          border: 3px dashed #c13584; border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          font: 600 15px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: transform 0.12s, background 0.12s;
        }
        .zone.over { transform: scale(1.05); background: #fdf2f8; border-style: solid; }
        .zone.busy { border-style: solid; }
        .zone.done { border-color: #16a34a; border-style: solid; }
        .zone.dup { border-color: #d97706; border-style: solid; }
        .zone.bad { border-color: #dc2626; border-style: solid; }
        .icon { font-size: 34px; }
        .lists { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 4px; }
        .lists:empty { display: none; }
        .lists .hint { width: 100%; font-weight: 400; font-size: 12px; color: #737373; }
        .lists button {
          font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer;
          border: 1px solid #dbdbdb; background: #fff; color: #262626; border-radius: 12px; padding: 5px 9px;
        }
        .lists button.on { background: #c13584; border-color: #c13584; color: #fff; }
      </style>
      <div class="zone"><div class="icon">🧺</div><div class="label"></div><div class="lists"></div></div>`;
    zone = root.querySelector('.zone');
    label = root.querySelector('.label');
    listsEl = root.querySelector('.lists');

    // Keep the notice open while the pointer is on it (e.g. picking lists).
    zone.addEventListener('mouseenter', () => clearTimeout(resetTimer));
    zone.addEventListener('mouseleave', () => {
      if (listsEl.childElementCount) resetTimer = setTimeout(hide, 1500);
    });

    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      zone.classList.add('over');
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dt = e.dataTransfer;
      run(dt.getData('text/uri-list') || dt.getData('text/plain'));
    });
  }

  function mount() {
    clearTimeout(resetTimer);
    if (!host) build();
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function show() {
    if (busy) return;
    mount();
    zone.className = 'zone' + (zone.classList.contains('over') ? ' over' : '');
    label.textContent = 'Drop into basket';
    listsEl.replaceChildren();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  function hide() {
    clearTimeout(hideTimer);
    host?.remove();
  }

  function flash(state, text, ms) {
    mount();
    clearTimeout(hideTimer);
    zone.className = 'zone ' + state;
    label.textContent = text;
    listsEl.replaceChildren();
    if (ms) resetTimer = setTimeout(hide, ms);
  }

  // After adding, offers the user's lists as toggles so the item can be filed right away.
  async function offerLists(recordKey) {
    const [lists, record] = await Promise.all([
      InstaBasket.getLists(),
      recordKey.startsWith('p:') ? InstaBasket.getProfile(recordKey.slice(2)) : InstaBasket.getMedia(recordKey.slice(2)),
    ]);
    if (!lists.length || !record) return;
    const inLists = new Set(record.lists || []);
    listsEl.replaceChildren(
      Object.assign(document.createElement('div'), { className: 'hint', textContent: 'Add to list:' }),
      ...lists.map((list) => {
        const b = document.createElement('button');
        b.textContent = list.name;
        b.classList.toggle('on', inLists.has(list.id));
        b.addEventListener('click', async () => {
          const on = !b.classList.contains('on');
          b.classList.toggle('on', on);
          await InstaBasket.setInList(recordKey, list.id, on);
        });
        return b;
      }),
    );
    clearTimeout(resetTimer);
    resetTimer = setTimeout(hide, 4500);
  }

  async function run(raw) {
    busy = true;
    flash('busy', 'Adding…');
    let result;
    try {
      result = await add(raw);
    } catch {
      // chrome.storage becomes unavailable if the extension was reloaded but the page wasn't.
      result = { state: 'bad', text: 'Reload the page and try again' };
    }
    busy = false;
    flash(result.state, result.text, 1600);
    if (result.recordKey) await offerLists(result.recordKey).catch(() => {});
    return result;
  }

  // dragover keeps firing while a drag is over the page; once it stops (dropped,
  // cancelled, left the window) the zone hides itself.
  for (const type of ['dragenter', 'dragover']) {
    window.addEventListener(type, (e) => { if (hasUrl(e)) show(); }, true);
  }

  // The popup's "Add this page" button.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'add') return;
    run(location.href).then(sendResponse);
    return true;
  });

  setTimeout(() => fillMissing().catch(() => {}), 3000);

  return { run };
})();
