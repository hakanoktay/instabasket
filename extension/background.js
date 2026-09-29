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
  if (msg?.type === 'open-download-settings') {
    // Where Chrome's "Ask where to save each file" can be turned off.
    chrome.tabs.create({ url: 'chrome://settings/downloads' });
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
// progress, and saved in Downloads/KeepKeep/ with chrome.downloads. An album is
// saved as separate files, or as one ZIP if chosen in the settings.
//
// If Chrome's own "Ask where to save each file" setting is on, Chrome shows its
// save window for every download and no extension can skip it. So while it's
// on – or not known yet – an album is always packed into one ZIP: one window
// per post instead of one per photo. Each download tells whether Chrome asked.

const jobs = new Map(); // job id → tab id, for progress messages

async function startDownload({ job, files, zipName, mtime }, tabId) {
  files = (files || []).filter(({ url }) => {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.test(u.hostname);
  }).map((f) => ({ url: f.url, filename: safeName(f.filename) }));
  if (!files.length) throw new Error('no files');
  jobs.set(job, tabId);
  try {
    await ensureHelper();
    const { albumMode, chromeAsks } = await chrome.storage.local.get(['albumMode', 'chromeAsks']);
    const asZip = files.length > 1 && (albumMode === 'zip' || chromeAsks !== false);
    const built = await chrome.runtime.sendMessage({
      target: 'offscreen', type: 'build', job, files, zip: asZip, zipName: safeName(zipName), mtime,
    });
    if (!built || built.error) throw new Error(built?.error || 'build failed');
    const ids = [];
    for (const { url, filename } of built.outputs) {
      const id = await chrome.downloads.download({
        url, filename: `KeepKeep/${filename}`, conflictAction: 'uniquify', saveAs: false,
      });
      releaseWhenDone(id, url);
      ids.push(id);
    }
    const asked = !(await nameDecided(ids[0]));
    await chrome.storage.local.set({ chromeAsks: asked });
    return { ok: true, filenames: built.outputs.map((o) => o.filename), chromeAsks: asked };
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
    url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Fetch Instagram media and pack albums into one ZIP for download',
  }).finally(() => { helperReady = null; });
  await helperReady;
}

// Whether Chrome settled the download's file name right away. While its save
// window is open the name stays empty, so a name that isn't there after a
// moment means Chrome is asking where to save.
function nameDecided(id, wait = 1500) {
  return new Promise((resolve) => {
    let timer;
    const finish = (decided) => {
      if (timer === undefined) return; // already answered
      clearTimeout(timer);
      timer = undefined;
      chrome.downloads.onChanged.removeListener(listener);
      resolve(decided);
    };
    const listener = (delta) => {
      if (delta.id === id && (delta.filename?.current || delta.state?.current === 'complete')) finish(true);
    };
    timer = setTimeout(() => finish(false), wait);
    chrome.downloads.onChanged.addListener(listener);
    // It may have been settled before the listener was added.
    chrome.downloads.search({ id }).then(([item]) => {
      if (item?.filename) finish(true);
    }, () => {});
  });
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
