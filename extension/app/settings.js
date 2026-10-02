// Settings (photo size, anonymous stories, Backup) and About. The popup keeps
// the same switches for quick changes; both write chrome.storage.local, and
// this page re-reads it whenever it changes.
(() => {
  const { el, icon, view } = KeepKeepApp;

  const TAGS = [
    ['No password', true, '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'],
    ['No tracking', false, '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'],
    ['No ads', false, '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'],
  ];

  function svg(inner) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.innerHTML = inner;
    return s;
  }

  // ---- Settings ----
  async function syncSettings() {
    const { photoSize, anonStories } = await chrome.storage.local.get(['photoSize', 'anonStories']);
    for (const input of document.querySelectorAll('input[name=photo-size]')) input.checked = input.value === (photoSize === 'standard' ? 'standard' : 'original');
    const anon = document.getElementById('anon-stories');
    if (anon) anon.checked = anonStories === true;
  }

  function option(value, title, desc) {
    return el('label', { class: 'setting-option' },
      el('input', { type: 'radio', name: 'photo-size', value, onchange: () => chrome.storage.local.set({ photoSize: value }) }),
      el('span', { class: 'text' }, el('b', { text: title }), el('span', { class: 'desc', text: desc })));
  }

  async function importFile(file, drop, input, result) {
    if (!file) return;
    drop.classList.add('busy');
    let outcome;
    try {
      let backup;
      try { backup = JSON.parse(await file.text()); } catch { throw Object.assign(new Error(), { code: 'not-backup' }); }
      outcome = KeepKeep.describeImport(await KeepKeep.importData(backup));
    } catch (e) {
      outcome = KeepKeep.describeImport(e instanceof Error ? e : new Error());
    }
    drop.classList.remove('busy');
    input.value = '';
    result.hidden = false;
    result.className = `result ${outcome.ok ? 'ok' : 'bad'}`;
    result.replaceChildren(el('b', { text: outcome.title }), el('span', { text: outcome.text }));
  }

  function renderSettings(main) {
    const status = el('p', { id: 'backup-status', class: 'backup-status', role: 'status' });
    const exportBtn = el('button', { id: 'export', class: 'btn', type: 'button', onclick: async () => {
      status.classList.remove('bad');
      status.textContent = 'Exporting…';
      try { status.textContent = `Saved to Downloads/KeepKeep as ${await KeepKeep.downloadBackup()}`; } catch {
        status.classList.add('bad');
        status.textContent = 'Export failed. Please try again.';
      }
    } }, 'Export');

    const input = el('input', { type: 'file', id: 'import-file', accept: '.json,application/json' });
    const result = el('div', { id: 'import-result', class: 'result', role: 'status', hidden: true });
    const drop = el('label', { class: 'drop' }, input, icon('upload'), el('b', { text: 'Choose a backup file' }), el('span', { text: 'or drop it here' }));
    input.addEventListener('change', () => importFile(input.files[0], drop, input, result));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); importFile(e.dataTransfer.files[0], drop, input, result); });

    main.append(
      el('h1', { text: 'Settings' }),
      el('div', { class: 'page-narrow settings' },
        el('section', {}, el('h2', { text: 'Downloads' }),
          el('p', { class: 'hint', text: 'Photos and videos are saved to Downloads/KeepKeep, each as its own file.' })),
        el('section', {}, el('h2', { text: 'Photo size' }),
          option('original', 'Original', 'The photo as it was uploaded, up to 3072 px wide. Sharpest, larger files (often 1–3 MB).'),
          option('standard', 'Standard', 'The largest size Instagram shows, up to 1080 px wide. Smaller files (a few hundred KB).')),
        el('section', {}, el('h2', { text: 'Stories' }),
          el('label', { class: 'setting-toggle' },
            el('span', { class: 'text' }, el('b', { text: 'Watch stories anonymously' }),
              el('span', { class: 'desc', text: "You won't appear in the story's viewers list. Stories you watch stay unseen for you too. Replies and likes are still visible." })),
            el('input', { type: 'checkbox', id: 'anon-stories', onchange: (e) => chrome.storage.local.set({ anonStories: e.target.checked }) }))),
        el('section', {}, el('h2', { text: 'Backup' }),
          el('p', { class: 'hint', text: 'Move your saved profiles, posts and lists to another computer. Importing adds to what you have; nothing is deleted.' }),
          el('div', { class: 'backup-row' }, exportBtn, status),
          el('h3', { text: 'Import a backup' }),
          el('p', { class: 'hint' }, 'Choose a KeepKeep backup file (', el('b', { text: 'KeepKeep-backup-….json' }), ", made with Export). Everything in it is added to what you have here; nothing is deleted."),
          drop, result)));
    syncSettings();
  }

  // ---- About ----
  function renderAbout(main) {
    const link = (href, text) => el('a', { href, ...(href.startsWith('#') ? {} : { target: '_blank', rel: 'noopener' }), text });
    main.append(
      el('h1', { text: 'About' }),
      el('div', { class: 'page-narrow about' },
        el('div', { class: 'about-head' }, el('img', { class: 'logo', src: 'icons/logo.svg', alt: '', width: 40, height: 40 }),
          el('b', { text: 'KeepKeep' }), el('span', { class: 'version', text: 'v' + chrome.runtime.getManifest().version })),
        el('ul', { class: 'tags', 'aria-label': 'Privacy' },
          TAGS.map(([text, strong, path]) => el('li', { class: 'tag' + (strong ? ' strong' : '') }, svg(path), text))),
        el('p', { class: 'about-line', text: 'Never asks for your password. Nothing leaves your computer.' }),
        el('nav', { class: 'about-links' },
          link('https://zetasis.net', 'Made by Zetasis'),
          link('https://buymeacoffee.com/zetasis', '☕ Buy me a coffee'),
          link('https://hakanoktay.github.io/keepkeep/privacy.html', 'Privacy policy'),
          link('https://github.com/hakanoktay/keepkeep/issues', 'Report a problem')),
        el('nav', { class: 'about-links more' }, link('#welcome', 'Show the welcome again'), link('#whats-new', "What's new"))));
  }

  KeepKeepApp.on('change', () => { if (document.getElementById('anon-stories')) syncSettings(); });
  view({ id: 'settings', title: 'Settings', nav: 'bottom', icon: 'settings', render: renderSettings });
  view({ id: 'about', title: 'About', nav: 'bottom', icon: 'about', render: renderAbout });
})();
