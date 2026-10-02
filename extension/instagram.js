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

  // The API lists photos only up to 1080 px wide. The post's embed page also
  // carries the address of the uploaded original (its `stp` has no size or
  // crop step, e.g. "dst-jpg_e35_tt6"). The addresses are signed, so they
  // can't be made by hand – only found. Returns file key → address.
  async function embedOriginals(code) {
    const res = await fetch(`/p/${code}/embed/captioned/`, { credentials: 'include' });
    if (!res.ok) throw new Error(`embed: ${res.status}`);
    const text = (await res.text())
      .replace(/\\\//g, '/')
      .replace(/\\u0026|&amp;/g, '&')
      .replace(/&quot;/g, '"');
    const found = new Map();
    for (const [url] of text.matchAll(/https:\/\/[^"'\s<>\\]+/g)) {
      let u;
      try {
        u = new URL(url);
      } catch {
        continue;
      }
      const stp = u.searchParams.get('stp');
      if (!stp || /(^|_)[ps]\d+x\d+|^c\d/.test(stp)) continue; // resized or cropped
      const key = fileKey(url);
      if (key && !found.has(key)) found.set(key, url);
    }
    return found;
  }

  // "…/828467265_1862…_n.jpg?…" → "828467265_1862…_n.jpg": the same photo in
  // every size shares this file name.
  function fileKey(url) {
    try {
      return new URL(url).pathname.split('/').pop();
    } catch {
      return null;
    }
  }

  // Every photo / video of a post (all items of an album), each in the highest
  // resolution Instagram offers (photos in their uploaded size unless
  // `originals` is false), plus the owner and publish time for file names.
  // Each photo / video of an API item (all items of an album), in the largest listed size.
  function filesOf(item) {
    const parts = item.carousel_media?.length ? item.carousel_media : [item];
    const largest = (list) => list.reduce((a, b) => ((b.width || 0) * (b.height || 0) > (a.width || 0) * (a.height || 0) ? b : a));
    return parts.map((m) => {
      const thumb = pick(m.image_versions2?.candidates, 150); // small preview (a video's cover)
      if (m.video_versions?.length) return { url: largest(m.video_versions).url, kind: 'video', thumb };
      if (m.image_versions2?.candidates?.length) return { url: largest(m.image_versions2.candidates).url, kind: 'image', thumb };
      return null;
    }).filter(Boolean);
  }

  // A story item by its id (the number in /stories/<username>/<id>/). Asking
  // for it doesn't mark the story as seen.
  async function story(pk) {
    const { items } = await json(`/api/v1/media/${encodeURIComponent(pk)}/info/`);
    const item = items[0];
    return {
      username: item.user?.username?.toLowerCase() || null,
      type: item.media_type === 2 ? 'story-video' : 'story-photo',
      takenAt: item.taken_at || null,
      expiresAt: item.expiring_at || (item.taken_at ? item.taken_at + 86400 : null), // unix seconds
      thumbUrl: pick(item.image_versions2?.candidates, 320),
      files: filesOf(item),
    };
  }

  // All of an account's current stories, starting from one story id: the
  // item tells the owner's id, and the owner's reel lists every story. Falls
  // back to just the one story if the reel can't be read.
  async function storyReel(pk) {
    const { items } = await json(`/api/v1/media/${encodeURIComponent(pk)}/info/`);
    const first = items[0];
    let reelItems = [first];
    const userId = first.user?.pk || first.user?.id;
    if (userId) {
      try {
        const j = await json(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`);
        const list = j.reels?.[userId]?.items || j.reels_media?.[0]?.items;
        if (list?.length) reelItems = list;
      } catch {}
    }
    reelItems = [...reelItems].sort((a, b) => (a.taken_at || 0) - (b.taken_at || 0));
    return {
      username: first.user?.username?.toLowerCase() || null,
      items: reelItems.map((it) => ({ takenAt: it.taken_at || null, files: filesOf(it) })).filter((it) => it.files.length),
    };
  }

  // A highlight (the id in /stories/highlights/<id>/): its owner, title and
  // every story in it, in the highlight's order.
  async function highlight(id) {
    const reelId = 'highlight:' + id;
    const j = await json(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`);
    const reel = j.reels?.[reelId] || j.reels_media?.[0];
    if (!reel) throw new Error('highlight not found');
    return {
      username: reel.user?.username?.toLowerCase() || null,
      title: reel.title || null,
      pks: (reel.items || []).map((it) => String(it.pk)), // every story, in the viewer's order
      items: (reel.items || []).map((it) => ({ takenAt: it.taken_at || null, files: filesOf(it) })).filter((it) => it.files.length),
    };
  }

  async function mediaFiles(code, { originals: wantOriginals = true } = {}) {
    const { items } = await json(`/api/v1/media/${codeToId(code)}/info/`);
    const item = items[0];
    const files = filesOf(item);
    // Photos in their uploaded size, where the post's embed page has them.
    const originals = wantOriginals && files.some((f) => f.kind === 'image')
      ? await embedOriginals(code).catch(() => new Map())
      : new Map();
    for (const f of files) {
      const original = f.kind === 'image' && originals.get(fileKey(f.url));
      if (original && original !== f.url) Object.assign(f, { fallback: f.url, url: original });
    }
    const cover = item.image_versions2 || item.carousel_media?.[0]?.image_versions2;
    return {
      username: item.user?.username?.toLowerCase() || null,
      takenAt: item.taken_at || null, // unix seconds
      thumbUrl: pick(cover?.candidates, 150),
      files,
    };
  }

  return { profile, media, mediaFiles, story, storyReel, highlight, thumbnail, codeToId, fileKey };
})();
