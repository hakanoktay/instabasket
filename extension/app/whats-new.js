// What's new: shown once after an update that has notes. This file also runs
// in the service worker (background.js imports it), so the decision code has
// no DOM; the view is registered only when the app page is there.
const WHATS_NEW = {
  '1.1.0': [
    'KeepKeep now has its own page: everything you saved, in a big grid with search, filters and bulk actions.',
    'Reorder your lists by dragging them.',
    'Back up everything to one file and import it on another computer.',
    'Never asks for your password. Nothing leaves your computer.',
  ],
};

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}

// True only if the current version has notes and its major or minor is higher
// than the previous one (patch-only updates, equal versions and downgrades: no).
function shouldShowWhatsNew(previous, current) {
  if (!Object.prototype.hasOwnProperty.call(WHATS_NEW, current)) return false;
  const p = parseVersion(previous), c = parseVersion(current);
  if (!p || !c) return false;
  return c[0] > p[0] || (c[0] === p[0] && c[1] > p[1]);
}

// Which page to open after chrome.runtime.onInstalled, or null.
function pagesToOpen({ reason, previousVersion }, version) {
  if (reason === 'install') return 'app.html#welcome';
  if (reason === 'update' && shouldShowWhatsNew(previousVersion, version)) return 'app.html#whats-new';
  return null;
}

if (typeof KeepKeepApp !== 'undefined') {
  (() => {
    const { el, view } = KeepKeepApp;

    // The current version's notes, or the newest entry (viewable before a version bump).
    function pick() {
      const current = chrome.runtime.getManifest().version;
      if (WHATS_NEW[current]) return [current, WHATS_NEW[current]];
      const newest = Object.keys(WHATS_NEW).filter(parseVersion)
        .sort((a, b) => { const x = parseVersion(a), y = parseVersion(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }).pop();
      return [newest, WHATS_NEW[newest] || []];
    }

    function render(main) {
      const [version, notes] = pick();
      main.append(el('div', { class: 'welcome whats-new' },
        el('div', { class: 'brand' }, el('img', { src: 'icons/logo.svg', alt: '', width: 40, height: 40 }), el('span', { text: 'KeepKeep' })),
        el('h1', {}, "What's new in KeepKeep ", el('em', { text: version })),
        el('ul', { class: 'notes' }, notes.map((text) => el('li', { text }))),
        el('a', { class: 'go', href: '#media', text: 'Go to KeepKeep →' })));
    }

    view({ id: 'whats-new', title: "What's new", nav: null, full: true, render });
  })();
}
