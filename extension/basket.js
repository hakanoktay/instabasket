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
    const old = (all.lists || []).filter((l) => !l.kind);
    if (!old.length) return;
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
    await chrome.storage.local.set(update);
    Object.assign(all, update);
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
