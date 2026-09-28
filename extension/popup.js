const TYPE_LABELS = {
  photo: 'Photo', album: 'Album', video: 'Video', reel: 'Reel', story: 'Story', post: 'Post',
};
const TYPE_ICONS = { reel: 'reel', album: 'album', video: 'video', story: 'video' };

const ICONS = {
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  tagFilled: '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M2 12.4V4a2 2 0 0 1 2-2h8.4l9.6 9.6a1.2 1.2 0 0 1 0 1.7l-8.7 8.7a1.2 1.2 0 0 1-1.7 0zM7.5 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
  // Media type glyphs, shown in the corner of thumbnails as on Instagram's grids.
  reel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><path d="M2.5 8h19M9 2.5l3 5.5M15 2.5l3 5.5"/><path d="M10 11.5v6l5-3z" fill="currentColor"/></svg>',
  album: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h11a3 3 0 0 1 3 3v11h-2V6a1 1 0 0 0-1-1H7z"/><rect x="3" y="7" width="14" height="14" rx="2.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

const $ = (sel) => document.querySelector(sel);

function icon(name) {
  const span = document.createElement('span');
  span.className = 'i';
  span.innerHTML = ICONS[name];
  return span;
}
let state = { profiles: [], media: [], users: {}, lists: [] };
let activeTab = 'profiles';
let activeList = null; // list id, or null for all
let filterUser = null;
let picker = null; // { recordKey, anchor } while the list picker is open

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

function avatar(username, small) {
  const cls = 'avatar' + (small ? ' small' : '');
  const pic = state.users[username]?.pic;
  if (pic) return el('img', { class: cls, src: pic, alt: '' });
  return el('span', { class: cls }, (username || '?')[0]);
}

function profileLink(username) {
  return el('a', { href: InstaBasket.profileUrl(username), target: '_blank' }, '@' + username);
}

const inActiveList = (record) => !activeList || record.lists?.includes(activeList);
const visibleProfiles = () => state.profiles.filter(inActiveList);
const visibleMedia = () =>
  state.media.filter((m) => inActiveList(m) && (!filterUser || m.username === filterUser));

// Button that opens the list picker for a record; highlighted when the record is in any list.
function listButton(recordKey, record, extraClass = '') {
  const names = (record.lists || []).map((id) => state.lists.find((l) => l.id === id)?.name).filter(Boolean);
  return el('button', {
    class: `icon-btn list-btn ${extraClass} ${names.length ? 'on' : ''}`,
    'data-key': recordKey,
    title: names.length ? `Lists: ${names.join(', ')}` : 'Add to a list',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); openPicker(recordKey, e.currentTarget); },
  }, icon(names.length ? 'tagFilled' : 'tag'));
}

// ---- Tabs and lists bar ----

function selectTab(tab) {
  activeTab = tab;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#profiles').hidden = tab !== 'profiles';
  $('#media').hidden = tab !== 'media';
  renderLists();
}

function renderLists() {
  const records = activeTab === 'profiles' ? state.profiles : state.media;
  const count = (id) => records.filter((r) => r.lists?.includes(id)).length;
  const chip = (id, name, n) => el('button', {
    class: 'chip' + (activeList === id ? ' active' : ''),
    onclick: () => { activeList = id; render(); },
  }, name, n != null ? el('span', { class: 'n' }, ` ${n}`) : null);

  const input = el('input', { class: 'new-list', placeholder: 'New list…', maxlength: 40 });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      const list = await InstaBasket.createList(input.value);
      activeList = list.id;
    } else if (e.key === 'Escape') {
      input.value = '';
      input.blur();
    }
  });

  $('#lists .chips').replaceChildren(
    chip(null, 'All'),
    ...state.lists.map((l) => chip(l.id, l.name, count(l.id))),
    input,
  );
  $('#list-actions').hidden = !activeList;
}

$('#rename-list').addEventListener('click', async () => {
  const list = state.lists.find((l) => l.id === activeList);
  const name = list && prompt('List name', list.name);
  if (name?.trim()) await InstaBasket.renameList(list.id, name);
});

