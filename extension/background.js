// Downloads an image from Instagram's CDN, crops it to a square thumbnail and
// returns it as a data: URL. The content script can't do this itself because
// the CDN is on a different origin.
const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'thumbnail') return;
  thumbnail(msg.url, msg.size).then(sendResponse, () => sendResponse(null));
  return true; // respond asynchronously
});

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
