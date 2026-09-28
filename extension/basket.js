// Content script ve popup'ın ortak kullandığı URL ayrıştırma ve depolama.
//
// Her kayıt chrome.storage.local'da kendi anahtarında durur:
//   p:<kullanıcı adı>  → profil
//   m:<gönderi kodu>   → görsel / video / reel (story için m:story:<id>)
// Böylece aynı anda yapılan eklemeler birbirinin üzerine yazmaz.
var InstaBasket = (() => {
  const BASE = 'https://www.instagram.com/';
  const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
  // Kullanıcı adı gibi görünen ama Instagram'ın kendi sayfaları olan yollar.
  const RESERVED = new Set([
    'about', 'accounts', 'api', 'ar', 'challenge', 'developer', 'direct', 'emails',
    'explore', 'graphql', 'legal', 'locations', 'nametag', 'p', 'privacy', 'reel',
    'reels', 'session', 'settings', 'stories', 'tags', 'tv', 'web', 'your_activity',
  ]);
  const MEDIA_PATHS = { p: 'post', reel: 'reel', reels: 'reel', tv: 'video' };

  // Bir URL'yi profil ya da gönderi olarak tanır. Instagram dışı ya da tanınmayan
  // URL'ler için null döner. ?img_index=1 gibi parametreler atılır.
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

    // /p/KOD/, /reel/KOD/, /tv/KOD/
    if (MEDIA_PATHS[parts[0]] && parts[1]) return media(parts[1], MEDIA_PATHS[parts[0]], null);
    // /kullanici/p/KOD/, /kullanici/reel/KOD/
    if (parts.length >= 3 && USERNAME.test(parts[0]) && MEDIA_PATHS[parts[1]]) {
      return media(parts[2], MEDIA_PATHS[parts[1]], parts[0].toLowerCase());
    }
    // /stories/kullanici/ID/
    if (parts[0] === 'stories' && USERNAME.test(parts[1] || '') && /^\d+$/.test(parts[2] || '')) {
      const username = parts[1].toLowerCase();
      return {
        kind: 'media', key: 'story:' + parts[2], code: null, type: 'story', username,
        url: `${BASE}stories/${username}/${parts[2]}/`,
      };
    }
    // /kullanici/ ve profilin alt sekmeleri (/kullanici/reels/, /kullanici/tagged/)
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
    await migrate(all);
    const profiles = [];
    const mediaList = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('p:')) profiles.push(v);
      else if (k.startsWith('m:')) mediaList.push(v);
    }
    const byNewest = (a, b) => (b.addedAt || 0) - (a.addedAt || 0);
    return { profiles: profiles.sort(byNewest), media: mediaList.sort(byNewest) };
  }

  // 0.1 sürümündeki düz "basket" listesini yeni yapıya taşır. Eksik bilgiler
  // (sahip, küçük resim) bir sonraki Instagram ziyaretinde tamamlanır.
  async function migrate(all) {
    if (!Array.isArray(all.basket)) return;
    const next = {};
    for (const old of all.basket) {
      const item = parse(old.url);
      if (!item) continue;
      const addedAt = old.addedAt || Date.now();
      if (item.kind === 'profile') next['p:' + item.username] = { username: item.username, addedAt };
      else next['m:' + item.key] = { ...strip(item), addedAt };
    }
    await chrome.storage.local.set(next);
    await chrome.storage.local.remove('basket');
    Object.assign(all, next);
    delete all.basket;
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

  return {
    parse,
    profileUrl,
    load,
    getProfile: (username) => get('p:' + username),
    getMedia: (key) => get('m:' + key),
    saveProfile: (p) => merge('p:' + p.username, p),
    saveMedia: (m) => merge('m:' + m.key, strip(m)),
    removeMedia: (key) => chrome.storage.local.remove('m:' + key),
    // Profil silinince ona ait görseller de silinir.
    async removeProfile(username) {
      const { media: list } = await load();
      const keys = ['p:' + username];
      for (const m of list) if (m.username === username) keys.push('m:' + m.key);
      await chrome.storage.local.remove(keys);
    },
    async clear() {
      const all = await chrome.storage.local.get(null);
      await chrome.storage.local.remove(Object.keys(all).filter((k) => /^[pm]:/.test(k) || k === 'basket'));
    },
  };
})();
