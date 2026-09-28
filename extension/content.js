// Instagram sayfasına URL içeren bir sürükleme girince (adres çubuğundan ya da
// sayfadaki bir link/gönderiden) köşede bir bırakma alanı gösterir.
(() => {
  const HIDE_DELAY = 400;
  let host, zone, label, hideTimer, resetTimer;

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
          width: 240px; height: 140px; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          background: rgba(255, 255, 255, 0.97); color: #262626;
          border: 3px dashed #c13584; border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          font: 600 15px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: transform 0.12s, background 0.12s;
        }
        .zone.over { transform: scale(1.05); background: #fdf2f8; border-style: solid; }
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
    zone.addEventListener('drop', onDrop);
  }

  function show() {
    clearTimeout(resetTimer);
    if (!host) build();
    if (!host.isConnected) {
      zone.className = 'zone';
      label.textContent = 'Sepete bırak';
      document.documentElement.appendChild(host);
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  function hide() {
    clearTimeout(hideTimer);
    host?.remove();
  }

  function flash(state, text) {
    zone.className = 'zone ' + state;
    label.textContent = text;
    clearTimeout(hideTimer);
    resetTimer = setTimeout(hide, 900);
  }

  async function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    const entry = InstaBasket.parse(dt.getData('text/uri-list') || dt.getData('text/plain'));
    if (!entry) return flash('bad', 'Geçerli bir URL değil');
    try {
      const added = await InstaBasket.add(entry);
      flash(added ? 'done' : 'dup', added ? 'Sepete eklendi ✓' : 'Zaten sepette');
    } catch {
      // Eklenti güncellenip sayfa yenilenmediyse chrome.storage erişilemez olur.
      flash('bad', 'Sayfayı yenileyip tekrar dene');
    }
  }

  // Sürükleme sayfanın üzerinde olduğu sürece dragover sürekli tetiklenir;
  // kesilince (bırakıldı, iptal edildi, pencereden çıkıldı) alan kendiliğinden kapanır.
  for (const type of ['dragenter', 'dragover']) {
    window.addEventListener(type, (e) => { if (hasUrl(e)) show(); }, true);
  }
})();
