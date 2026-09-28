// Fetches profile and post details from Instagram. Runs as a content script on
// instagram.com, so requests go out with the user's session.
//
// Tries the JSON endpoints the Instagram website itself uses first; if those
// change, falls back to the page's share tags (og:image etc.).
var InstaApi = (() => {
  const APP_ID = '936619743392459'; // fixed ID of the instagram.com web client
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  async function json(path) {
    const res = await fetch(path, { credentials: 'include', headers: { 'X-IG-App-ID': APP_ID } });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  async function meta(path) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const read = (name) =>
      doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') || '';
    return { image: read('og:image'), title: read('og:title'), description: read('og:description') };
  }

  // Shortcode (DQMXnfvDEcE) → numeric media ID.
  function codeToId(code) {
    const short = code.length > 28 ? code.slice(0, -28) : code; // private-account codes carry a suffix
    let id = 0n;
    for (const c of short) {
      const i = ALPHABET.indexOf(c);
      if (i < 0) throw new Error('invalid shortcode: ' + code);
      id = id * 64n + BigInt(i);
    }
    return id.toString();
  }

  // Smallest image at least `min` px wide (or the largest one if none is).
  function pick(candidates, min) {
    if (!candidates?.length) return null;
    const sorted = [...candidates].sort((a, b) => a.width - b.width);
    return (sorted.find((c) => c.width >= min) || sorted[sorted.length - 1]).url;
  }

  function mediaType(item) {
    if (item.product_type === 'clips') return 'reel';
    if (item.media_type === 8) return 'album';
    if (item.media_type === 2) return 'video';
    return 'photo';
  }

  async function profile(username) {
    try {
      const { data } = await json(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
      const u = data.user;
      return { fullName: u.full_name || '', picUrl: u.profile_pic_url || u.profile_pic_url_hd || null };
    } catch {
      const m = await meta(`/${encodeURIComponent(username)}/`);
      // og:title: "Full Name (@username) • Instagram photos and videos"
      const fullName = m.title.split(' (@')[0].trim();
      return { fullName: fullName !== m.title ? fullName : '', picUrl: m.image || null };
    }
  }

  async function media(code) {
    try {
      const { items } = await json(`/api/v1/media/${codeToId(code)}/info/`);
      const item = items[0];
      const cover = item.image_versions2 || item.carousel_media?.[0]?.image_versions2;
      return {
        username: item.user?.username?.toLowerCase() || null,
        type: mediaType(item),
        thumbUrl: pick(cover?.candidates, 320),
      };
    } catch {
      const m = await meta(`/p/${encodeURIComponent(code)}/`);
      // og:description: "12 likes, 3 comments - username on October 1, 2025: ..."
      // og:title:       "Full Name (@username) on Instagram: ..."
      const found =
        m.title.match(/\(@([A-Za-z0-9._]{1,30})\)/) || m.description.match(/ - ([A-Za-z0-9._]{1,30}) on /);
      return { username: found ? found[1].toLowerCase() : null, type: null, thumbUrl: m.image || null };
    }
  }

  // CDN image links expire within days, so the image is downscaled in the
  // background and kept as a permanent data: URL.
  async function thumbnail(url, size) {
    if (!url) return null;
    try {
      return await chrome.runtime.sendMessage({ type: 'thumbnail', url, size });
    } catch {
      return null;
    }
  }

  return { profile, media, thumbnail, codeToId };
})();
