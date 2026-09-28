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
  if (msg?.type === 'folder-result') {
    folderRequests.get(msg.request)?.(msg.result);
    folderRequests.delete(msg.request);
  }
  if (msg?.type === 'open-folder-settings') {
    chrome.windows.create({ url: 'folder.html', type: 'popup', width: 440, height: 480, focused: true });
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
// progress. They're written straight into the folder the user picked, or –
// without one – saved in Downloads/InstaBasket/, an album packed into a single
// ZIP so there's one download (and at most one "Save as" window) per post.

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
    if ((await downloadTarget(job, tabId)) === 'folder') {
      const saved = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'save-to-folder', job, files });
      if (saved && !saved.error) return { ok: true, mode: 'folder', folder: saved.folder, filenames: saved.filenames };
      // Folder no longer usable (moved, deleted, access withdrawn): fall back to Downloads.
    }
    const built = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'build', job, files, zipName: safeName(zipName), mtime });
    if (!built || built.error) throw new Error(built?.error || 'build failed');
    const id = await chrome.downloads.download({
      url: built.url, filename: `InstaBasket/${built.filename}`, conflictAction: 'uniquify', saveAs: false,
    });
    releaseWhenDone(id, built.url);
    return { ok: true, mode: 'downloads', filename: built.filename, size: built.size };
  } finally {
    jobs.delete(job);
  }
}

// Where this download goes: the folder the user picked ('folder') or
// Downloads/InstaBasket ('downloads'). The first time – or when Chrome wants
// the folder access confirmed again – the folder window asks, and the download
// waits for the answer.
async function downloadTarget(job, tabId) {
  const { downloadMode } = await chrome.storage.local.get('downloadMode');
  if (downloadMode === 'zip') return 'downloads';
  const folder = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'folder-state' }).catch(() => null);
  if (downloadMode === 'folder' && folder?.state === 'granted') return 'folder';
  // Ask at most once per browser session (the service worker itself restarts often).
  const { askedFolder } = await chrome.storage.session.get('askedFolder');
  if (askedFolder) return 'downloads';
  await chrome.storage.session.set({ askedFolder: true });
  chrome.tabs.sendMessage(tabId, { type: 'dl-waiting', job }).catch(() => {});
  return (await askForFolder()) === 'folder' ? 'folder' : 'downloads';
}

const folderRequests = new Map(); // request id → resolve
function askForFolder() {
  const request = Math.random().toString(36).slice(2);
  return new Promise(async (resolve) => {
    folderRequests.set(request, resolve);
    const win = await chrome.windows.create({
      url: `folder.html?request=${request}`, type: 'popup', width: 440, height: 480, focused: true,
    });
    // Closing the window without choosing: use Downloads for this time.
    const onClose = (id) => {
      if (id !== win.id) return;
      chrome.windows.onRemoved.removeListener(onClose);
      folderRequests.get(request)?.('closed');
      folderRequests.delete(request);
    };
    chrome.windows.onRemoved.addListener(onClose);
  });
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
