// Passes the "Watch stories anonymously" setting to stories-main.js (which
// runs in the page's own context and can't read chrome.storage), and shows
// that the mode is on – like a private window: a thin brand line along the
// top of Instagram, and in Stories a brand frame with an "Anonymous" badge
// in the bottom-left corner (clear of the story's own controls).
(() => {
  const MASK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 10.5l1.7-5a1 1 0 0 1 1.3-.6l3.5 1.3 3.5-1.3a1 1 0 0 1 1.3.6l1.7 5z" fill="currentColor"/><path d="M2.5 10.5h19"/><circle cx="7.5" cy="16" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/><path d="M10.1 16c1.3-.9 2.5-.9 3.8 0"/></svg>';
  let on = false;
  let host;
  let root;

  function mount() {
    host = document.createElement('div');
    host.id = 'keepkeep-anon';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host { all: initial; }
      .line { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 2147483646; pointer-events: none;
        background: linear-gradient(90deg, #450b62, #8119b5 40%, #aa56d5); }
      .frame { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; display: none;
        box-shadow: inset 0 0 0 3px #8119b5, inset 0 0 60px rgba(129, 25, 181, 0.45); }
      .badge { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; pointer-events: none; display: none;
        align-items: center; gap: 6px; padding: 5px 12px 5px 9px; border-radius: 999px;
        background: linear-gradient(135deg, #8119b5, #450b62); color: #fff; box-shadow: 0 2px 10px rgba(69, 11, 98, 0.45);
        font: 600 12px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; letter-spacing: 0.2px; }
      .badge svg { width: 18px; height: 18px; display: block; }
      :host(.stories) .frame { display: block; }
      :host(.stories) .badge { display: flex; }
      :host(.stories) .line { display: none; }
    </style>
    <div class="line"></div><div class="frame"></div>
    <div class="badge" title="KeepKeep: story owners won't see you in their viewers list">${MASK}Anonymous</div>`;
  }

  function render() {
    if (!on) return host?.remove();
    if (!host) mount();
    host.classList.toggle('stories', location.pathname.startsWith('/stories/'));
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  const apply = (value) => {
    on = value;
    document.documentElement.dataset.keepkeepAnonStories = on ? '1' : '0';
    render();
  };
  chrome.storage.local.get('anonStories').then(({ anonStories }) => apply(anonStories === true), () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.anonStories) apply(changes.anonStories.newValue === true);
  });
  // Instagram changes pages without reloading.
  setInterval(() => on && render(), 500);
})();
