// The "Where should KeepKeep save downloads?" window. Opened by the
// background script on the first download (or when Chrome needs the folder
// access confirmed again), and from the download button in the popup.
// Reports the outcome back so a waiting download can continue.

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const waiting = params.get('request'); // id of a download waiting for this choice

async function done(result) {
  await chrome.runtime.sendMessage({ type: 'folder-result', request: waiting, result }).catch(() => {});
  window.close();
}

async function chooseFolder() {
  try {
    const dir = await showDirectoryPicker({ id: 'keepkeep', mode: 'readwrite', startIn: 'downloads' });
    // Ask right away, so Chrome's "Allow on every visit" option can be picked now.
    if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission');
    await FolderStore.set(dir);
    await chrome.storage.local.set({ downloadMode: 'folder' });
    done('folder');
  } catch (e) {
    if (e?.name === 'AbortError') return; // closed the picker; stay here
    $('#error').hidden = false;
    $('#error').textContent = "Couldn't use that folder. Try another one, or use the Downloads folder.";
  }
}

async function useDownloads() {
  await chrome.storage.local.set({ downloadMode: 'zip' });
  done('zip');
}

$('#choose').addEventListener('click', chooseFolder);
$('#choose-other').addEventListener('click', chooseFolder);
$('#change').addEventListener('click', chooseFolder);
for (const id of ['#use-downloads', '#use-downloads-2', '#use-downloads-3']) $(id).addEventListener('click', useDownloads);
$('#allow').addEventListener('click', async () => {
  const dir = await FolderStore.get();
  if (dir && (await dir.requestPermission({ mode: 'readwrite' })) === 'granted') done('folder');
});

(async () => {
  const { downloadMode } = await chrome.storage.local.get('downloadMode');
  const { state, name } = await FolderStore.state();
  for (const el of document.querySelectorAll('.folder-name')) el.textContent = name || '';
  if (downloadMode === 'folder' && state === 'prompt') {
    $('#reauth').hidden = false;
    $('#ask').hidden = true;
  } else if (!waiting && downloadMode) {
    // Opened from the popup: show the current setting.
    $('#current').hidden = false;
    $('#ask').hidden = true;
    $('.where').textContent = downloadMode === 'folder' && name ? `“${name}”` : 'Downloads/KeepKeep (albums as ZIP)';
  }
})();
