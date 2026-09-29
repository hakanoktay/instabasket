// A small window with a single button: Chrome only lets an extension open the
// folder picker (or confirm access to a folder picked before) from its own
// page, not from inside Instagram or the popup (which closes when the picker
// opens). Everything else about downloads is asked in the page or set in the
// popup's settings.
//   ?mode=pick  – choose a folder
//   ?mode=allow – confirm access to the folder chosen before
// Reports the outcome back so a waiting download can continue.

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const request = params.get('request');
const mode = params.get('mode') || 'pick';

async function done(result) {
  // Waiting download: stay open while it saves (the background closes this
  // window), since the access just granted lasts only while this page is open.
  if (result === 'folder' && params.get('wait')) {
    $('#title').textContent = 'Saving…';
    $('#text').textContent = 'This window closes when your download is saved.';
    $('#go').hidden = true;
    $('#cancel').hidden = true;
    $('#error').hidden = true;
  }
  await chrome.runtime.sendMessage({ type: 'folder-result', request, result }).catch(() => {});
  if (!(result === 'folder' && params.get('wait'))) window.close();
}

function showError(text) {
  $('#error').hidden = false;
  $('#error').textContent = text;
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
    showError("Couldn't use that folder. Try another one.");
  }
}

async function allowAccess() {
  const dir = await FolderStore.get().catch(() => null);
  if (!dir) return chooseFolder();
  if ((await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') done('folder');
  else showError('Access was not allowed. You can choose another folder in the settings.');
}

(async () => {
  if (mode === 'allow') {
    const { name } = await FolderStore.state();
    $('#title').textContent = 'Allow access again';
    $('#text').textContent = 'Choose “Allow on every visit” if Chrome offers it, so you’re not asked again.';
    $('#go-label').textContent = `Allow access to “${name || 'folder'}”`;
    $('#go').addEventListener('click', allowAccess);
  } else {
    $('#go').addEventListener('click', chooseFolder);
  }
  $('#cancel').addEventListener('click', () => done('closed'));
  $('#go').focus();
})();
