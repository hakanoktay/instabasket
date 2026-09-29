// Hidden helper page for downloads. It fetches a post's files (reporting
// progress) and hands back blob: URLs for chrome.downloads (the background service worker can't turn large data into
// a URL itself).

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'build') {
    build(msg).then(sendResponse, (e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg.type === 'revoke') URL.revokeObjectURL(msg.url);
});

async function build({ job, files }) {
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    const report = (loaded, total, done) => chrome.runtime.sendMessage({ type: 'dl-progress', job, index: i, loaded, total, done });
    // The original-size address first; if the CDN refuses it, the listed size.
    parts.push(await fetchWithProgress(files[i].url, report).catch((e) => {
      if (!files[i].fallback) throw e;
      return fetchWithProgress(files[i].fallback, report);
    }));
  }
  return {
    outputs: files.map((f, i) => ({ url: URL.createObjectURL(new Blob([parts[i]], { type: parts[i].mediaType })), filename: f.filename })),
  };
}

// Fetches a file, reporting progress, and returns its bytes.
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  // An error page or message instead of the file (e.g. an expired link) must
  // never be saved under a photo / video name.
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^(image|video)\/|^application\/octet-stream$/.test(type)) throw new Error(`not a photo or video (${type || 'unknown type'})`);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (performance.now() - last > 120) { // don't flood the page with messages
      last = performance.now();
      onProgress(loaded, total, false);
    }
  }
  onProgress(loaded, loaded, true);
  if (loaded === 0) throw new Error('empty file');
  const data = new Uint8Array(loaded);
  data.mediaType = type;
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return data;
}
