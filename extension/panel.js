// The card in the top-right corner of Instagram: the drop target while dragging,
// then the result of adding (with the list picker) or removing (with undo).
// Styled after Instagram's own menus and buttons, in light and dark mode.
var KeepKeepPanel = (() => {
  const RESULT_MS = 8000; // how long the card stays after adding (paused while hovered)
  const SHORT_MS = 2500; // errors and "removed"
  const SEARCH_FROM = 7; // show a search field when there are this many lists
  let host, card, els, onDrop, keyHandler, current;

  // The KeepKeep logo, inline (pages can't load extension files without extra permissions).
  const LOGO = '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="kk-logo" x1="486.4" y1="0" x2="-14.9" y2="908.9" gradientUnits="userSpaceOnUse"><stop offset="0.365" stop-color="#8119B5"/><stop offset="0.849" stop-color="#450B62"/></linearGradient></defs><rect width="1024" height="1024" rx="220" fill="url(#kk-logo)"/><path fill="#fff" d="M518.609 839.484H194V701.984H256.5V355.5H194V218H506.109V355.5H456.5V496.906L559.625 355.5V218H802.984V355.5H749.078L625.25 505.891V511.359C667.438 511.359 700.51 518.651 724.469 533.234C748.427 547.557 760.406 572.557 760.406 608.234V671.516C760.406 679.589 762.62 686.75 767.047 693C771.734 698.99 778.115 701.984 786.188 701.984H830.719V839.484H687.75C600.25 839.484 556.5 799.51 556.5 719.562V651.594C556.5 638.312 552.203 625.292 543.609 612.531C535.016 599.51 524.859 593 513.141 593H456.5V701.984H518.609V839.484Z"/></svg>';

  const ICONS = {
    basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1.6 9.1a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M2.5 10h19M8 10l3-6M16 10l-3-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .card {
      --bg: #fff; --elevated: #fafafa; --text: #000; --muted: #737373; --line: #dbdbdb;
      --secondary: #efefef; --secondary-hover: #e4dde9;
      --brand: #8119b5; --brand-hover: #450b62; --brand-tint: rgba(129, 25, 181, 0.07);
      --red: #ed4956; --shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(129, 25, 181, 0.06);
      position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 340px;
      max-height: calc(100vh - 32px); display: flex; flex-direction: column;
      background: var(--bg); color: var(--text); border-radius: 12px; box-shadow: var(--shadow);
      font: 400 14px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden; animation: in 0.18s ease-out;
    }
    .card.dark {
      --bg: #262626; --elevated: #363636; --text: #f5f5f5; --muted: #a8a8a8; --line: #363636;
      --secondary: #363636; --secondary-hover: #4a4a4a; --shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      --brand: #aa56d5; --brand-hover: #c07fe0; --brand-tint: rgba(170, 86, 213, 0.14);
    }
    @keyframes in { from { opacity: 0; transform: translateY(-8px) scale(0.98); } }
    svg { display: block; width: 100%; height: 100%; }
    button { font: inherit; color: inherit; cursor: pointer; }

    /* Drop target while dragging */
    .drop {
      display: none; margin: 12px; padding: 22px 12px; border-radius: 8px; text-align: center;
      border: 2px dashed var(--line); color: var(--muted); font-weight: 600; transition: all 0.12s;
    }
    .drop .icon { width: 36px; height: 36px; margin: 0 auto 8px; color: var(--text); }
    .card.dropping .drop { display: block; }
    .card.dropping .head, .card.dropping .picker, .card.dropping .progress { display: none; }
    .card.over .drop { border-color: var(--brand); border-style: solid; background: var(--brand-tint); color: var(--brand); }
    .card.over .drop .icon { color: var(--brand); }

    /* Result row */
    .head { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; }
    .thumb { flex: none; width: 44px; height: 44px; border-radius: 4px; object-fit: cover; background: var(--secondary); }
    .thumb.round { border-radius: 50%; }
    .thumb.icon { padding: 0; background: none; }
    .text { flex: 1; min-width: 0; }
    .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .sub b { color: var(--text); font-weight: 600; }
    /* The result is stated in words, as in Instagram's own toasts; errors in red. */
    .card.bad .title { color: var(--red); }
    /* Instagram's grey spinner while fetching */
    .spinner { flex: none; width: 44px; height: 44px; display: grid; place-items: center; }
    .spinner span {
      width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid var(--secondary); border-top-color: var(--muted);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .text-btn { border: none; background: none; padding: 4px 6px; font-weight: 600; color: var(--brand); }
    .text-btn:hover { color: var(--text); }
    .text-btn.danger { color: var(--red); }
    .close { flex: none; width: 28px; height: 28px; padding: 6px; border: none; background: none; border-radius: 50%; color: var(--muted); }
    .close:hover { background: var(--secondary); color: var(--text); }

    /* List picker, opened with an animation after adding */
    .picker { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.32s cubic-bezier(0.2, 0.8, 0.2, 1); min-height: 0; }
    .picker.open { grid-template-rows: 1fr; }
    .picker-inner { overflow: hidden; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
    .picker-top { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
    .picker-top .label { flex: 1; font-weight: 600; }
    .picker-top .hint { color: var(--muted); font-size: 12px; }
    .search { display: flex; align-items: center; gap: 8px; margin: 0 12px 8px; padding: 0 10px; height: 36px; border-radius: 8px; background: var(--secondary); color: var(--muted); }
    .search .i { width: 16px; height: 16px; flex: none; }
    .search input { flex: 1; min-width: 0; border: none; outline: none; background: none; font: inherit; color: var(--text); }
    .grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px 12px 12px;
      max-height: 244px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;
      /* Fade the edges when the list scrolls */
      mask-image: linear-gradient(to bottom, transparent 0, #000 6px, #000 calc(100% - 14px), transparent 100%);
    }
    .box {
      position: relative; display: flex; flex-direction: column; justify-content: center; gap: 2px;
      min-height: 64px; padding: 10px 34px 10px 12px; text-align: left; border-radius: 8px;
      border: 1px solid var(--line); background: var(--bg);
      transition: border-color 0.12s, background 0.12s;
    }
    /* Boxes slide in only when the picker opens, not on every re-render. */
    .grid.entering .box { opacity: 0; transform: translateY(6px); animation: box-in 0.28s ease-out forwards; }
    @keyframes box-in { to { opacity: 1; transform: none; } }
    .box:hover { background: var(--elevated); }
    .box .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .box .count { color: var(--muted); font-size: 12px; }
    .box .tick {
      position: absolute; top: 50%; right: 10px; width: 20px; height: 20px; margin-top: -10px; padding: 3px;
      border-radius: 50%; border: 1.5px solid var(--line); color: transparent; transition: all 0.12s;
    }
    .box .key {
      position: absolute; top: 6px; right: 8px; font-size: 10px; line-height: 1; color: var(--muted); display: none;
    }
    /* Selected: brand border and tint, with a filled circle and white check. */
    .box.on { border-color: var(--brand); background: var(--brand-tint); }
    .box.on .tick { background: var(--brand); border-color: var(--brand); color: #fff; }
    .box.new { align-items: center; justify-content: center; flex-direction: row; gap: 6px; padding: 10px; border-style: dashed; color: var(--muted); font-weight: 600; }
    .box.new .i { width: 18px; height: 18px; }
    .box.new input { width: 100%; border: none; outline: none; background: none; font: inherit; font-weight: 600; color: var(--text); text-align: center; }
    .empty { grid-column: 1 / -1; color: var(--muted); text-align: center; padding: 8px 0; font-size: 12px; }

    /* Countdown until the card closes; pauses on hover */
    .progress { height: 3px; background: transparent; flex: none; }
    .bar { height: 100%; background: linear-gradient(90deg, #450b62, #8119b5 50%, #aa56d5); transform-origin: left; }
    .bar:not(.run) { visibility: hidden; }
    .bar.run { animation: countdown var(--ms) linear forwards; }
    .card:hover .bar.run, .card:focus-within .bar.run { animation-play-state: paused; }
    @keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  `;

  function isDarkPage() {
    // Instagram's own theme, read from the page background.
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!c || (c[3] !== undefined && +c[3] === 0)) return matchMedia('(prefers-color-scheme: dark)').matches;
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 128;
  }

  function build() {
    host = document.createElement('div');
    host.id = 'keepkeep-host';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="card">
        <div class="drop"><div class="icon">${ICONS.basket}</div>Drop to add to basket</div>
        <div class="head">
          <div class="thumb-slot"></div>
          <div class="text"><div class="title"></div><div class="sub"></div></div>
          <div class="action"></div>
          <button class="close" title="Close">${ICONS.close}</button>
        </div>
        <div class="picker"><div class="picker-inner">
          <div class="picker-top"><span class="label">Add to a list</span><span class="hint"></span></div>
          <label class="search" hidden><span class="i">${ICONS.search}</span><input placeholder="Search lists"></label>
          <div class="grid"></div>
        </div></div>
        <div class="progress"><div class="bar"></div></div>
      </div>`;
    card = root.querySelector('.card');
    els = Object.fromEntries(['thumb-slot', 'title', 'sub', 'action', 'picker', 'search', 'grid', 'bar', 'hint']
      .map((c) => [c, root.querySelector('.' + c)]));
    els.searchInput = els.search.querySelector('input');

    root.querySelector('.close').addEventListener('click', hide);
    els.bar.addEventListener('animationend', hide);
    els.searchInput.addEventListener('input', () => renderBoxes());

    card.addEventListener('dragenter', (e) => { e.preventDefault(); card.classList.add('over'); });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      card.classList.add('over');
    });
    card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('over'); });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('over');
      onDrop?.(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
    });
  }

  function mount(state) {
    if (!host) build();
    if (!host.isConnected) document.documentElement.appendChild(host);
    card.className = `card ${state}${isDarkPage() ? ' dark' : ''}`;
    stopTimer();
    setKeys(false);
  }

  function hide() {
    current = null;
    setKeys(false);
    host?.remove();
  }

  function startTimer(ms) {
    els.bar.style.setProperty('--ms', ms + 'ms');
    els.bar.classList.remove('run');
    void els.bar.offsetWidth; // restart the animation
    els.bar.classList.add('run');
  }

  function stopTimer() {
    els?.bar.classList.remove('run');
  }

  function setThumb(src, round) {
    const slot = els['thumb-slot'];
    if (src) {
      const img = Object.assign(document.createElement('img'), { className: 'thumb' + (round ? ' round' : ''), src });
      img.onerror = () => setThumb(null, round); // expired or blocked image: show the logo instead
      slot.replaceChildren(img);
    } else {
      const div = document.createElement('div');
      div.className = 'thumb icon' + (round ? ' round' : '');
      div.innerHTML = LOGO;
      slot.replaceChildren(div);
    }
  }

  function setHead(title, sub) {
    els.title.textContent = title;
    els.sub.replaceChildren(...(Array.isArray(sub) ? sub : [sub || '']));
    els.action.replaceChildren();
  }

  function closePicker() {
    els.picker.classList.remove('open');
    els.grid.replaceChildren();
  }

  // ---- States ----

  // `drop` is called with the dropped URL.
  function showDrop(drop) {
    onDrop = drop;
    if (card?.classList.contains('dropping') && host.isConnected) return;
    mount('dropping');
  }

  function isDropping() {
    return !!host?.isConnected && card.classList.contains('dropping');
  }

  function showBusy(title = 'Adding…', sub = 'Fetching details from Instagram') {
    // Adding again while the picker is on screen: keep it open until the new
    // result replaces its boxes, rather than animating it closed and open again.
    const keepPicker = !!host?.isConnected && els.picker.classList.contains('open') && !card.classList.contains('dropping');
    mount('busy');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.innerHTML = '<span></span>';
    els['thumb-slot'].replaceChildren(spinner);
    setHead(title, sub);
    if (keepPicker) current = null; // the boxes belong to the previous item: clicks and 1–9 do nothing
    else closePicker();
  }

  // A short notice with a thumbnail, e.g. after starting downloads.
  function showInfo(title, sub, thumb) {
    mount('done');
    setThumb(thumb, false);
    setHead(title, sub);
    closePicker();
    startTimer(4000);
  }

  function showError(text) {
    mount('bad');
    setThumb(null);
    setHead(text, '');
    closePicker();
    startTimer(SHORT_MS);
  }

  // After adding (or finding it already saved): the item, then the list boxes.
  async function showResult(result, onRemove) {
    const { recordKey } = result;
    const [record, lists, all] = await Promise.all([
      KeepKeep.get(recordKey), KeepKeep.getLists(recordKey[0]), chrome.storage.local.get(null),
    ]);
    if (!record) return showError('Something went wrong');
    const isProfile = recordKey.startsWith('p:');
    const user = record.username && all['u:' + record.username];

    mount(result.state === 'dup' ? 'dup' : 'done');
    setThumb(isProfile ? user?.pic : record.thumb, isProfile);
    const b = (t) => Object.assign(document.createElement('b'), { textContent: t });
    if (isProfile) {
      setHead('@' + record.username, [result.state === 'dup' ? 'Already in ' : 'Saved to ', b('Profiles')]);
    } else {
      const owner = record.username ? `@${record.username}` : 'Media';
      setHead(owner, [result.state === 'dup' ? 'Already in ' : 'Saved to ', b('Media')]);
    }
    if (onRemove) {
      const remove = Object.assign(document.createElement('button'), { className: 'text-btn danger', textContent: 'Remove' });
      remove.addEventListener('click', onRemove);
      els.action.replaceChildren(remove);
    }

    // Counts per list, for the boxes.
    const counts = {};
    for (const [k, v] of Object.entries(all)) {
      if (/^[pm]:/.test(k)) for (const id of v.lists || []) counts[id] = (counts[id] || 0) + 1;
    }
    current = { recordKey, record, lists, counts, inLists: new Set(record.lists || []) };
    els.searchInput.value = '';
    els.search.hidden = lists.length < SEARCH_FROM;
    els.hint.textContent = lists.length ? 'Press 1–9' : '';
    // Boxes slide in when the picker opens; if it stayed open, they just update.
    const entering = !els.picker.classList.contains('open');
    els.grid.classList.toggle('entering', entering);
    renderBoxes();
    if (entering) setTimeout(() => els.grid.classList.remove('entering'), 700);
    requestAnimationFrame(() => els.picker.classList.add('open'));
    setKeys(true);
    startTimer(RESULT_MS);
  }

  function renderBoxes() {
    if (!current) return;
    const q = els.searchInput.value.trim().toLowerCase();
    const shown = current.lists.filter((l) => !q || l.name.toLowerCase().includes(q));
    current.shown = shown;

    const boxes = shown.map((list, i) => {
      const box = document.createElement('button');
      box.className = 'box' + (current.inLists.has(list.id) ? ' on' : '');
      box.style.animationDelay = `${Math.min(i, 8) * 30}ms`;
      box.innerHTML = `<span class="name"></span><span class="count"></span><span class="tick">${ICONS.check}</span>` +
        (i < 9 ? `<span class="key">${i + 1}</span>` : '');
      box.querySelector('.name').textContent = list.name;
      const n = current.counts[list.id] || 0;
      box.querySelector('.count').textContent = `${n} item${n === 1 ? '' : 's'}`;
      box.title = list.name;
      box.addEventListener('click', () => toggle(list.id));
      return box;
    });

    const add = document.createElement('button');
    add.className = 'box new';
    add.style.animationDelay = `${Math.min(shown.length, 8) * 30}ms`;
    add.innerHTML = `<span class="i">${ICONS.plus}</span><span>New list</span>`;
    add.addEventListener('click', () => {
      if (add.querySelector('input')) return;
      const input = Object.assign(document.createElement('input'), { placeholder: 'List name', maxLength: 40 });
      input.value = q && !shown.length ? els.searchInput.value.trim() : '';
      add.replaceChildren(input);
      input.focus();
      input.addEventListener('keydown', async (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') return renderBoxes();
        if (e.key !== 'Enter' || !input.value.trim()) return;
        const list = await KeepKeep.createList(input.value, current.recordKey[0]);
        current.lists.push(list);
        els.searchInput.value = '';
        els.search.hidden = current.lists.length < SEARCH_FROM;
        await toggle(list.id);
      });
    });

    const empty = !shown.length && q ? [Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No matching lists' })] : [];
    els.grid.replaceChildren(...boxes, ...empty, add);
    // Number hints only make sense while nothing is being typed.
    for (const k of els.grid.querySelectorAll('.key')) k.style.display = q ? 'none' : 'block';
  }

  async function toggle(listId) {
    if (!current) return;
    const on = !current.inLists.has(listId);
    if (on) current.inLists.add(listId);
    else current.inLists.delete(listId);
    current.counts[listId] = (current.counts[listId] || 0) + (on ? 1 : -1);
    renderBoxes();
    startTimer(RESULT_MS); // interacting keeps the card open
    await KeepKeep.setInList(current.recordKey, listId, on);
  }

  // 1–9 toggle the first nine lists while the picker is open.
  function setKeys(on) {
    if (keyHandler) removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
    if (!on) return;
    keyHandler = (e) => {
      if (!current || e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
      const t = e.composedPath()[0];
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const list = current.shown?.[+e.key - 1];
      if (!list) return;
      e.preventDefault();
      e.stopPropagation();
      toggle(list.id);
    };
    addEventListener('keydown', keyHandler, true);
  }

  // After removing: what was removed, with an undo button.
  function showRemoved(title, thumb, round, onUndo) {
    mount('removed');
    setThumb(thumb, round);
    setHead(title, 'Removed from basket');
    closePicker();
    const undo = Object.assign(document.createElement('button'), { className: 'text-btn', textContent: 'Undo' });
    undo.addEventListener('click', onUndo);
    els.action.replaceChildren(undo);
    startTimer(5000);
  }

  // ---- Download balloons ----
  // A stack on the right: one balloon with the overall progress, then one per
  // photo / video with its thumbnail and progress. They leave on their own.

  const DL_STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .stack {
      --bg: #fff; --text: #000; --muted: #737373; --secondary: #efefef; --brand: #8119b5; --green: #58c322; --red: #ed4956;
      --shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      position: fixed; top: 16px; right: 16px; z-index: 2147483646; width: 320px; max-height: calc(100vh - 32px);
      display: flex; flex-direction: column; gap: 8px; overflow-y: auto; scrollbar-width: none; pointer-events: none;
      font: 400 14px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--text);
    }
    .stack.dark { --bg: #262626; --text: #f5f5f5; --muted: #a8a8a8; --secondary: #363636; --brand: #aa56d5; --shadow: 0 4px 16px rgba(0, 0, 0, 0.5); }
    .bubble {
      position: relative; flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; overflow: hidden;
      background: var(--bg); border-radius: 12px; box-shadow: var(--shadow); pointer-events: auto;
      animation: slide-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .bubble.item { margin-left: 24px; padding: 8px 10px; }
    .bubble.leaving { animation: slide-out 0.3s ease-in both; }
    @keyframes slide-in { from { opacity: 0; transform: translateX(40px); } }
    @keyframes slide-out { to { opacity: 0; transform: translateX(40px); } }
    .thumb { flex: none; width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: var(--secondary); display: grid; place-items: center; color: var(--muted); }
    .item .thumb { width: 36px; height: 36px; }
    .thumb.logo { background: none; }
    .thumb.logo svg { width: 100%; height: 100%; }
    .thumb svg { width: 20px; height: 20px; }
    .text { flex: 1; min-width: 0; }
    .name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 1px; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bad .name { color: var(--red); }
    .state { flex: none; width: 22px; height: 22px; display: grid; place-items: center; }
    .spin { width: 20px; height: 20px; border-radius: 50%; border: 2.5px solid var(--secondary); border-top-color: var(--muted); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .done-mark { width: 22px; height: 22px; border-radius: 50%; background: var(--green); color: #fff; padding: 4px; animation: pop 0.25s ease-out; }
    @keyframes pop { from { transform: scale(0.4); opacity: 0; } }
    .pct { font-size: 12px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
    .bar { position: absolute; left: 0; bottom: 0; height: 2px; width: 0; background: linear-gradient(90deg, #450b62, #8119b5 50%, #aa56d5); transition: width 0.2s; }
    .done .bar { background: var(--green); }
    svg { display: block; width: 100%; height: 100%; }
  `;
  const DL_ICONS = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v12M7 10.5l5 5 5-5"/><path d="M4 16.5v2a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-2"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 15l5-5 9 9"/></svg>',
  };
  let dlHost, dlStack;
  const dlJobs = new Map(); // job → { header, items: [{ el, loaded, total, done }] }

  const el = (tag, cls, html) => Object.assign(document.createElement(tag), { className: cls || '', innerHTML: html || '' });
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  function dlMount() {
    if (!dlHost) {
      dlHost = document.createElement('div');
      dlHost.id = 'keepkeep-downloads';
      const root = dlHost.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${DL_STYLE}</style><div class="stack"></div>`;
      dlStack = root.querySelector('.stack');
    }
    if (!dlHost.isConnected) document.documentElement.appendChild(dlHost);
    dlStack.classList.toggle('dark', isDarkPage());
  }

  function bubble(cls, thumb, name, sub, delay = 0) {
    const b = el('div', `bubble ${cls}`);
    b.style.animationDelay = `${delay}ms`;
    const t = thumb ? Object.assign(el('img', 'thumb'), { src: thumb }) : el('div', 'thumb logo', LOGO);
    if (thumb) t.onerror = () => t.replaceWith(el('div', 'thumb logo', LOGO));
    b.append(t, el('div', 'text'), el('div', 'state', '<div class="spin"></div>'), el('div', 'bar'));
    b.querySelector('.text').append(Object.assign(el('div', 'name'), { textContent: name }), Object.assign(el('div', 'sub'), { textContent: sub }));
    return b;
  }

  const setText = (b, name, sub) => {
    if (name != null) b.querySelector('.name').textContent = name;
    if (sub != null) b.querySelector('.sub').textContent = sub;
  };
  const markDone = (b) => {
    b.classList.add('done');
    b.querySelector('.state').innerHTML = `<div class="done-mark">${ICONS.check}</div>`;
    b.querySelector('.bar').style.width = '100%';
  };

  const downloads = {
    start(job) {
      dlMount();
      hide(); // the corner card would sit under the balloons
      const header = bubble('header', null, 'Preparing download…', 'Finding the best quality');
      dlStack.append(header);
      dlJobs.set(job, { header, items: [] });
    },

    items(job, { username, files }) {
      const j = dlJobs.get(job);
      if (!j) return;
      const n = files.length;
      setText(j.header, `Downloading ${n === 1 ? (files[0].kind === 'video' ? 'video' : 'photo') : `${n} files`}`,
        username ? '@' + username : '');
      files.forEach((f, i) => {
        const b = bubble('item', f.thumb, f.filename, 'Waiting…', 60 * (i + 1));
        if (!f.thumb) b.querySelector('.thumb').innerHTML = DL_ICONS[f.kind] || DL_ICONS.image;
        b.querySelector('.state').innerHTML = '<span class="pct"></span>';
        (j.items.at(-1)?.el || j.header).after(b);
        j.items.push({ el: b, loaded: 0, total: 0, done: false });
      });
    },

    progress(job, index, loaded, total, done) {
      const j = dlJobs.get(job);
      const it = j?.items[index];
      if (!it || it.done) return;
      Object.assign(it, { loaded, total: total || it.total });
      const f = it.total ? loaded / it.total : 0;
      it.el.querySelector('.bar').style.width = `${Math.round(f * 100)}%`;
      if (done) {
        it.done = true;
        setText(it.el, null, size(loaded));
        markDone(it.el);
      } else {
        setText(it.el, null, it.total ? `${size(loaded)} of ${size(it.total)}` : size(loaded));
        it.el.querySelector('.pct').textContent = it.total ? `${Math.round(f * 100)}%` : '';
      }
      // Overall progress on the header balloon.
      const all = j.items.reduce((s, x) => s + (x.done ? 1 : x.total ? x.loaded / x.total : 0), 0) / j.items.length;
      j.header.querySelector('.bar').style.width = `${Math.round(all * 100)}%`;
    },

    finish(job, res) {
      const j = dlJobs.get(job);
      if (!j) return;
      j.items.forEach((it) => it.done || markDone(it.el));
      const n = res.filenames.length;
      setText(j.header, 'Saved to Downloads/KeepKeep', n === 1 ? res.filenames[0] : `${n} files`);
      markDone(j.header);
      dismiss(job, 4000);
    },

    fail(job, text) {
      const j = dlJobs.get(job);
      if (!j) return;
      j.items.forEach((it) => it.el.remove());
      j.items = [];
      j.header.classList.add('bad');
      j.header.querySelector('.state').innerHTML = '';
      setText(j.header, text, 'Try again in a moment');
      dismiss(job, 3500);
    },
  };

  function dismiss(job, after) {
    setTimeout(() => {
      const j = dlJobs.get(job);
      if (!j) return;
      dlJobs.delete(job);
      const all = [...j.items.map((it) => it.el).reverse(), j.header];
      all.forEach((b, i) => {
        b.style.animationDelay = `${i * 50}ms`;
        b.classList.add('leaving');
        setTimeout(() => b.remove(), 300 + i * 50);
      });
    }, after);
  }

  return { isDarkPage, showDrop, isDropping, showBusy, showInfo, showError, showResult, showRemoved, hide, downloads };
})();
