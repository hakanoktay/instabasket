// Sidebar lists: the lists of the kind on screen (media view -> 'm', profiles
// view -> 'p') with counts. Click to filter the grid, + New list, rename and
// delete on hover, drag to reorder (pointer events, like the card in panel.js).
(() => {
  const { el, icon, state, on } = KeepKeepApp;
  const saved = KeepKeepApp.saved;
  const DRAG_FROM = 5; // px of movement before a press becomes a drag
  const MAX = 40; // same as the popup
  let kind = null, editing = null, drag = null; // editing: list id or 'new'

  const kindNow = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1).split('/')[0]); } catch { id = 'media'; }
    return id === 'profiles' ? 'p' : id === 'media' || id === '' ? 'm' : null;
  };
  const records = () => (kind === 'p' ? state.profiles : state.media);
  const container = () => document.getElementById('lists');

  function select(id) {
    if (saved.filters.list === id) return;
    saved.filters.list = id;
    saved.selected.clear();
    saved.rerender(true);
    render();
  }

  function input(value, done) {
    let finished = false;
    const finish = (v) => { if (finished) return; finished = true; editing = null; if (v) done(v); else render(); };
    return el('input', { type: 'text', maxlength: MAX, value, placeholder: 'List name', 'aria-label': 'List name',
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.target.value.trim().slice(0, MAX));
        else if (e.key === 'Escape') finish('');
      },
      onblur: () => finish(''),
      onpointerdown: (e) => e.stopPropagation() });
  }

  async function create(name) {
    const list = await KeepKeep.createList(name, kind);
    state.lists = [...state.lists, list];
    render();
  }
  async function rename(list, name) {
    if (name === list.name) return render();
    state.lists = state.lists.map((l) => (l.id === list.id ? { ...l, name } : l));
    render();
    await KeepKeep.renameList(list.id, name);
  }
  async function remove(list) {
    if (!confirm(`Delete the list "${list.name}"? Its items stay saved.`)) return;
    await KeepKeep.deleteList(list.id);
    state.lists = state.lists.filter((l) => l.id !== list.id);
    for (const r of [...state.media, ...state.profiles]) if (r.lists) r.lists = r.lists.filter((x) => x !== list.id);
    dropMissing();
    render();
  }

  // The selected list is gone (deleted here or elsewhere): back to All.
  function dropMissing() {
    const f = saved.filters;
    if (f.list && !state.lists.some((l) => l.id === f.list)) { f.list = null; saved.selected.clear(); saved.rerender(true); }
  }

  function row(list) {
    const n = records().filter((r) => (r.lists || []).includes(list.id)).length;
    const node = el('div', { class: 'list' + (saved.filters.list === list.id ? ' on' : ''), 'data-id': list.id, tabindex: '0', role: 'button',
      onclick: () => { if (!drag?.moved) select(list.id); },
      onkeydown: (e) => { if (e.target === node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(list.id); } },
      onpointerdown: (e) => startSort(e, node) });
    if (editing === list.id) {
      node.append(input(list.name, (v) => rename(list, v)));
      return node;
    }
    node.append(
      el('span', { class: 'name', text: list.name }),
      el('span', { class: 'count', text: String(n) }),
      el('button', { class: 'rename', title: 'Rename', 'aria-label': `Rename ${list.name}`,
        onpointerdown: (e) => e.stopPropagation(),
        onclick: (e) => { e.stopPropagation(); editing = list.id; render(); } }, icon('pencil')),
      el('button', { class: 'delete', title: 'Delete', 'aria-label': `Delete ${list.name}`,
        onpointerdown: (e) => e.stopPropagation(),
        onclick: (e) => { e.stopPropagation(); remove(list); } }, icon('trash')));
    return node;
  }

  function render() {
    const box = container();
    if (!box) return;
    const wasKind = kind;
    kind = kindNow();
    if (kind !== wasKind && wasKind !== null && kind !== null) {
      saved.filters.list = null; saved.selected.clear();
    }
    if (!kind) { box.replaceChildren(); return; }
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && kind === wasKind && editing) return; // don't pull the input away
    const lists = state.lists.filter((l) => l.kind === kind);
    const all = el('div', { class: 'list all' + (saved.filters.list ? '' : ' on'), tabindex: '0', role: 'button',
      onclick: () => select(null),
      onkeydown: (e) => { if (e.target === all && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(null); } } },
      el('span', { class: 'label', text: 'All' }), el('span', { class: 'count', text: String(records().length) }));
    const rows = lists.map(row);
    const tail = editing === 'new'
      ? el('div', { class: 'list editing' }, input('', create))
      : el('button', { id: 'new-list', class: 'new', onclick: () => { editing = 'new'; render(); } }, icon('plus'), el('span', { text: 'New list' }));
    box.replaceChildren(
      el('div', { class: 'lists-title', text: kind === 'p' ? 'Profile lists' : 'Media lists' }),
      all, ...rows, tail);
    const field = box.querySelector('input');
    if (field) { field.focus(); field.select(); }
  }

  // ---- Reordering by dragging a row (vertical only) ----
  function startSort(e, node) {
    if (e.button !== 0 || drag) return;
    const rows = [...container().querySelectorAll('.list[data-id]')];
    if (rows.length < 2) return;
    const s = { id: e.pointerId, y0: e.clientY, moved: false, rows, from: rows.indexOf(node), to: rows.indexOf(node) };
    const move = (e) => {
      if (e.pointerId !== s.id) return;
      const dy = e.clientY - s.y0;
      if (!s.moved) {
        if (Math.abs(dy) < DRAG_FROM) return;
        s.moved = true;
        drag = s;
        s.tops = rows.map((r) => r.getBoundingClientRect().top);
        s.mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
        node.setPointerCapture(s.id);
        container().classList.add('sorting');
        node.classList.add('dragging');
      }
      node.style.transform = `translateY(${dy}px)`;
      const mid = s.mids[s.from] + dy;
      // closest slot to the dragged row's centre
      const to = s.mids.reduce((best, m, i) => (Math.abs(m - mid) < Math.abs(s.mids[best] - mid) ? i : best), 0);
      s.to = to;
      rows.forEach((r, i) => {
        if (r === node) return;
        let shift = 0;
        if (s.from < to && i > s.from && i <= to) shift = s.tops[i - 1] - s.tops[i];
        if (s.from > to && i >= to && i < s.from) shift = s.tops[i + 1] - s.tops[i];
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const end = async (e) => {
      if (e.pointerId !== s.id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!s.moved) return;
      setTimeout(() => { drag = null; }, 0); // swallows the click that follows a drag
      const box = container();
      const order = rows.map((r) => r.dataset.id);
      if (e.type === 'pointerup' && s.to !== s.from) {
        order.splice(s.to, 0, order.splice(s.from, 1)[0]);
        // Put the rows in their new places without a flash; storage catches up.
        const anchor = rows[rows.length - 1].nextSibling;
        const byId = new Map(rows.map((r) => [r.dataset.id, r]));
        for (const r of rows) { r.style.transition = 'none'; r.style.transform = ''; }
        for (const id of order) box.insertBefore(byId.get(id), anchor);
        void box.offsetHeight;
        for (const r of rows) r.style.transition = '';
        const moved = state.lists.filter((l) => l.kind === kind);
        const queue = order.map((id) => moved.find((l) => l.id === id));
        state.lists = state.lists.map((l) => (l.kind === kind ? queue.shift() : l));
        await KeepKeep.reorderLists(kind, order);
      } else {
        for (const r of rows) r.style.transform = '';
      }
      box.classList.remove('sorting');
      node.classList.remove('dragging');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  KeepKeepApp.lists = {
    // The list id under an element (a sidebar list row), or null.
    dropTarget: (node) => node?.closest?.('.lists .list[data-id]')?.dataset.id ?? null,
  };

  on('change', () => { dropMissing(); render(); });
  window.addEventListener('hashchange', () => { editing = null; render(); });
})();
