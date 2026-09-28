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
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  personAdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 12.5-4.3"/><path d="M19 14v6M16 17h6"/></svg>',
  personCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4" fill="currentColor"/><path d="M3 21a7 7 0 0 1 12.5-4.3" fill="currentColor"/><path d="M15.5 18l2.5 2.5 4.5-5"/></svg>',
  personRemove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 12.5-4.3"/><path d="M16 17h6"/></svg>',
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

// Profile pictures are links to the profile, so right-click → "Open link in new tab" works.
function avatar(username, size) {
  const cls = 'avatar' + (size === 'tiny' ? ' tiny' : size ? ' small' : '');
  const pic = state.users[username]?.pic;
  const img = pic ? el('img', { class: cls, src: pic, alt: '' }) : el('span', { class: cls }, (username || '?')[0]);
  return el('a', { class: 'avatar-link', href: InstaBasket.profileUrl(username), target: '_blank', title: `Open @${username} on Instagram` }, img);
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

const tabKind = () => (activeTab === 'profiles' ? 'p' : 'm');
const listsOf = (kind) => state.lists.filter((l) => l.kind === kind);

function renderLists() {
  const records = activeTab === 'profiles' ? state.profiles : state.media;
  const count = (id) => records.filter((r) => r.lists?.includes(id)).length;
  const chip = (id, name, n) => el('button', {
    class: 'chip' + (activeList === id ? ' active' : ''),
    onclick: () => { activeList = id; render(); },
  }, name, n != null ? el('span', { class: 'n' }, ` ${n}`) : null);

  const chips = $('#lists .chips');
  chips.replaceChildren(chip(null, 'All'), ...listsOf(tabKind()).map((l) => chip(l.id, l.name, count(l.id))));
  chips.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateScrollButtons();
  renderFooter();
}

// The chips row scrolls sideways: arrow buttons appear at whichever end has
// more lists, and a normal (vertical) mouse wheel scrolls it too – no trackpad needed.
function updateScrollButtons() {
  const chips = $('#lists .chips');
  const max = chips.scrollWidth - chips.clientWidth;
  $('.scroll-btn.left').hidden = chips.scrollLeft <= 1;
  $('.scroll-btn.right').hidden = chips.scrollLeft >= max - 1;
  $('.chips-wrap').classList.toggle('fade-left', chips.scrollLeft > 1);
  $('.chips-wrap').classList.toggle('fade-right', chips.scrollLeft < max - 1);
}
$('#lists .chips').addEventListener('scroll', updateScrollButtons, { passive: true });
$('#lists .chips').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal (trackpad)
  e.preventDefault();
  $('#lists .chips').scrollBy({ left: e.deltaY, behavior: 'auto' });
}, { passive: false });
for (const [cls, dir] of [['left', -1], ['right', 1]]) {
  $(`.scroll-btn.${cls}`).addEventListener('click', () => {
    const chips = $('#lists .chips');
    chips.scrollBy({ left: dir * chips.clientWidth * 0.7, behavior: 'smooth' });
  });
}

// "+" turns the lists row into a name field.
$('#new-list').addEventListener('click', () => {
  $('#lists').classList.add('creating');
  $('#new-list-form').hidden = false;
  $('#new-list-form input').value = '';
  $('#new-list-form input').focus();
});
function closeNewList() {
  $('#lists').classList.remove('creating');
  $('#new-list-form').hidden = true;
}
$('#new-list-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#new-list-form input').value.trim();
  if (!name) return;
  closeNewList();
  const list = await InstaBasket.createList(name, tabKind());
  activeList = list.id;
});
$('#new-list-form .cancel').addEventListener('click', closeNewList);
$('#new-list-form input').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeNewList(); } });

// ---- Footer: actions for the selected list ----

function renderFooter(mode = 'view') {
  const list = state.lists.find((l) => l.id === activeList);
  const footer = $('#list-footer');
  footer.hidden = !list;
  if (!list) return;
  const records = list.kind === 'p' ? state.profiles : state.media;
  const n = records.filter((r) => r.lists?.includes(list.id)).length;
  footer.querySelector('.list-name').replaceChildren(icon('tagFilled'), el('b', {}, list.name), el('span', { class: 'n' }, ` · ${n}`));
  footer.querySelector('.view').hidden = mode !== 'view';
  footer.querySelector('.rename-form').hidden = mode !== 'rename';
  footer.querySelector('.confirm').hidden = mode !== 'confirm';
  if (mode === 'rename') {
    const input = footer.querySelector('.rename-form input');
    input.value = list.name;
    input.select();
  }
  if (mode === 'confirm') {
    footer.querySelector('.question').replaceChildren(
      'Delete ', el('b', {}, `"${list.name}"`), '? ',
      el('span', { class: 'n' }, 'Its items stay in your basket.'));
    footer.querySelector('.confirm-delete').focus();
  }
}