$('#delete-list').addEventListener('click', async () => {
  const list = state.lists.find((l) => l.id === activeList);
  if (list && confirm(`Delete the list "${list.name}"? The profiles and media in it are kept.`)) {
    activeList = null;
    await InstaBasket.deleteList(list.id);
  }
});

// ---- List picker ----

function openPicker(recordKey, anchor) {
  picker = { recordKey, anchor };
  renderPicker();
}

function closePicker() {
  picker = null;
  $('#picker').hidden = true;
}

function renderPicker() {
  const box = $('#picker');
  if (!picker) return;
  const [kind, key] = [picker.recordKey.slice(0, 1), picker.recordKey.slice(2)];
  const record = kind === 'p' ? state.profiles.find((p) => p.username === key) : state.media.find((m) => m.key === key);
  if (!record || !picker.anchor.isConnected) return closePicker();

  const input = el('input', { placeholder: 'New list…', maxlength: 40 });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      const list = await InstaBasket.createList(input.value);
      await InstaBasket.setInList(picker.recordKey, list.id, true);
    } else if (e.key === 'Escape') {
      closePicker();
    }
  });

  box.replaceChildren(...[
    el('div', { class: 'title' }, 'Lists'),
    ...state.lists.map((list) => {
      const check = el('input', { type: 'checkbox', checked: !!record.lists?.includes(list.id) });
      check.addEventListener('change', () => InstaBasket.setInList(picker.recordKey, list.id, check.checked));
      return el('label', {}, el('span', { class: 'name' }, list.name), check);
    }),
    state.lists.length ? null : el('div', { class: 'none' }, 'No lists yet. Type a name to create one.'),
    input,
  ].filter(Boolean));
  box.hidden = false;

  // Place under the button, or above it when there's no room below, kept inside the popup.
  const r = picker.anchor.getBoundingClientRect();
  const left = Math.min(r.left, document.documentElement.clientWidth - box.offsetWidth - 8);
  box.style.left = `${Math.max(8, left)}px`;
  const below = innerHeight - r.bottom - 8;
  const top = below >= box.offsetHeight || r.top < box.offsetHeight ? r.bottom + 4 : r.top - box.offsetHeight - 4;
  box.style.top = `${Math.max(8, top) + window.scrollY}px`;
  if (!state.lists.length) input.focus();
}

document.addEventListener('click', (e) => {
  if (picker && !$('#picker').contains(e.target)) closePicker();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });

// ---- Profiles ----

function renderProfiles() {
  const counts = {};
  for (const m of state.media) if (m.username) counts[m.username] = (counts[m.username] || 0) + 1;
  const profiles = visibleProfiles();

  $('#profiles .empty').hidden = profiles.length > 0;
  $('#profiles .empty').textContent = activeList
    ? 'No profiles in this list yet. Use the tag button on a profile to add it.'
    : 'No profiles yet. On Instagram, use the basket buttons or drag a profile link onto the page.';

  $('#profiles ul').replaceChildren(...profiles.map((p) => {
    const n = counts[p.username] || 0;
    const fullName = state.users[p.username]?.fullName;
    return el('li', {},
      avatar(p.username),
      el('div', { class: 'who' },
        profileLink(p.username),
        fullName ? el('div', { class: 'name' }, fullName) : null),
      listButton('p:' + p.username, p),
      el('button', {
        class: 'count-link',
        title: "Show this user's media",
        disabled: n === 0,
        onclick: () => { filterUser = p.username; activeList = null; selectTab('media'); render(); },
      }, `${n} media`),
      el('button', {
        class: 'icon-btn remove',
        title: 'Remove profile (their media is kept)',
        onclick: async () => { if (confirm(`Remove @${p.username} from profiles?`)) await InstaBasket.removeProfile(p.username); },
      }, icon('trash')),
    );
  }));
}

// ---- Media ----

