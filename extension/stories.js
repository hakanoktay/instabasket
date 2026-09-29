// Passes the "Watch stories anonymously" setting to stories-main.js, which
// runs in the page's own context and can't read chrome.storage.
(() => {
  const apply = (on) => {
    document.documentElement.dataset.keepkeepAnonStories = on ? '1' : '0';
  };
  chrome.storage.local.get('anonStories').then(({ anonStories }) => apply(anonStories === true), () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.anonStories) apply(changes.anonStories.newValue === true);
  });
})();
