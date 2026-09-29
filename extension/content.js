// Adds and removes profiles and media. When a drag carrying a URL enters an
// Instagram page (from the address bar or a link on the page), shows the drop
// card in the corner (panel.js). `run` and `remove` are shared with buttons.js.
var KeepKeepDrop = (() => {
  const DRAG_END_DELAY = 400;
  const RETRY_AFTER = 6 * 60 * 60 * 1000; // retry missing details at most every 6 hours

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
    return KeepKeep.saveUser(update);
  }

  async function ensureUser(username) {
    if (!(await KeepKeep.getUser(username))?.pic) await enrichUser(username);
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
    return KeepKeep.saveMedia(update);
  }

  // Adds a profile or a media item. Adding media never adds its owner as a
  // profile. `recordKey` in the result is used to offer the list picker.
  async function add(raw) {
    const item = KeepKeep.parse(raw);
    if (!item) return { state: 'bad', text: 'Not an Instagram profile or post' };

    if (item.kind === 'profile') {
      const recordKey = 'p:' + item.username;
      if (await KeepKeep.getProfile(item.username)) {
        return { state: 'dup', text: `@${item.username} is already in profiles`, recordKey };
      }
      await KeepKeep.saveProfile({ username: item.username, addedAt: Date.now(), lists: [] });
      await ensureUser(item.username);
      return { state: 'done', text: `@${item.username} added ✓`, recordKey };
    }

    const recordKey = 'm:' + item.key;
    if (await KeepKeep.getMedia(item.key)) return { state: 'dup', text: 'Already in media', recordKey };
    await KeepKeep.saveMedia({ ...item, addedAt: Date.now(), lists: [] });
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
    const { profiles, media, users } = await KeepKeep.load();
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

  // ---- Adding and removing, with feedback in the corner card ----

  async function run(raw) {
    KeepKeepPanel.showBusy();
    let result;
    try {
      result = await add(raw);
    } catch {
      // chrome.storage becomes unavailable if the extension was reloaded but the page wasn't.
      result = { state: 'bad', text: 'Reload the page and try again' };
    }
    if (result.recordKey) await KeepKeepPanel.showResult(result, () => remove(result.recordKey));
    else KeepKeepPanel.showError(result.text);
    return result;
  }

  // Removes a saved profile or media item and offers to undo it.
  async function remove(recordKey) {
    const record = await KeepKeep.remove(recordKey);
    if (!record) return;
    const isProfile = recordKey.startsWith('p:');
    const user = record.username && (await KeepKeep.getUser(record.username));
    KeepKeepPanel.showRemoved(
      record.username ? '@' + record.username : 'Media',
      isProfile ? user?.pic : record.thumb,
      isProfile,
      async () => {
        await KeepKeep.restore(recordKey, record);
        await KeepKeepPanel.showResult({ state: 'dup', recordKey }, () => remove(recordKey));
      },
    );
  }

  // Show the drop card while a drag carrying a URL is over the page. dragover
  // keeps firing during the drag; once it stops (dropped, cancelled, left the
  // window) the card hides itself.
  let dragTimer;
  function hasUrl(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('text/uri-list');
  }
  for (const type of ['dragenter', 'dragover']) {
    window.addEventListener(type, (e) => {
      if (!hasUrl(e)) return;
      KeepKeepPanel.showDrop((url) => { clearTimeout(dragTimer); run(url); });
      clearTimeout(dragTimer);
      dragTimer = setTimeout(() => { if (KeepKeepPanel.isDropping()) KeepKeepPanel.hide(); }, DRAG_END_DELAY);
    }, true);
  }

  // Download progress, relayed by the background script.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'dl-progress') KeepKeepPanel.downloads.progress(msg.job, msg.index, msg.loaded, msg.total, msg.done);
  });

  // The popup's Profile / Media / Download icons act on what's open in this tab.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'page-info') {
      pageInfo().then(sendResponse, () => sendResponse(null));
      return true;
    }
    if (msg?.type === 'page-action') {
      pageAction(msg).then(() => sendResponse({ ok: true }), (e) => sendResponse({ error: String(e?.message || e) }));
      return true;
    }
  });

  // The profile and/or post open in this tab: { profile, media: { key, code, url } }.
  async function pageInfo() {
    const item = KeepKeep.parse(location.href);
    if (!item) return {};
    if (item.kind === 'profile') return { profile: item.username };
    let username = item.username;
    if (!username && item.code) username = (await InstaApi.media(item.code).catch(() => ({}))).username || null;
    return { profile: username || null, media: { key: item.key, code: item.code, url: item.url } };
  }

  // Adds, or removes if already saved; downloads the post.
  async function pageAction({ action, info }) {
    if (action === 'profile' && info.profile) {
      const key = 'p:' + info.profile;
      return (await KeepKeep.get(key)) ? remove(key) : run(KeepKeep.profileUrl(info.profile));
    }
    if (action === 'media' && info.media) {
      const key = 'm:' + info.media.key;
      return (await KeepKeep.get(key)) ? remove(key) : run(info.media.url);
    }
    if (action === 'download' && info.media?.code) return download(info.media.code);
  }

  setTimeout(() => fillMissing().catch(() => {}), 3000);

  // Downloads every photo / video of a post in the highest quality, named
  // <username>_<YYMMDDHHmm of publishing>[_<n>].<ext>, into Downloads/KeepKeep,
  // each as its own file.
  // Progress is shown as balloons on the right.
  async function download(code) {
    const job = Math.random().toString(36).slice(2);
    const ui = KeepKeepPanel.downloads;
    ui.start(job);
    try {
      const post = await InstaApi.mediaFiles(code);
      if (!post.files.length) throw new Error('no files');
      const stamp = compactTime(post.takenAt ? post.takenAt * 1000 : Date.now());
      const base = `${post.username || 'instagram'}_${stamp}`;
      const many = post.files.length > 1;
      const files = post.files.map((f, i) => ({
        url: f.url, kind: f.kind, thumb: f.thumb,
        filename: `${base}${many ? `_${i + 1}` : ''}.${extension(f)}`,
      }));
      ui.items(job, { username: post.username, files });
      const res = await chrome.runtime.sendMessage({
        type: 'download', job,
        files: files.map(({ url, filename }) => ({ url, filename })),
      });
      if (!res?.ok) throw new Error(res?.error || 'failed');
      ui.finish(job, res);
      return true;
    } catch {
      ui.fail(job, "Couldn't download this post");
      return false;
    }
  }

  // 2025-07-27 14:32 → "2507271432" (local time)
  function compactTime(ms) {
    const d = new Date(ms);
    const two = (n) => String(n).padStart(2, '0');
    return `${two(d.getFullYear() % 100)}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}`;
  }

  function extension(file) {
    const m = new URL(file.url).pathname.match(/\.(jpe?g|png|webp|heic|mp4|mov)$/i);
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : file.kind === 'video' ? 'mp4' : 'jpg';
  }

  return { run, remove, download };
})();
