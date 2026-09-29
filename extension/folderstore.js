// Remembers the folder the user picked for downloads. A folder handle can't go
// into chrome.storage, so it's kept in the extension's IndexedDB, where both
// the folder window (folder.js) and the download helper (offscreen.js) can read it.
var FolderStore = (() => {
  const open = () => new Promise((resolve, reject) => {
    // Original name, kept so a folder chosen before the rename isn't lost.
    const req = indexedDB.open('instabasket', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    get: () => run('readonly', (s) => s.get('downloadDir')),
    set: (handle) => run('readwrite', (s) => s.put(handle, 'downloadDir')),
    clear: () => run('readwrite', (s) => s.delete('downloadDir')),
    // 'granted', 'prompt' (Chrome wants the user to confirm again) or 'none'
    async state() {
      const dir = await this.get().catch(() => null);
      if (!dir) return { state: 'none' };
      const p = await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
      return { state: p === 'granted' ? 'granted' : 'prompt', name: dir.name };
    },
  };
})();