$('#list-footer .rename').addEventListener('click', () => renderFooter('rename'));
$('#list-footer .delete').addEventListener('click', () => renderFooter('confirm'));
for (const b of document.querySelectorAll('#list-footer .cancel')) b.addEventListener('click', () => renderFooter('view'));
$('#list-footer .rename-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#list-footer .rename-form input').value.trim();
  if (name) await InstaBasket.renameList(activeList, name);
  renderFooter('view');
});
$('#list-footer .rename-form input').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); renderFooter('view'); } });
$('#list-footer .confirm-delete').addEventListener('click', async () => {
  const id = activeList;
  activeList = null;
  await InstaBasket.deleteList(id);
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

  const lists = listsOf(kind);
  const input = el('input', { placeholder: 'New list…', maxlength: 40 });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      const list = await InstaBasket.createList(input.value, kind);
      await InstaBasket.setInList(picker.recordKey, list.id, true);
    } else if (e.key === 'Escape') {
      closePicker();
    }
  });

  box.replaceChildren(...[
    el('div', { class: 'title' }, 'Lists'),
    ...lists.map((list) => {
      const check = el('input', { type: 'checkbox', checked: !!record.lists?.includes(list.id) });
      check.addEventListener('change', () => InstaBasket.setInList(picker.recordKey, list.id, check.checked));
      return el('label', {}, el('span', { class: 'name' }, list.name), check);
    }),
    lists.length ? null : el('div', { class: 'none' }, 'No lists yet. Type a name to create one.'),
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
  if (!lists.length) input.focus();
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

  $('#media .groups').replaceChildren(el('div', { class: 'cards' }, ...list.map((m) => mediaCard(m, saved))));
}

// One media item: the thumbnail (tag and open buttons on hover) and, always
// visible below it, the owner, their profile toggle and the delete button.
function mediaCard(m, savedProfiles) {
  const inList = m.lists?.some((id) => state.lists.some((l) => l.id === id));
  return el('div', { class: 'card' },
    el('div', { class: 'tile' },
      el('a', { href: m.url, target: '_blank', title: 'Open on Instagram' },
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('div', { class: 'placeholder' }, 'No preview')),
      TYPE_ICONS[m.type] ? el('span', { class: 'type', title: TYPE_LABELS[m.type] }, icon(TYPE_ICONS[m.type])) : null,
      inList ? el('span', { class: 'in-list' }, icon('tagFilled')) : null,
      el('div', { class: 'tile-actions' },
        listButton('m:' + m.key, m, 'tile-btn'),
        el('a', { class: 'icon-btn tile-btn', href: m.url, target: '_blank', title: 'Open on Instagram' }, icon('open')))),
    el('div', { class: 'card-foot' },
      m.username ? avatar(m.username, 'tiny') : null,
      m.username
        // A real link, so right-click → "Open link in new tab" opens the profile;
        // a normal click filters to this user's media.
        ? el('a', {
          class: 'owner', href: InstaBasket.profileUrl(m.username), target: '_blank', title: `Show only @${m.username}`,
          onclick: (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            filterUser = m.username;
            renderMedia();
          },
        }, '@' + m.username)
        : el('span', { class: 'owner unknown' }, 'Owner not found'),
      m.username ? profileToggle(m.username, savedProfiles.has(m.username)) : null,
      el('button', {
        class: 'icon-btn remove', title: 'Delete from basket', onclick: () => InstaBasket.removeMedia(m.key),
      }, icon('trash'))),
  );
}

// Adds the owner to Profiles, or (once added) shows that and removes on click
// – the same "saved → hover to remove" pattern as the buttons on Instagram.
function profileToggle(username, saved) {
  return el('button', {
    class: 'icon-btn profile-toggle' + (saved ? ' saved' : ''),
    title: saved ? `@${username} is in Profiles · click to remove` : `Add @${username} to Profiles`,
    onclick: () => (saved
      ? InstaBasket.removeProfile(username)
      : InstaBasket.saveProfile({ username, addedAt: Date.now(), lists: [] })),
  }, icon(saved ? 'personCheck' : 'personAdd'), saved ? icon('personRemove') : null);
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

for (const b of document.querySelectorAll('.tab')) {
  b.addEventListener('click', () => {
    if (activeTab === b.dataset.tab) return;
    activeList = null; // lists are per tab
    selectTab(b.dataset.tab);
    render();
  });
}
$('#filter button').addEventListener('click', () => { filterUser = null; renderMedia(); });

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

$('#download-settings').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-folder-settings' }));

chrome.storage.onChanged.addListener(render);
selectTab('profiles');
render();
