const TYPE_LABELS = {
  post: 'Gönderi', reel: 'Reel', video: 'Video', story: 'Hikaye',
  profile: 'Profil', instagram: 'Instagram', link: 'Link',
};

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');

async function render() {
  const items = await InstaBasket.list();
  countEl.textContent = items.length ? `(${items.length})` : '';
  emptyEl.hidden = items.length > 0;
  listEl.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');

    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = TYPE_LABELS[item.type] || 'Link';

    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.title = item.url;
    a.textContent = item.url.replace(/^https:\/\/(www\.)?instagram\.com\//, '');

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Sil';
    del.addEventListener('click', () => InstaBasket.remove(item.url));

    li.append(type, a, del);
    return li;
  }));
}

document.getElementById('copy').addEventListener('click', async () => {
  const items = await InstaBasket.list();
  await navigator.clipboard.writeText(items.map((i) => i.url).join('\n'));
});

document.getElementById('clear').addEventListener('click', async () => {
  if (confirm('Sepetteki tüm linkler silinsin mi?')) await InstaBasket.clear();
});

chrome.storage.onChanged.addListener(render);
render();
