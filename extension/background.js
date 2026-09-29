// Background work the content script can't do itself because Instagram's CDN
// is on a different origin: making thumbnails (downloads an image, crops it to
// a square and returns a data: URL) and downloading posts.
const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'thumbnail') {
    thumbnail(msg.url, msg.size).then(sendResponse, () => sendResponse(null));
    return true; // respond asynchronously
  }
  if (msg?.type === 'download') {
    startDownload(msg, sender.tab?.id).then(sendResponse, (err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }
  if (msg?.type === 'dl-progress') {
    // From the helper page; pass it on to the Instagram tab that asked.
    const tabId = jobs.get(msg.job);
    if (tabId != null) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
});

// ---- Downloads ----
//
// Files are fetched by the hidden helper page (offscreen.js), which reports
// progress, and saved in Downloads/KeepKeep/ with chrome.downloads, each photo
// and video as its own file.

const jobs = new Map(); // job id → tab id, for progress messages

async function startDownload({ job, files }, tabId) {
  const allowed = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && ALLOWED_HOSTS.test(u.hostname);
    } catch {
      return false;
    }
  };
  files = (files || []).filter(({ url }) => allowed(url)).map((f) => ({
    url: f.url, fallback: allowed(f.fallback) ? f.fallback : null, filename: safeName(f.filename),
  }));
  if (!files.length) throw new Error('no files');
  jobs.set(job, tabId);
  try {
    await ensureHelper();
    const built = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'build', job, files });
    if (!built || built.error) throw new Error(built?.error || 'build failed');
    for (const { url, filename } of built.outputs) {
      const id = await chrome.downloads.download({
        url, filename: `KeepKeep/${filename}`, conflictAction: 'uniquify', saveAs: false,
      });
      releaseWhenDone(id, url);
    }
    return { ok: true, filenames: built.outputs.map((o) => o.filename) };
  } finally {
    jobs.delete(job);
  }
}

function safeName(name) {
  return String(name || 'instagram').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

let helperReady = null;
async function ensureHelper() {
  if (await chrome.offscreen.hasDocument()) return;
  helperReady ||= chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Fetch Instagram media for download',
  }).finally(() => { helperReady = null; });
  await helperReady;
}

// The blob: URL has to stay valid until Chrome has written the file (including
// while a "Save as" window is open); free it afterwards.
function releaseWhenDone(downloadId, url) {
  const listener = (delta) => {
    if (delta.id !== downloadId || !delta.state || delta.state.current === 'in_progress') return;
    chrome.downloads.onChanged.removeListener(listener);
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url }).catch(() => {});
  };
  chrome.downloads.onChanged.addListener(listener);
}

async function thumbnail(url, size) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.test(u.hostname)) return null;
  const res = await fetch(u);
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob());

  // Center-crop to a square.
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(size || 240, side);
  const canvas = new OffscreenCanvas(out, out);
  canvas.getContext('2d').drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out,
  );
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return 'data:image/jpeg;base64,' + btoa(binary);
}

// ---- Anonymous stories: a masked toolbar icon, like a private window ----

async function showAnonIcon() {
  const { anonStories } = await chrome.storage.local.get('anonStories');
  const name = anonStories === true ? 'anon' : 'icon';
  await chrome.action.setIcon({ path: Object.fromEntries([16, 32, 48, 128].map((s) => [s, `icons/${name}${s}.png`])) });
  await chrome.action.setTitle({ title: anonStories === true ? 'KeepKeep – watching stories anonymously' : 'KeepKeep' });
}
chrome.storage.onChanged.addListener((changes, area) => area === 'local' && changes.anonStories && showAnonIcon());
chrome.runtime.onStartup.addListener(showAnonIcon);
chrome.runtime.onInstalled.addListener(showAnonIcon);