function renderMedia() {
  const saved = new Set(state.profiles.map((p) => p.username));
  const list = visibleMedia();

  $('#filter').hidden = !filterUser;
  if (filterUser) $('#filter span').textContent = `Only @${filterUser}`;
  $('#media .empty').hidden = list.length > 0;
  $('#media .empty').textContent = activeList
    ? 'No media in this list yet. Use the tag button on a thumbnail to add it.'
    : 'No media yet. On Instagram, use the basket buttons or drag a post, reel or video link onto the page.';

  // Group by user; the user with the most recently added media comes first.
  const groups = new Map();
  for (const m of list) {
    const key = m.username || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  $('#media .groups').replaceChildren(...[...groups].map(([username, items]) => el('div', { class: 'group' },
    el('h2', {},
      username ? avatar(username, true) : null,
      username ? profileLink(username) : el('span', {}, 'Owner not found'),
      el('span', { class: 'n' }, `(${items.length})`),
      el('span', { class: 'spacer' }),
      username && !saved.has(username)
        ? el('button', {
          class: 'text-btn add-profile', title: 'Add this user to profiles',
          onclick: () => InstaBasket.saveProfile({ username, addedAt: Date.now(), lists: [] }),
        }, '+ Profile')
        : username ? el('span', { class: 'saved-profile', title: 'In profiles' }, 'In profiles') : null),
    el('div', { class: 'grid' }, ...items.map((m) => el('div', { class: 'tile' },
      el('a', { href: m.url, target: '_blank', title: m.url },
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('div', { class: 'placeholder' }, 'No preview')),
      TYPE_ICONS[m.type] ? el('span', { class: 'type', title: TYPE_LABELS[m.type] }, icon(TYPE_ICONS[m.type])) : null,
      m.lists?.some((id) => state.lists.some((l) => l.id === id)) ? el('span', { class: 'in-list' }, icon('tagFilled')) : null,
      el('div', { class: 'tile-actions' },
        listButton('m:' + m.key, m, 'tile-btn'),
        el('button', { class: 'icon-btn remove tile-btn', title: 'Remove', onclick: () => InstaBasket.removeMedia(m.key) }, icon('trash'))),
    ))),
  )));
}

async function render() {
  state = await InstaBasket.load();
  if (activeList && !state.lists.some((l) => l.id === activeList)) activeList = null;
  $('#profiles-count').textContent = `(${state.profiles.length})`;
  $('#media-count').textContent = `(${state.media.length})`;
  renderLists();
  renderProfiles();
  renderMedia();
  if (picker) {
    // Buttons were re-rendered; re-anchor the picker to the new one.
    const [kind, key] = [picker.recordKey.slice(0, 1), picker.recordKey.slice(2)];
    const scope = kind === 'p' ? '#profiles' : '#media';
    const anchor = [...document.querySelectorAll(`${scope} .list-btn`)]
      .find((b) => b.dataset.key === picker.recordKey);
    if (anchor) picker.anchor = anchor;
    renderPicker();
  }
}

for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => selectTab(b.dataset.tab));
$('#filter button').addEventListener('click', () => { filterUser = null; renderMedia(); });

$('#copy').addEventListener('click', async () => {
  const urls = activeTab === 'profiles'
    ? visibleProfiles().map((p) => InstaBasket.profileUrl(p.username))
    : visibleMedia().map((m) => m.url);
  await navigator.clipboard.writeText(urls.join('\n'));
  $('#copy').textContent = 'Copied ✓';
  setTimeout(() => { $('#copy').textContent = 'Copy links'; }, 1200);
});

$('#clear').addEventListener('click', async () => {
  if (confirm('Delete all profiles and media? Your lists are kept.')) await InstaBasket.clear();
});

// If the active tab is an Instagram profile or post, add it with one click (no dragging needed).
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !InstaBasket.parse(tab.url)) return;
  const button = $('#add-current');
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Adding…';
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { type: 'add' });
    } catch {
      result = { text: 'Reload the Instagram tab and try again' };
    }
    $('#add-result').hidden = false;
    $('#add-result').textContent = result?.text || '';
    button.textContent = '+ Add this page';
    button.disabled = false;
  });
})();

chrome.storage.onChanged.addListener(render);
selectTab('profiles');
render();
