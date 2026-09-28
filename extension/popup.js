const TYPE_LABELS = {
  photo: 'Photo', album: 'Album', video: 'Video', reel: 'Reel', story: 'Story', post: 'Post',
};

const $ = (sel) => document.querySelector(sel);
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
    class: `list-btn ${extraClass} ${names.length ? 'on' : ''}`,
    'data-key': recordKey,
    title: names.length ? `Lists: ${names.join(', ')}` : 'Add to a list',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); openPicker(recordKey, e.currentTarget); },
  }, '🏷', names.length > 1 ? el('span', {}, String(names.length)) : null);
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
      return el('label', {}, check, list.name);
    }),
    state.lists.length ? null : el('div', { class: 'none' }, 'No lists yet. Type a name to create one.'),
    input,
  ].filter(Boolean));
  box.hidden = false;

  // Place under the button, kept inside the popup.
  const r = picker.anchor.getBoundingClientRect();
  const left = Math.min(r.left, document.documentElement.clientWidth - box.offsetWidth - 8);
  box.style.left = `${Math.max(8, left)}px`;
  box.style.top = `${r.bottom + window.scrollY + 4}px`;
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
    ? 'No profiles in this list yet. Use 🏷 on a profile to add it.'
    : 'No profiles yet. On Instagram, use the 🧺 buttons or drag a profile link into the box that appears in the corner.';

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
        class: 'remove',
        title: 'Remove profile (their media is kept)',
        onclick: async () => { if (confirm(`Remove @${p.username} from profiles?`)) await InstaBasket.removeProfile(p.username); },
      }, '✕'),
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
    ? 'No media in this list yet. Use 🏷 on a media item to add it.'
    : 'No media yet. On Instagram, use the 🧺 buttons or drag a post, reel or video link into the corner box.';

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
          class: 'add-profile', title: 'Add this user to profiles',
          onclick: () => InstaBasket.saveProfile({ username, addedAt: Date.now(), lists: [] }),
        }, '+ Profile')
        : username ? el('span', { class: 'saved-profile', title: 'In profiles' }, '✓ Profile') : null),
    el('div', { class: 'grid' }, ...items.map((m) => el('div', { class: 'tile' },
      el('a', { href: m.url, target: '_blank', title: m.url },
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('div', { class: 'placeholder' }, 'No preview')),
      el('span', { class: 'badge' }, TYPE_LABELS[m.type] || 'Post'),
      listButton('m:' + m.key, m, 'tile-btn'),
      el('button', { class: 'remove tile-btn', title: 'Delete', onclick: () => InstaBasket.removeMedia(m.key) }, '✕'),
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
