// Content script ve popup'ın ortak kullandığı sepet işlemleri.
// Sayfanın içeriği okunmaz; yalnızca URL saklanır. Instagram arayüzü
// değişse de eklenti bozulmasın diye bilinçli olarak böyle tutuldu.
var InstaBasket = (() => {
  const KEY = 'basket';

  function parse(raw) {
    const text = (raw || '').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
    if (!text) return null;
    let u;
    try {
      u = new URL(text.trim());
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

    const isInstagram = /(^|\.)instagram\.com$/.test(u.hostname);
    if (!isInstagram) return { url: u.href, type: 'link' };

    // Takip parametrelerini (igsh, utm_...) ve hash'i at, tek bir biçime getir.
    const parts = u.pathname.split('/').filter(Boolean);
    let type = 'instagram';
    let path = parts;
    if (['p', 'reel', 'reels', 'tv'].includes(parts[0]) && parts[1]) {
      type = parts[0] === 'p' ? 'post' : parts[0] === 'tv' ? 'video' : 'reel';
      path = [parts[0] === 'reels' ? 'reel' : parts[0], parts[1]];
    } else if (parts[0] === 'stories' && parts[1]) {
      type = 'story';
    } else if (parts.length === 1) {
      type = 'profile';
    } else if (parts.length >= 3 && ['p', 'reel'].includes(parts[1])) {
      // /kullanici/p/KOD/ biçimi
      type = parts[1] === 'p' ? 'post' : 'reel';
      path = [parts[1], parts[2]];
    }
    const url = 'https://www.instagram.com/' + (path.length ? path.join('/') + '/' : '');
    return { url, type };
  }

  async function list() {
    const { [KEY]: items = [] } = await chrome.storage.local.get(KEY);
    return items;
  }

  // Eklendiyse true, zaten sepetteyse false döner.
  async function add(entry) {
    const items = await list();
    if (items.some((i) => i.url === entry.url)) return false;
    items.unshift({ ...entry, addedAt: Date.now() });
    await chrome.storage.local.set({ [KEY]: items });
    return true;
  }

  async function remove(url) {
    const items = await list();
    await chrome.storage.local.set({ [KEY]: items.filter((i) => i.url !== url) });
  }

  async function clear() {
    await chrome.storage.local.set({ [KEY]: [] });
  }

  return { parse, list, add, remove, clear };
})();
