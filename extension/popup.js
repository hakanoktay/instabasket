const TYPE_LABELS = {
  photo: 'Fotoğraf', album: 'Albüm', video: 'Video', reel: 'Reel', story: 'Hikaye', post: 'Gönderi',
};

const $ = (sel) => document.querySelector(sel);
let state = { profiles: [], media: [] };
let activeTab = 'profiles';
let filterUser = null;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

function avatar(profile, username, small) {
  const cls = 'avatar' + (small ? ' small' : '');
  if (profile?.pic) return el('img', { class: cls, src: profile.pic, alt: '' });
  return el('span', { class: cls }, (username || '?')[0]);
}

function profileLink(username) {
  return el('a', { href: InstaBasket.profileUrl(username), target: '_blank' }, '@' + username);
}

function selectTab(tab) {
  activeTab = tab;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#profiles').hidden = tab !== 'profiles';
  $('#media').hidden = tab !== 'media';
}

function renderProfiles() {
  const counts = {};
  for (const m of state.media) if (m.username) counts[m.username] = (counts[m.username] || 0) + 1;

  $('#profiles .empty').hidden = state.profiles.length > 0;
  $('#profiles ul').replaceChildren(...state.profiles.map((p) => {
    const n = counts[p.username] || 0;
    const showMedia = el('button', {
      class: 'count-link',
      title: 'Bu kullanıcının görsellerini göster',
      onclick: () => { filterUser = p.username; render(); selectTab('media'); },
    }, `${n} görsel`);
    showMedia.disabled = n === 0;
    return el('li', {},
      avatar(p, p.username),
      el('div', { class: 'who' },
        profileLink(p.username),
        p.fullName ? el('div', { class: 'name' }, p.fullName) : null),
      showMedia,
      el('button', {
        class: 'remove',
        title: 'Sil',
        onclick: async () => {
          const msg = n ? `@${p.username} ve ona ait ${n} görsel silinsin mi?` : `@${p.username} silinsin mi?`;
          if (confirm(msg)) await InstaBasket.removeProfile(p.username);
        },
      }, '✕'),
    );
  }));
}

function renderMedia() {
  const profiles = Object.fromEntries(state.profiles.map((p) => [p.username, p]));
  const list = filterUser ? state.media.filter((m) => m.username === filterUser) : state.media;

  $('#filter').hidden = !filterUser;
  if (filterUser) $('#filter span').textContent = `Sadece @${filterUser}`;
  $('#media .empty').hidden = list.length > 0;

  // Kullanıcıya göre grupla; en son görsel eklenen kullanıcı en üstte.
  const groups = new Map();
  for (const m of list) {
    const key = m.username || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  $('#media .groups').replaceChildren(...[...groups].map(([username, items]) => el('div', { class: 'group' },
    el('h2', {},
      username ? avatar(profiles[username], username, true) : null,
      username ? profileLink(username) : el('span', {}, 'Sahibi bulunamadı'),
      el('span', { class: 'n' }, `(${items.length})`)),
    el('div', { class: 'grid' }, ...items.map((m) => el('div', { class: 'tile' },
      el('a', { href: m.url, target: '_blank', title: m.url },
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('div', { class: 'placeholder' }, 'Önizleme yok')),
      el('span', { class: 'badge' }, TYPE_LABELS[m.type] || 'Gönderi'),
      el('button', { class: 'remove', title: 'Sil', onclick: () => InstaBasket.removeMedia(m.key) }, '✕'),
    ))),
  )));
}

async function render() {
  state = await InstaBasket.load();
  if (filterUser && !state.profiles.some((p) => p.username === filterUser)) filterUser = null;
  $('#profiles-count').textContent = `(${state.profiles.length})`;
  $('#media-count').textContent = `(${state.media.length})`;
  renderProfiles();
  renderMedia();
}

for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => selectTab(b.dataset.tab));
$('#filter button').addEventListener('click', () => { filterUser = null; renderMedia(); });

$('#copy').addEventListener('click', async () => {
  const urls = activeTab === 'profiles'
    ? state.profiles.map((p) => InstaBasket.profileUrl(p.username))
    : (filterUser ? state.media.filter((m) => m.username === filterUser) : state.media).map((m) => m.url);
  await navigator.clipboard.writeText(urls.join('\n'));
  $('#copy').textContent = 'Kopyalandı ✓';
  setTimeout(() => { $('#copy').textContent = 'Linkleri kopyala'; }, 1200);
});

$('#clear').addEventListener('click', async () => {
  if (confirm('Tüm profiller ve görseller silinsin mi?')) await InstaBasket.clear();
});

// Açık sekme Instagram'daysa o sayfayı tek tıkla ekle (sürüklemeye gerek kalmadan).
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !InstaBasket.parse(tab.url)) return;
  const button = $('#add-current');
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Ekleniyor…';
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { type: 'add' });
    } catch {
      result = { text: 'Instagram sekmesini yenileyip tekrar dene' };
    }
    $('#add-result').hidden = false;
    $('#add-result').textContent = result?.text || '';
    button.textContent = '+ Bu sayfayı ekle';
    button.disabled = false;
  });
})();

chrome.storage.onChanged.addListener(render);
selectTab('profiles');
render();
