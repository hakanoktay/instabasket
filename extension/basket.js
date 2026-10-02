// URL parsing and storage shared by the content script and the popup.
//
// Every record lives under its own key in chrome.storage.local, so concurrent
// additions never overwrite each other:
//   p:<username>   → a saved profile          { username, addedAt, lists }
//   m:<shortcode>  → a saved photo/video/reel { key, code, url, type, username, thumb, addedAt, lists }
//                    (stories use m:story:<id>)
//   u:<username>   → cached account details   { username, fullName, pic }, used by
//                    both saved profiles and the owners of saved media
//   lists          → the user's lists [{ id, name, kind }]; kind is 'p' (profile lists) or
//                    'm' (media lists) – the two tabs have separate lists. Records refer to lists by id.
//
// Saving media never saves its owner as a profile; the two are independent.
var KeepKeep = (() => {
  const BASE = 'https://www.instagram.com/';
  const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
  // Paths that look like usernames but are Instagram's own pages.
  const RESERVED = new Set([
    'about', 'accounts', 'api', 'ar', 'challenge', 'developer', 'direct', 'emails',
    'explore', 'graphql', 'legal', 'locations', 'nametag', 'p', 'privacy', 'reel',
    'reels', 'session', 'settings', 'stories', 'tags', 'tv', 'web', 'your_activity',
  ]);
  const MEDIA_PATHS = { p: 'post', reel: 'reel', reels: 'reel', tv: 'video' };

  // Classifies a URL as a profile or a media item. Returns null for non-Instagram
  // or unrecognized URLs. Query parameters such as ?img_index=1 are dropped.
  function parse(raw) {
    const text = (raw || '').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
    if (!text) return null;
    let u;
    try {
      u = new URL(text.trim());
    } catch {
      return null;
    }
    if (!/^https?:$/.test(u.protocol) || !/(^|\.)instagram\.com$/.test(u.hostname)) return null;

    const parts = u.pathname.split('/').filter(Boolean);

    // /p/CODE/, /reel/CODE/, /tv/CODE/
    if (MEDIA_PATHS[parts[0]] && parts[1]) return media(parts[1], MEDIA_PATHS[parts[0]], null);
    // /username/p/CODE/, /username/reel/CODE/
    if (parts.length >= 3 && USERNAME.test(parts[0]) && MEDIA_PATHS[parts[1]]) {
      return media(parts[2], MEDIA_PATHS[parts[1]], parts[0].toLowerCase());
    }
    // /stories/username/ID/
    if (parts[0] === 'stories' && USERNAME.test(parts[1] || '') && /^\d+$/.test(parts[2] || '')) {
      const username = parts[1].toLowerCase();
      return {
        kind: 'media', key: 'story:' + parts[2], code: null, type: 'story', username,
        url: `${BASE}stories/${username}/${parts[2]}/`,
      };
    }
    // /username/ and profile sub-tabs (/username/reels/, /username/tagged/)
    if (parts.length >= 1 && parts.length <= 2 && USERNAME.test(parts[0]) && !RESERVED.has(parts[0].toLowerCase())) {
      return { kind: 'profile', username: parts[0].toLowerCase() };
    }
    return null;
  }

  function media(code, type, username) {
    return { kind: 'media', key: code, code, type, username, url: `${BASE}${type === 'reel' ? 'reel' : 'p'}/${code}/` };
  }

  function profileUrl(username) {
    return `${BASE}${username}/`;
  }

  async function load() {
    const all = await chrome.storage.local.get(null);
    await splitLists(all);
    const profiles = [];
    const media = [];
    const users = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('p:')) profiles.push(v);
      else if (k.startsWith('m:')) media.push(v);
      else if (k.startsWith('u:')) users[v.username] = v;
    }
    const byNewest = (a, b) => (b.addedAt || 0) - (a.addedAt || 0);
    return { profiles: profiles.sort(byNewest), media: media.sort(byNewest), users, lists: all.lists || [] };
  }

  // Lists used to be shared by profiles and media. Each old list becomes a media
  // list (same id) plus a profile list with the same name, and saved profiles
  // move over to the profile copy.
  async function splitLists(all) {
    const update = splitUpdate(all);
    if (!update) return;
    await chrome.storage.local.set(update);
    Object.assign(all, update);
  }

  // The changes splitLists() makes, without saving them (also used on backups).
  function splitUpdate(all) {
    const old = (all.lists || []).filter((l) => !l.kind);
    if (!old.length) return null;
    const lists = (all.lists || []).filter((l) => l.kind);
    const update = {};
    for (const l of old) {
      const profileId = l.id + '-p';
      lists.push({ ...l, kind: 'm' }, { id: profileId, name: l.name, kind: 'p' });
      for (const [k, v] of Object.entries(all)) {
        const record = update[k] || v;
        if (k.startsWith('p:') && record.lists?.includes(l.id)) {
          update[k] = { ...record, lists: record.lists.map((x) => (x === l.id ? profileId : x)) };
        }
      }
    }
    update.lists = lists;
    return update;
  }

  // ---- Backup: export everything to one file, import it on another computer ----
  // The file says what it is and which format version it uses, so later
  // versions of KeepKeep can still read old backups.

  const BACKUP = 'keepkeep-backup';
  const BACKUP_VERSION = 1;
  const SETTINGS = ['photoSize', 'anonStories'];

  async function exportData() {
    const all = await chrome.storage.local.get(null);
    await splitLists(all);
    const items = Object.fromEntries(Object.entries(all).filter(([k]) => /^[pmu]:/.test(k)));
    const settings = Object.fromEntries(SETTINGS.filter((k) => k in all).map((k) => [k, all[k]]));
    return {
      format: BACKUP, version: BACKUP_VERSION, app: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(), lists: all.lists || [], items, settings,
    };
  }

  // Saves a backup straight to Downloads/KeepKeep (no dialog, no extra window)
  // and returns the file's name. Used by the popup and the app page.
  async function downloadBackup() {
    const bytes = new TextEncoder().encode(JSON.stringify(await exportData()));
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const d = new Date();
    const date = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
    const name = `KeepKeep-backup-${date}.json`;
    await chrome.downloads.download({
      url: 'data:application/json;base64,' + btoa(binary), filename: `KeepKeep/${name}`, conflictAction: 'uniquify', saveAs: false,
    });
    return name;
  }

  // The words for an import's outcome: pass the counts importData() returned,
  // or the error it threw. Returns { ok, title, text }.
  function describeImport(result) {
    const plural = (n, one) => `${n} ${n === 1 ? one : one + 's'}`;
    if (result instanceof Error) {
      if (result.code === 'newer') return { ok: false, title: 'This backup was made by a newer KeepKeep.', text: 'Update KeepKeep, then import it again. Nothing was changed.' };
      if (result.code === 'not-backup') return { ok: false, title: "This file isn't a KeepKeep backup.", text: 'Choose a KeepKeep-backup-….json file made with Export. Nothing was changed.' };
      return { ok: false, title: 'The import failed.', text: 'Please try again. Nothing was changed.' };
    }
    const added = [result.profiles && plural(result.profiles, 'profile'), result.media && plural(result.media, 'post'), result.lists && plural(result.lists, 'list')].filter(Boolean);
    const already = result.existing ? `${plural(result.existing, 'item')} ${result.existing === 1 ? 'was' : 'were'} already here; their lists were combined.` : '';
    if (!added.length) return { ok: true, title: 'Everything in this backup was already here.', text: already };
    const list = added.length > 1 ? added.slice(0, -1).join(', ') + ' and ' + added.at(-1) : added[0];
    return { ok: true, title: `Added ${list}.`, text: already || 'Open KeepKeep from the toolbar to see them.' };
  }

  // Adds a backup to what is stored here; nothing is ever deleted or replaced.
  // Lists are matched by kind and name, so importing twice adds nothing twice.
  // A profile or post that is already here keeps its data and gets the
  // backup's lists added. This computer's settings stay as they are.
  // Returns { profiles, media, lists, existing } (how many were added / already here).
  async function importData(backup) {
    if (backup?.format !== BACKUP || typeof backup.version !== 'number' || !backup.items || typeof backup.items !== 'object') {
      throw Object.assign(new Error('Not a KeepKeep backup'), { code: 'not-backup' });
    }
    if (backup.version > BACKUP_VERSION) throw Object.assign(new Error('Made by a newer KeepKeep'), { code: 'newer' });

    const incoming = { lists: Array.isArray(backup.lists) ? backup.lists : [] };
    for (const [k, v] of Object.entries(backup.items)) if (/^[pmu]:./.test(k) && v && typeof v === 'object') incoming[k] = v;
    Object.assign(incoming, splitUpdate(incoming)); // a backup from before lists had a kind

    const all = await chrome.storage.local.get(null);
    await splitLists(all);
    const lists = [...(all.lists || [])];
    const same = (a, b) => a.kind === b.kind && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
    const ids = {}; // backup list id → list id here
    const counts = { profiles: 0, media: 0, lists: 0, existing: 0 };
    for (const l of incoming.lists) {
      if (!l?.id || typeof l.name !== 'string' || !l.name.trim() || !['p', 'm'].includes(l.kind)) continue;
      const here = lists.find((x) => same(x, l));
      if (here) {
        ids[l.id] = here.id;
        continue;
      }
      const id = lists.some((x) => x.id === l.id) ? Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : l.id;
      lists.push({ id, name: l.name.trim(), kind: l.kind });
      ids[l.id] = id;
      counts.lists++;
    }

    const update = { lists };
    for (const [k, v] of Object.entries(incoming)) {
      if (!/^[pmu]:/.test(k)) continue;
      const have = all[k];
      if (k.startsWith('u:')) {
        update[k] = { ...v, ...have }; // fills in what's missing here, e.g. a picture
        continue;
      }
      const theirs = (v.lists || []).map((id) => ids[id]).filter(Boolean);
      if (have) {
        counts.existing++;
        update[k] = { ...v, ...have, lists: [...new Set([...(have.lists || []), ...theirs])] };
      } else {
        update[k] = { ...v, lists: theirs };
        counts[k.startsWith('p:') ? 'profiles' : 'media']++;
      }
    }
    await chrome.storage.local.set(update);
    return counts;
  }

  function strip(item) {
    const { kind, ...rest } = item;
    return rest;
  }

  async function get(key) {
    const { [key]: value } = await chrome.storage.local.get(key);
    return value || null;
  }

  async function merge(key, data) {
    const current = await get(key);
    const value = { ...current, ...data };
    await chrome.storage.local.set({ [key]: value });
    return value;
  }

  // `kind` is 'p' or 'm'; omitted, all lists are returned.
  async function getLists(kind) {
    let lists = (await get('lists')) || [];
    if (lists.some((l) => !l.kind)) {
      const all = await chrome.storage.local.get(null);
      await splitLists(all);
      lists = all.lists;
    }
    return kind ? lists.filter((l) => l.kind === kind) : lists;
  }

  async function createList(name, kind) {
    const lists = await getLists();
    const list = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.trim(), kind };
    await chrome.storage.local.set({ lists: [...lists, list] });
    return list;
  }

  // Puts the lists of one kind in the order of `ids`; the other kind's lists
  // keep their places. Lists missing from `ids` (e.g. created meanwhile) go last.
  async function reorderLists(kind, ids) {
    const lists = await getLists();
    const ordered = ids.map((id) => lists.find((l) => l.id === id && l.kind === kind)).filter(Boolean);
    const queue = [...ordered, ...lists.filter((l) => l.kind === kind && !ordered.includes(l))];
    await chrome.storage.local.set({ lists: lists.map((l) => (l.kind === kind ? queue.shift() : l)) });
  }

  async function renameList(id, name) {
    const lists = await getLists();
    await chrome.storage.local.set({ lists: lists.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)) });
  }

  // Deletes the list itself; the profiles and media in it are kept.
  async function deleteList(id) {
    const all = await chrome.storage.local.get(null);
    const update = { lists: (all.lists || []).filter((l) => l.id !== id) };
    for (const [k, v] of Object.entries(all)) {
      if (/^[pm]:/.test(k) && v.lists?.includes(id)) update[k] = { ...v, lists: v.lists.filter((x) => x !== id) };
    }
    await chrome.storage.local.set(update);
  }

  // `recordKey` is a storage key such as "p:alice" or "m:DQMXnfvDEcE".
  async function setInList(recordKey, listId, inList) {
    const record = await get(recordKey);
    if (!record) return;
    const lists = (record.lists || []).filter((x) => x !== listId);
    if (inList) lists.push(listId);
    await chrome.storage.local.set({ [recordKey]: { ...record, lists } });
  }

  return {
    parse,
    profileUrl,
    load,
    getProfile: (username) => get('p:' + username),
    getMedia: (key) => get('m:' + key),
    getUser: (username) => get('u:' + username),
    saveProfile: (p) => merge('p:' + p.username, p),
    saveMedia: (m) => merge('m:' + m.key, strip(m)),
    saveUser: (u) => merge('u:' + u.username, u),
    removeProfile: (username) => chrome.storage.local.remove('p:' + username),
    removeMedia: (key) => chrome.storage.local.remove('m:' + key),
    async removeUserMedia(username) {
      const { media } = await load();
      await chrome.storage.local.remove(media.filter((m) => m.username === username).map((m) => 'm:' + m.key));
    },
    getLists,
    exportData,
    importData,
    downloadBackup,
    describeImport,
    createList,
    reorderLists,
    renameList,
    deleteList,
    setInList,
    get,
    // Removes a saved profile or media item by storage key ("p:alice", "m:CODE")
    // and returns it so the removal can be undone with restore().
    async remove(recordKey) {
      const record = await get(recordKey);
      await chrome.storage.local.remove(recordKey);
      return record;
    },
    restore: (recordKey, record) => chrome.storage.local.set({ [recordKey]: record }),
    async clear() {
      const all = await chrome.storage.local.get(null);
      await chrome.storage.local.remove(Object.keys(all).filter((k) => /^[pmu]:/.test(k) || k === 'basket'));
    },
  };
})();
