// Import tab: reads a backup file and adds it with KeepKeep.importData().
(() => {
  const drop = document.getElementById('drop');
  const input = document.getElementById('file');
  const result = document.getElementById('result');

  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const list = (parts) => (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0]);

  function show(ok, title, text) {
    result.hidden = false;
    result.className = `result ${ok ? 'ok' : 'bad'}`;
    result.replaceChildren(Object.assign(document.createElement('b'), { textContent: title }),
      Object.assign(document.createElement('span'), { textContent: text }));
  }

  async function importFile(file) {
    if (!file) return;
    drop.classList.add('busy');
    try {
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        throw Object.assign(new Error(), { code: 'not-backup' });
      }
      const c = await KeepKeep.importData(backup);
      const added = [c.profiles && plural(c.profiles, 'profile'), c.media && plural(c.media, 'post'), c.lists && plural(c.lists, 'list')].filter(Boolean);
      const already = c.existing ? `${plural(c.existing, 'item')} ${c.existing === 1 ? 'was' : 'were'} already here; their lists were combined.` : '';
      if (added.length) show(true, `Added ${list(added)}.`, already || 'Open KeepKeep from the toolbar to see them.');
      else show(true, 'Everything in this backup was already here.', already);
    } catch (e) {
      if (e.code === 'newer') show(false, 'This backup was made by a newer KeepKeep.', 'Update KeepKeep, then import it again. Nothing was changed.');
      else if (e.code === 'not-backup') show(false, "This file isn't a KeepKeep backup.", 'Choose a KeepKeep-backup-….json file made with Export. Nothing was changed.');
      else show(false, 'The import failed.', 'Please try again. Nothing was changed.');
    } finally {
      drop.classList.remove('busy');
      input.value = '';
    }
  }

  input.addEventListener('change', () => importFile(input.files[0]));
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    importFile(e.dataTransfer.files[0]);
  });
})();
