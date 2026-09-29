// Hidden helper page for downloads. It fetches a post's files (reporting
// progress), optionally packs them into one ZIP, and hands back blob: URLs for
// chrome.downloads (the background service worker can't turn large data into
// a URL itself).

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'build') {
    build(msg).then(sendResponse, (e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg.type === 'revoke') URL.revokeObjectURL(msg.url);
});

async function build({ job, files, zip: asZip, zipName, mtime }) {
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    parts.push(await fetchWithProgress(files[i].url, (loaded, total, done) =>
      chrome.runtime.sendMessage({ type: 'dl-progress', job, index: i, loaded, total, done })));
  }
  if (asZip) {
    const blob = zip(files.map((f, i) => ({ name: f.filename, data: parts[i] })), new Date(mtime || Date.now()));
    return { outputs: [{ url: URL.createObjectURL(blob), filename: zipName }] };
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

// ---- Minimal ZIP writer (stored, no compression: photos and videos are
// already compressed, so deflating them would only cost time). ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries, date) {
  const enc = new TextEncoder();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const out = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    out.push(local, nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); // central directory header
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const cdSize = central.reduce((n, part) => n + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...out, ...central, end], { type: 'application/zip' });
}
