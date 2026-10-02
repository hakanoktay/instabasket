// Saved media and saved profiles. Minimal for now: Task 2 fills the grids.
(() => {
  const { el, view } = KeepKeepApp;
  const simple = (id, title) => view({
    id, title, nav: 'main', icon: id, full: false,
    render(main) { main.append(el('h1', { text: title }), el('div', { class: 'grid' })); },
  });
  simple('media', 'Media');
  simple('profiles', 'Profiles');
})();
