// Downloads from the app page. Instagram data needs the user's own session, so
// the work runs in the content script of an open instagram.com tab; this page
// only picks the tab, sends the keys and says what happened.
(() => {
  const { el, icon, state } = KeepKeepApp;
  const URLS = ['https://www.instagram.com/*', 'https://instagram.com/*'];
  let notice, timer;

  function hideNotice() { clearTimeout(timer); notice?.remove(); notice = null; }
  function showNotice(content, autoHide) {
    hideNotice();
    notice = el('div', { id: 'notice', role: 'status' }, el('span', {}, content),
      el('button', { class: 'close', type: 'button', title: 'Dismiss', 'aria-label': 'Dismiss', onclick: hideNotice }, icon('close')));
    document.body.append(notice);
    if (autoHide) timer = setTimeout(hideNotice, 8000);
  }

  // An active tab in the last focused window, else the most recently used one.
  async function pickTab() {
    const tabs = await chrome.tabs.query({ url: URLS });
    if (!tabs.length) return null;
    const win = await chrome.windows.getLastFocused().catch(() => null);
    return tabs.find((t) => t.active && win && t.windowId === win.id)
      || [...tabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  }

  // A story key downloads all of its account's current stories, so one story
  // key per owner is enough; stories with no known owner stay as they are.
  function oneStoryPerOwner(keys) {
    const owners = new Map(state.media.map((m) => ['m:' + m.key, m.username]));
    const seen = new Set();
    return keys.filter((k) => {
      const owner = k.startsWith('m:story:') && owners.get(k);
      if (!owner) return true;
      if (seen.has(owner)) return false;
      seen.add(owner);
      return true;
    });
  }

  async function bulkDownload(keys) {
    const media = oneStoryPerOwner(keys.filter((k) => k.startsWith('m:')));
    if (!media.length) return;
    const tab = await pickTab();
    if (!tab) {
      showNotice([el('span', { text: 'Open Instagram in a tab to download ' }),
        el('a', { href: 'https://www.instagram.com/', target: '_blank', rel: 'noopener', text: 'Open Instagram' })]);
      return;
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'download-keys', keys: media });
      if (!res?.ok) throw new Error('no answer');
      showNotice(`Downloading ${res.started} ${res.started === 1 ? 'item' : 'items'} in your Instagram tab`, true);
    } catch {
      showNotice('Reload your Instagram tab, then try again');
    }
  }

  KeepKeepApp.saved.bulkDownload = bulkDownload;
})();
