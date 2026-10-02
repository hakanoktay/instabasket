// Saved media and saved profiles: grids with search, filters, sort, and chunked
// rendering. KeepKeepApp.saved is shared with the lists and selection code.
(() => {
  const { el, icon, view, state, on } = KeepKeepApp;
  const DAY = 86400000;
  const CHUNK = 60;
  const TYPE_LABELS = { post: 'Post', reel: 'Reel', album: 'Album', video: 'Video', story: 'Story' };

  const saved = KeepKeepApp.saved = {
    selected: new Set(),
    filters: { q: '', type: 'all', owner: '', since: 'any', sort: 'new', list: null },
    rerender() { current?.update(); },
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
      el('div', { class: 'thumb' }, preview, type),
      el('div', { class: 'meta' },
        el('div', { class: 'row' },
          el('span', { class: 'owner' + (m.username ? '' : ' unknown'), text: m.username ? '@' + m.username : 'Owner not found' }),
          el('span', { class: 'date', text: relativeDate(m.addedAt) })),
        chips(m)));
  }

  function profileCard(p) {
    const user = state.users[p.username] || {};
    const count = state.media.filter((m) => m.username === p.username).length;
    const pic = user.pic
      ? el('img', { class: 'pic', src: user.pic, alt: '', draggable: 'false' })
      : el('span', { class: 'pic', text: (p.username || '?')[0].toUpperCase() });
    return el('div', { class: 'card profile', 'data-key': 'p:' + p.username },
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
        let shown = CHUNK, observer;
        const grid = el('div', { class: 'grid' });
        const empty = el('p', { class: 'empty' });
        const sentinel = el('div', { class: 'sentinel' });
        const ownerSel = kind === 'media' ? select('f-owner', 'Owner', [['', 'All owners']], f.owner, 'owner') : null;

        const toolbar = el('div', { class: 'toolbar' },
          el('label', { class: 'search' }, icon('search'),
            el('input', { id: 'search', type: 'search', placeholder: kind === 'media' ? 'Search owner or list' : 'Search name or list', value: f.q, autocomplete: 'off',
              oninput: (e) => { f.q = e.target.value; saved.rerender(true); } })),
          kind === 'media' ? select('f-type', 'Type', [['all', 'All types'], ['posts', 'Posts'], ['reels', 'Reels'], ['stories', 'Stories']], f.type, 'type') : null,
          ownerSel,
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

        let items = [];
        function paint() {
          const y = window.scrollY;
          grid.replaceChildren(...items.slice(0, shown).map(makeCard));
          empty.hidden = items.length > 0;
          empty.textContent = (kind === 'media' ? state.media : state.profiles).length
            ? 'Nothing matches these filters.'
            : kind === 'media' ? 'No saved media yet.' : 'No saved profiles yet.';
          sentinel.hidden = shown >= items.length;
          observer.disconnect();
          if (!sentinel.hidden) observer.observe(sentinel);
          if (window.scrollY !== y) window.scrollTo(0, y);
        }

        observer = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting) && shown < items.length) { shown += CHUNK; paint(); }
        }, { rootMargin: '800px' });

        current = {
          kind,
          update(filtersChanged) {
            if (!main.isConnected || main.dataset.view !== kind) return;
            if (filtersChanged === true) shown = CHUNK;
            fillOwners();
            items = filterItems(kind);
            paint();
          },
        };

        main.append(el('h1', { text: title }), toolbar, grid, sentinel, empty);
        current.update(true);
      },
    });
  }

  register('media', 'Media');
  register('profiles', 'Profiles');
  on('change', () => current?.update());
})();
