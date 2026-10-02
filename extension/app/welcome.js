// The welcome view: opens once after installing (and from About). What
// KeepKeep does first, how to start, then the trust badges as the supporting key.
(() => {
  const { el, view } = KeepKeepApp;

  const TAGS = [
    ['No password', true, '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'],
    ['No tracking', false, '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'],
    ['No ads', false, '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'],
  ];
  const MASK = '<path d="M2 9c3-2 6.5-3 10-3s7 1 10 3c0 5-4 8-7 8-1.6 0-2.3-1.5-3-1.5S10.6 17 9 17c-3 0-7-3-7-8z"/><circle cx="8" cy="11" r="1.6"/><circle cx="16" cy="11" r="1.6"/>';

  function svg(inner) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.innerHTML = inner;
    return s;
  }

  function step(n, title, text) {
    return el('li', {}, el('span', { class: 'n', text: String(n) }), el('div', {}, el('b', { text: title }), el('span', { text }))); 
  }

  function render(main) {
    main.append(el('div', { class: 'welcome' },
      el('div', { class: 'brand' }, el('img', { src: 'icons/logo.svg', alt: '', width: 40, height: 40 }), el('span', { text: 'KeepKeep' })),
      el('h1', {}, 'Keep what you ', el('em', { text: 'find' }), ' on Instagram'),
      el('p', { class: 'lead', text: 'Reels, Stories, Photos, Videos and Posts: save them to your own lists, download them in full quality, and watch stories anonymously – right inside Instagram.' }),
      el('ol', { class: 'steps' },
        step(1, 'Open Instagram', 'on instagram.com, in this browser.'),
        step(2, 'Use the purple buttons', 'next to posts, reels, stories and profiles to save or download.'),
        step(3, 'Find everything in KeepKeep', 'click its icon in the toolbar. Pin it from the puzzle-piece menu to keep it in view.')),
      el('p', { class: 'note' }, svg(MASK),
        el('span', {}, el('b', { text: 'Anonymous stories are on.' }), " You won't appear in viewers lists, and Instagram turns KeepKeep purple so you always know. Switch it off any time in KeepKeep's popup.")),
      el('div', { class: 'actions' },
        el('a', { class: 'cta', href: 'https://www.instagram.com/', text: 'Open Instagram' }),
        el('a', { class: 'settings-cta', href: '#settings', text: 'Settings' })),
      el('section', { class: 'trust', 'aria-label': 'Privacy' },
        el('ul', { class: 'tags' }, TAGS.map(([text, strong, path]) => el('li', { class: 'tag' + (strong ? ' strong' : '') }, svg(path), text))),
        el('p', { text: 'Never asks for your password. Nothing leaves your computer.' })),
      el('footer', {}, 'Made by ', el('a', { href: 'https://zetasis.net', text: 'Zetasis' }), ' · ', el('a', { href: 'https://buymeacoffee.com/zetasis', text: '☕ Buy me a coffee' })),
      el('a', { class: 'go', href: '#media', text: 'Go to KeepKeep →' })));
  }

  view({ id: 'welcome', title: 'Welcome', nav: null, full: true, render });
})();
