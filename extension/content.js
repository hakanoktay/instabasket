// Instagram sayfasına URL içeren bir sürükleme girince (adres çubuğundan ya da
// sayfadaki bir link/gönderiden) köşede bir bırakma alanı gösterir ve bırakılan
// profili ya da gönderiyi sepete ekler.
(() => {
  const HIDE_DELAY = 400;
  const RETRY_AFTER = 6 * 60 * 60 * 1000; // eksik bilgiyi en fazla 6 saatte bir yeniden dene
  let host, zone, label, hideTimer, resetTimer, busy = false;

  // ---- Sepete ekleme ----

  async function enrichProfile(username) {
    let info = {};
    try {
      info = await InstaApi.profile(username);
    } catch {}
    const pic = await InstaApi.thumbnail(info.picUrl, 96);
    const update = { username, triedAt: Date.now() };
    if (info.fullName) update.fullName = info.fullName;
    if (pic) update.pic = pic;
    return InstaBasket.saveProfile(update);
  }

  // Görselin sahibi listede yoksa listeye ekler. Yeni eklendiyse true döner.
  async function ensureProfile(username) {
    if (await InstaBasket.getProfile(username)) return false;
    await InstaBasket.saveProfile({ username, addedAt: Date.now() });
    await enrichProfile(username);
    return true;
  }

  async function enrichMedia(item) {
    let info = {};
    if (item.code) {
      try {
        info = await InstaApi.media(item.code);
      } catch {}
    }
    const thumb = await InstaApi.thumbnail(info.thumbUrl, 240);
    const update = { key: item.key, triedAt: Date.now() };
    const username = item.username || info.username;
    if (username) update.username = username;
    if (info.type) update.type = info.type;
    if (thumb) update.thumb = thumb;
    return InstaBasket.saveMedia(update);
  }

  async function add(raw) {
    const item = InstaBasket.parse(raw);
    if (!item) return { state: 'bad', text: 'Instagram profili ya da gönderisi değil' };

    if (item.kind === 'profile') {
      if (await InstaBasket.getProfile(item.username)) return { state: 'dup', text: `@${item.username} zaten listede` };
      await InstaBasket.saveProfile({ username: item.username, addedAt: Date.now() });
      await enrichProfile(item.username);
      return { state: 'done', text: `@${item.username} eklendi ✓` };
    }

    if (await InstaBasket.getMedia(item.key)) return { state: 'dup', text: 'Bu gönderi zaten sepette' };
    await InstaBasket.saveMedia({ ...item, addedAt: Date.now() });
    const saved = await enrichMedia(item);
    if (!saved.username) return { state: 'done', text: 'Eklendi ✓ (sahibi bulunamadı)' };
    const isNew = await ensureProfile(saved.username);
    return {
      state: 'done',
      text: isNew ? `Eklendi ✓ @${saved.username} de listeye alındı` : `@${saved.username} altına eklendi ✓`,
    };
  }

  // Önceden eklenmiş ama bilgisi eksik kalan kayıtları (ağ hatası, eski sürümden
  // taşınan kayıtlar) Instagram açıkken arka planda tamamlar.
  async function fillMissing() {
    const { profiles, media } = await InstaBasket.load();
    const stale = (x) => !x.triedAt || Date.now() - x.triedAt > RETRY_AFTER;
    const jobs = [
      ...media.filter((m) => (!m.username || (m.code && !m.thumb)) && stale(m)).map((m) => async () => {
        const saved = await enrichMedia(m);
        if (saved.username) await ensureProfile(saved.username);
      }),
      ...profiles.filter((p) => !p.pic && stale(p)).map((p) => () => enrichProfile(p.username)),
    ];
    for (const job of jobs.slice(0, 10)) {
      await job().catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ---- Bırakma alanı ----

  function hasUrl(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('text/uri-list');
  }

  function build() {
    host = document.createElement('div');
    host.id = 'instabasket-host';
    // Instagram'ın CSS'i bırakma alanını etkilemesin diye shadow DOM.
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .zone {
          position: fixed; top: 20px; right: 20px; z-index: 2147483647;
          width: 250px; min-height: 140px; padding: 12px; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          text-align: center; background: rgba(255, 255, 255, 0.97); color: #262626;
          border: 3px dashed #c13584; border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          font: 600 15px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: transform 0.12s, background 0.12s;
        }
        .zone.over { transform: scale(1.05); background: #fdf2f8; border-style: solid; }
        .zone.busy { border-style: solid; }
        .zone.done { border-color: #16a34a; border-style: solid; }
        .zone.dup { border-color: #d97706; border-style: solid; }
        .zone.bad { border-color: #dc2626; border-style: solid; }
        .icon { font-size: 34px; }
      </style>
      <div class="zone"><div class="icon">🧺</div><div class="label"></div></div>`;
    zone = root.querySelector('.zone');
    label = root.querySelector('.label');

    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      zone.classList.add('over');
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dt = e.dataTransfer;
      run(dt.getData('text/uri-list') || dt.getData('text/plain'));
    });
  }

  function mount() {
    clearTimeout(resetTimer);
    if (!host) build();
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function show() {
    if (busy) return;
    mount();
    zone.className = 'zone' + (zone.classList.contains('over') ? ' over' : '');
    label.textContent = 'Sepete bırak';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  function hide() {
    clearTimeout(hideTimer);
    host?.remove();
  }

  function flash(state, text, ms) {
    mount();
    clearTimeout(hideTimer);
    zone.className = 'zone ' + state;
    label.textContent = text;
    if (ms) resetTimer = setTimeout(hide, ms);
  }

  async function run(raw) {
    busy = true;
    flash('busy', 'Ekleniyor…');
    let result;
    try {
      result = await add(raw);
    } catch {
      // Eklenti güncellenip sayfa yenilenmediyse chrome.storage erişilemez olur.
      result = { state: 'bad', text: 'Sayfayı yenileyip tekrar dene' };
    }
    busy = false;
    flash(result.state, result.text, 1600);
    return result;
  }

  // Sürükleme sayfanın üzerinde olduğu sürece dragover sürekli tetiklenir;
  // kesilince (bırakıldı, iptal edildi, pencereden çıkıldı) alan kendiliğinden kapanır.
  for (const type of ['dragenter', 'dragover']) {
    window.addEventListener(type, (e) => { if (hasUrl(e)) show(); }, true);
  }

  // Popup'taki "Bu sayfayı ekle" butonu.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'add') return;
    run(location.href).then(sendResponse);
    return true;
  });

  setTimeout(() => fillMissing().catch(() => {}), 3000);
})();
