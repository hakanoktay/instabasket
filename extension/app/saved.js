// Saved media and saved profiles: grids with search, filters, sort, and chunked
// rendering. KeepKeepApp.saved is shared with the lists and selection code.
(() => {
  const { el, icon, view, state, on } = KeepKeepApp;
  const DAY = 86400000;
  const CHUNK = 60;
  const TYPE_LABELS = { post: 'Post', reel: 'Reel', album: 'Album', video: 'Video', story: 'Story' };

  const saved = KeepKeepApp.saved = {
    selected: new Set(),
    bulkDownload: null, // set by download.js: called with the selected media keys
    filters: { q: '', type: 'all', owner: '', since: 'any', sort: 'new', list: null },
    // rerender() = data changed: keep chunks and scroll. rerender(true) = filters
    // changed (search, type, list...): back to the first chunk and the top.
    rerender(reset) { current?.update(reset === true); },
  };
  let current = null; // { kind, update } of the view on screen

  const lc = (s) => String(s || '').toLowerCase();
  const listName = (id) => state.lists.find((l) => l.id === id)?.name;

  function matches(item, kind) {
    const f = saved.filters;
    if (f.q) {
      const hay = [item.username, state.users[item.username]?.fullName, ...(item.lists || []).map(listName)].map(lc).join('\n');
      if (!hay.includes(lc(f.q).trim())) return false;
    }
    if (kind === 'media') {
      const isReel = item.type === 'reel', isStory = item.type === 'story';
      if (f.type === 'posts' && (isReel || isStory)) return false;
      if (f.type === 'reels' && !isReel) return false;
      if (f.type === 'stories' && !isStory) return false;
      if (f.owner && item.username !== f.owner) return false;
    }
    if (f.since !== 'any') {
      const from = f.since === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : Date.now() - Number(f.since) * DAY;
      if (!((item.addedAt || 0) >= from)) return false;
    }
    if (f.list && !(item.lists || []).includes(f.list)) return false;
    return true;
  }

  function filterItems(kind) {
    const items = (kind === 'media' ? state.media : state.profiles).filter((i) => matches(i, kind));
    const dir = saved.filters.sort === 'old' ? 1 : -1;
    return items.sort((a, b) => dir * ((a.addedAt || 0) - (b.addedAt || 0)));
  }

  function relativeDate(ts) {
    if (!ts) return '';
    const days = Math.floor((Date.now() - ts) / DAY);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) { const w = Math.floor(days / 7); return w === 1 ? '1 week ago' : `${w} weeks ago`; }
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  }

  const chips = (item) => el('div', { class: 'chips' },
    (item.lists || []).map(listName).filter(Boolean).map((name) => el('span', { class: 'chip', text: name })));

  const checkbox = () => el('button', { class: 'select', type: 'button', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Select', title: 'Select' }, icon('check'));

  function mediaCard(m) {
    const thumb = m.thumb
      ? el('img', { src: m.thumb, alt: '', loading: 'lazy', draggable: 'false' })
      : el('div', { class: 'placeholder', text: 'No preview' });
    const type = TYPE_LABELS[m.type]
      ? el('span', { class: 'type' }, icon(m.type), TYPE_LABELS[m.type]) : null;
    const preview = m.url
      ? el('a', { class: 'preview', href: m.url, target: '_blank', rel: 'noopener', draggable: 'false', title: 'Open on Instagram' }, thumb)
      : el('div', { class: 'preview' }, thumb);
    return el('div', { class: 'card', 'data-key': 'm:' + m.key },
      checkbox(),
      el('div', { class: 'thumb' }, preview, type),
      el('div', { class: 'meta' },
        el('div', { class: 'row' },
          el('span', { class: 'owner' + (m.username ? '' : ' unknown'), text: m.username ? '@' + m.username : 'Owner not found' }),
          el('span', { class: 'date', text: relativeDate(m.addedAt) })),
        chips(m)));
  }

  let mediaCounts = new Map();
  function profileCard(p) {
    const user = state.users[p.username] || {};
    const count = mediaCounts.get(p.username) || 0;
    const pic = user.pic
      ? el('img', { class: 'pic', src: user.pic, alt: '', draggable: 'false' })
      : el('span', { class: 'pic', text: (p.username || '?')[0].toUpperCase() });
    return el('div', { class: 'card profile', 'data-key': 'p:' + p.username },
      checkbox(),
      el('a', { class: 'who', href: `https://www.instagram.com/${encodeURIComponent(p.username)}/`, target: '_blank', rel: 'noopener', draggable: 'false', title: 'Open on Instagram' },
        pic,
        el('span', { class: 'owner', text: '@' + p.username }),
        el('span', { class: 'name', text: user.fullName || '' })),
      el('div', { class: 'meta' },
        el('div', { class: 'row' },
          el('span', { class: 'media-count', text: `${count} media` }),
          el('span', { class: 'date', text: relativeDate(p.addedAt) })),
        chips(p)));
  }

  function select(id, label, options, value, key) {
    const node = el('select', { id, 'aria-label': label, onchange: (e) => { saved.filters[key] = e.target.value; saved.rerender(true); } },
      options.map(([v, t]) => el('option', { value: v, text: t })));
    node.value = value;
    return node;
  }

  function register(kind, title) {
    view({
      id: kind, title, nav: 'main', icon: kind, full: false,
      render(main) {
        const f = saved.filters;
        saved.selected.clear(); // a different view or list is a different selection
        let shown = CHUNK, observer, lastKey = null;
        const grid = el('div', { class: 'grid' });
        const empty = el('p', { class: 'empty' });
        const sentinel = el('div', { class: 'sentinel' });
        const ownerSel = kind === 'media' ? select('f-owner', 'Owner', [['', 'All owners']], f.owner, 'owner') : null;
        // Narrow windows hide the sidebar's lists: this menu filters by list instead.
        const listSel = el('select', { id: 'f-list', class: 'list-filter', 'aria-label': 'List',
          onchange: (e) => KeepKeepApp.lists?.select(e.target.value || null) });

        const toolbar = el('div', { class: 'toolbar' },
          el('label', { class: 'search' }, icon('search'),
            el('input', { id: 'search', type: 'search', placeholder: kind === 'media' ? 'Search owner or list' : 'Search name or list', value: f.q, autocomplete: 'off',
              oninput: (e) => { f.q = e.target.value; saved.rerender(true); } })),
          kind === 'media' ? select('f-type', 'Type', [['all', 'All types'], ['posts', 'Posts'], ['reels', 'Reels'], ['stories', 'Stories']], f.type, 'type') : null,
          ownerSel,
          listSel,
          select('f-since', 'Date saved', [['any', 'Any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['year', 'This year']], f.since, 'since'),
          select('f-sort', 'Sort', [['new', 'Newest first'], ['old', 'Oldest first']], f.sort, 'sort'));

        const makeCard = kind === 'media' ? mediaCard : profileCard;

        function fillOwners() {
          if (!ownerSel) return;
          const owners = [...new Set(state.media.map((m) => m.username).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          if (f.owner && !owners.includes(f.owner)) owners.push(f.owner);
          ownerSel.replaceChildren(el('option', { value: '', text: 'All owners' }), ...owners.map((o) => el('option', { value: o, text: o })));
          ownerSel.value = f.owner;
        }

        function fillLists() {
          const lists = state.lists.filter((l) => l.kind === (kind === 'media' ? 'm' : 'p'));
          listSel.replaceChildren(el('option', { value: '', text: 'All lists' }), ...lists.map((l) => el('option', { value: l.id, text: l.name })));
          listSel.value = f.list || '';
        }

        let items = [], painted = 0;
        function paint(full) {
          const y = window.scrollY;
          if (full) { grid.replaceChildren(); painted = 0; }
          grid.append(...items.slice(painted, shown).map(makeCard));
          paintSelection();
          painted = Math.min(shown, items.length);
          empty.hidden = items.length > 0;
          empty.textContent = (kind === 'media' ? state.media : state.profiles).length
            ? 'Nothing matches these filters.'
            : kind === 'media' ? 'No saved media yet.' : 'No saved profiles yet.';
          sentinel.hidden = shown >= items.length;
          observer.disconnect();
          if (!sentinel.hidden) observer.observe(sentinel);
          if (window.scrollY !== y) window.scrollTo(0, y);
        }

        const keyOf = (i) => (kind === 'media' ? 'm:' + i.key : 'p:' + i.username);
        const gridCards = () => [...grid.querySelectorAll('.card[data-key]')];

        function paintSelection() {
          for (const c of gridCards()) {
            const on = saved.selected.has(c.dataset.key);
            c.classList.toggle('selected', on);
            c.querySelector('.select').setAttribute('aria-checked', String(on));
          }
          grid.classList.toggle('selecting', saved.selected.size > 0);
          updateBar();
        }

        function toggle(card, shift) {
          const k = card.dataset.key, all = gridCards().map((c) => c.dataset.key);
          if (shift && lastKey && all.includes(lastKey)) {
            const a = all.indexOf(lastKey), b = all.indexOf(k);
            for (const x of all.slice(Math.min(a, b), Math.max(a, b) + 1)) saved.selected.add(x);
          } else if (saved.selected.has(k)) saved.selected.delete(k);
          else saved.selected.add(k);
          lastKey = k;
          paintSelection();
        }

        grid.addEventListener('click', (e) => {
          const box = e.target.closest('.select');
          if (!box) return;
          e.preventDefault(); e.stopPropagation();
          toggle(box.closest('.card'), e.shiftKey);
        });
        grid.addEventListener('pointerdown', (e) => {
          const card = e.target.closest('.card[data-key]');
          if (card && !e.target.closest('.select')) startCardDrag(e, card);
        });

        observer = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting) && shown < items.length) { shown += CHUNK; paint(false); }
        }, { rootMargin: '800px' });

        current = {
          kind,
          update(filtersChanged) {
            if (!main.isConnected || main.dataset.view !== kind) return;
            if (filtersChanged === true) { shown = CHUNK; window.scrollTo(0, 0); }
            fillOwners();
            fillLists();
            if (kind === 'profiles') {
              mediaCounts = new Map();
              for (const m of state.media) mediaCounts.set(m.username, (mediaCounts.get(m.username) || 0) + 1);
            }
            items = filterItems(kind);
            // Items no longer shown (filtered out, left the list) leave the selection.
            const shownKeys = new Set(items.map(keyOf));
            for (const k of [...saved.selected]) if (!shownKeys.has(k)) saved.selected.delete(k);
            paint(true);
          },
          keys: () => filterItems(kind).map(keyOf),
          paintSelection,
        };

        main.append(el('h1', { text: title }), toolbar, grid, sentinel, empty);
        current.update(true);
      },
    });
  }

  // ---- Selection: bulk bar, picker, Undo toast, card drag, keyboard ----
  const bulkKind = () => (current?.kind === 'profiles' ? 'p' : 'm');
  const dock = el('div', { id: 'bulk-dock' });
  const toast = el('div', { id: 'toast', role: 'status', hidden: true });
  const count = el('span', { class: 'count' });
  const picker = el('div', { class: 'picker', hidden: true });
  // Narrow windows show only the icons; the title names the button.
  const barButton = (id, name, label, attrs) => el('button', { id, type: 'button', title: label, ...attrs }, icon(name), el('span', { class: 'label', text: label }));
  const addBtn = barButton('bulk-add', 'plus', 'Add to list', { onclick: (e) => { e.stopPropagation(); picker.hidden = !picker.hidden; fillPicker(); } });
  const outBtn = barButton('bulk-out', 'minus', 'Remove from list', { onclick: () => bulkOut() });
  const dlBtn = barButton('bulk-download', 'download', 'Download', { onclick: () => saved.bulkDownload?.([...saved.selected]) });
  const rmBtn = barButton('bulk-remove', 'trash', 'Remove', { class: 'danger', onclick: () => bulkRemove() });
  const bar = el('div', { id: 'bulk', hidden: true },
    count, el('span', { class: 'sep' }), el('span', { class: 'picker-wrap' }, addBtn, picker), outBtn, dlBtn, rmBtn,
    el('button', { id: 'bulk-clear', type: 'button', class: 'clear', title: 'Clear selection', 'aria-label': 'Clear selection', onclick: () => clearSelection() }, icon('close')));
  dock.append(toast, bar);
  document.body.append(dock);

  function recordsOf(keys) {
    const byKey = new Map([...state.media.map((m) => ['m:' + m.key, m]), ...state.profiles.map((p) => ['p:' + p.username, p])]);
    return keys.map((k) => byKey.get(k)).filter(Boolean);
  }

  // The bar slides up from the bottom edge when something is selected and
  // slides back down when the selection ends (then it's hidden for real).
  let barTimer;
  function showBar(show) {
    clearTimeout(barTimer);
    if (show) {
      if (bar.hidden || bar.classList.contains('leaving')) {
        bar.classList.remove('leaving');
        bar.hidden = false;
      }
      return;
    }
    if (bar.hidden) return;
    picker.hidden = true;
    bar.classList.add('leaving');
    barTimer = setTimeout(() => {
      bar.hidden = true;
      bar.classList.remove('leaving');
    }, BAR_OUT_MS);
  }

  const BAR_OUT_MS = 220;
  function updateBar() {
    const n = saved.selected.size;
    showBar(!!n && !!current);
    count.textContent = `${n} selected`;
    outBtn.hidden = !saved.filters.list;
    dlBtn.hidden = current?.kind !== 'media';
    if (!picker.hidden) fillPicker();
  }

  function clearSelection() { saved.selected.clear(); current?.paintSelection(); }

  function fillPicker() {
    const lists = state.lists.filter((l) => l.kind === bulkKind());
    const recs = recordsOf([...saved.selected]);
    picker.replaceChildren(...(lists.length ? lists.map((l) => {
      const all = recs.length > 0 && recs.every((r) => (r.lists || []).includes(l.id));
      return el('button', { class: 'item' + (all ? ' on' : ''), type: 'button', 'data-id': l.id, onclick: () => bulkList(l.id, !all) },
        el('span', { class: 'tick' }, all ? icon('check') : null), el('span', { class: 'name', text: l.name }));
    }) : [el('div', { class: 'none', text: 'No lists yet. Create one in the sidebar.' })]));
  }

  // A batch is one storage read and one write; the bar shows it is working meanwhile.
  async function busy(work) {
    bar.classList.add('busy');
    bar.setAttribute('aria-busy', 'true');
    try { return await work(); } finally { bar.classList.remove('busy'); bar.removeAttribute('aria-busy'); }
  }
  const bulkList = (id, on) => busy(() => KeepKeep.setInListMany([...saved.selected], id, on));
  async function bulkOut() {
    const id = saved.filters.list;
    if (id) await bulkList(id, false);
  }

  let removed = [], toastTimer;
  function showToast() {
    clearTimeout(toastTimer);
    toast.replaceChildren(el('span', { text: `Removed ${removed.length}` }), el('span', { class: 'dot', text: '·' }),
      el('button', { type: 'button', text: 'Undo', onclick: undo }));
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; removed = []; }, 6000);
  }
  // Removals made while the Undo toast is up add to it: Undo brings all of them back.
  async function bulkRemove() {
    const keys = [...saved.selected];
    if (!keys.length) return;
    clearTimeout(toastTimer); // the old toast must not expire (and forget) mid-batch
    saved.selected.clear();
    current?.paintSelection();
    removed.push(...await busy(() => KeepKeep.removeMany(keys)));
    if (removed.length) showToast();
  }
  async function undo() {
    const back = removed; removed = [];
    clearTimeout(toastTimer); toast.hidden = true;
    await KeepKeep.restoreMany(back);
  }

  // Another view (Settings, About...): the selection and its bar belong to the grid.
  on('route', () => {
    const view = document.querySelector('main')?.dataset.view;
    if (view === current?.kind) return; // the grid's own render resets it
    if (cardDrag) cancelDrag();
    current = null;
    saved.selected.clear();
    updateBar();
  });

  // Items removed or deleted elsewhere leave the selection.
  on('change', () => {
    const have = new Set([...state.media.map((m) => 'm:' + m.key), ...state.profiles.map((p) => 'p:' + p.username)]);
    for (const k of [...saved.selected]) if (!have.has(k)) saved.selected.delete(k);
  });

  document.addEventListener('click', (e) => { if (!picker.hidden && !e.target.closest('.picker-wrap')) picker.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (!current || document.querySelector('main')?.dataset.view !== current.kind) return;
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'a' && !typing) {
      e.preventDefault();
      for (const k of current.keys()) saved.selected.add(k);
      current.paintSelection();
    } else if (e.key === 'Escape' && !typing) {
      if (cardDrag) cancelDrag();
      else if (!picker.hidden) picker.hidden = true;
      else if (saved.selected.size) clearSelection();
    }
  });

  // Pointer-based drag of cards onto a sidebar list (never HTML drag and drop).
  const DRAG_FROM = 6;
  let cardDrag = null, hot = null;
  function cancelDrag() { if (cardDrag) cardDrag.finish(false); }
  function startCardDrag(e, card) {
    if (e.button !== 0 || e.pointerType === 'touch' || cardDrag) return;
    const s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, card, ghost: null, drop: null };
    const lit = (id) => {
      const node = id && document.querySelector(`.lists .list[data-id="${CSS.escape(id)}"]`);
      if (hot && hot !== node) hot.classList.remove('drop');
      hot = node || null;
      if (hot) hot.classList.add('drop');
    };
    const move = (e) => {
      if (e.pointerId !== s.id) return;
      if (!s.moved) {
        if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < DRAG_FROM) return;
        s.moved = true; cardDrag = s;
        const keys = saved.selected.has(card.dataset.key) ? [...saved.selected] : [card.dataset.key];
        s.keys = keys;
        s.ghost = el('div', { class: 'drag-ghost', text: keys.length === 1 ? '1 item' : `${keys.length} items` });
        document.body.append(s.ghost);
        document.body.classList.add('dragging-card');
        const dragged = new Set(keys);
        for (const c of allCards()) if (dragged.has(c.dataset.key)) c.classList.add('dragging');
        picker.hidden = true;
      }
      s.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      s.drop = KeepKeepApp.lists?.dropTarget(document.elementFromPoint(e.clientX, e.clientY));
      lit(s.drop);
    };
    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    s.finish = (drop) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cardDrag = null;
      if (!s.moved) return;
      lit(null);
      s.ghost.remove();
      document.body.classList.remove('dragging-card');
      for (const c of document.querySelectorAll('.card.dragging')) c.classList.remove('dragging');
      window.addEventListener('click', swallow, true); // the click that ends a drag must not open the link
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (drop && s.drop) KeepKeep.setInListMany(s.keys, s.drop, true);
    };
    const up = (e) => { if (e.pointerId === s.id) s.finish(true); };
    const cancel = (e) => { if (e.pointerId === s.id) s.finish(false); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }
  const allCards = () => [...document.querySelectorAll('.grid .card[data-key]')];

  register('media', 'Media');
  register('profiles', 'Profiles');
  on('change', () => current?.update());
})();
