// The app page's core: a tiny hash router, the shared state (refreshed when
// storage changes) and the sidebar. Views register themselves with
// KeepKeepApp.view(); each file in app/ adds its own.
const ICONS = {
  media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/></svg>',
  profiles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v12M7 10.5l5 5 5-5"/><path d="M4 16.5v2a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  reel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><path d="M2.5 8h19M9 2.5l3 5.5M15 2.5l3 5.5"/><path d="M10 11.5v6l5-3z" fill="currentColor"/></svg>',
  album: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h11a3 3 0 0 1 3 3v11h-2V6a1 1 0 0 0-1-1H7z"/><rect x="3" y="7" width="14" height="14" rx="2.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  post: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/></svg>',
  story: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-dasharray="4 2.4"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5v-12M7 8.5l5-5 5 5"/><path d="M4 16.5v2a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
};

const KeepKeepApp = (() => {
  const DEFAULT_VIEW = 'media';
  const views = new Map();
  const handlers = {};
  const state = { profiles: [], media: [], users: {}, lists: [] };
  let main, loaded = false;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }

  function icon(name) {
    const span = document.createElement('span');
    span.className = 'i';
    span.innerHTML = ICONS[name] || '';
    return span;
  }

  function on(event, fn) { (handlers[event] ||= []).push(fn); }
  function emit(event) { for (const fn of handlers[event] || []) fn(); }

  function view(def) { views.set(def.id, def); if (loaded) renderNav(); }

  function go(id, params) {
    const hash = '#' + [id, ...(params === undefined ? [] : [].concat(params)).map((x) => encodeURIComponent(x))].join('/');
    if (location.hash === hash) route(); else location.hash = hash;
  }

  function counts() { return { media: state.media.length, profiles: state.profiles.length }; }

  function renderNav() {
    const current = main && main.dataset.view;
    const count = counts();
    for (const [where, id] of [['main', 'nav-main'], ['bottom', 'nav-bottom']]) {
      const nav = document.getElementById(id);
      nav.replaceChildren(...[...views.values()].filter((v) => v.nav === where).map((v) =>
        el('a', { class: 'item' + (v.id === current ? ' active' : ''), 'data-view': v.id, href: '#' + v.id, title: v.title },
          icon(v.icon || v.id),
          el('span', { class: 'label', text: v.title }),
          count[v.id] !== undefined ? el('span', { class: 'count', text: String(count[v.id]) }) : null)));
    }
  }

  function route() {
    let id, params;
    try {
      [id, ...params] = location.hash.slice(1).split('/').map(decodeURIComponent);
    } catch { id = DEFAULT_VIEW; params = []; } // a hand-edited hash like "#100%"
    const v = views.get(id) || views.get(DEFAULT_VIEW);
    if (!v) return;
    main.dataset.view = v.id;
    document.body.classList.toggle('full', !!v.full);
    renderNav();
    main.replaceChildren();
    v.render(main, params);
  }

  async function refresh() {
    Object.assign(state, await KeepKeep.load());
    emit('change');
  }

  function start() {
    main = document.querySelector('main');
    const narrow = matchMedia('(max-width: 900px)');
    const setNarrow = () => document.body.classList.toggle('narrow', narrow.matches);
    narrow.addEventListener('change', setNarrow);
    setNarrow();
    let timer;
    chrome.storage.onChanged.addListener(() => { clearTimeout(timer); timer = setTimeout(refresh, 100); });
    on('change', renderNav);
    window.addEventListener('hashchange', route);
    refresh()
      .catch((err) => console.error('KeepKeep: could not load your data', err))
      .finally(() => { loaded = true; route(); });
  }

  return { view, go, state, on, emit, el, icon, start, route };
})();

// Start once every view file has registered itself (scripts run before DOMContentLoaded fires).
document.addEventListener('DOMContentLoaded', () => KeepKeepApp.start());
