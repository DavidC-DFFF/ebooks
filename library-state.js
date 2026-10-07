// Progression locale, indépendante pour chaque ouvrage.
(() => {
  const catalogue = document.getElementById('catalogue');
  const dialog = document.getElementById('reading-dialog');
  let selected;
  function state(row) {
    try {
      const prefix = row.dataset.prefix;
      const saved = JSON.parse(localStorage.getItem(prefix + '-reading'));
      if (saved && /^partie-\d+$/.test(saved.section)) return saved;
      const last = localStorage.getItem(prefix + '-last');
      if (/^partie-\d+$/.test(last || '')) return { section: last,
        percent: Math.round(Number(last.slice(7)) / Number(row.dataset.parts) * 100), updated: 0 };
    } catch (e) {}
    return { percent: 0, updated: 0 };
  }
  const alphabet = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  function refresh() {
    const groups = [...catalogue.children];
    groups.forEach(group => {
      const rows = [...group.querySelectorAll('li')];
      rows.forEach(row => {
        const saved = state(row);
        row.dataset.updated = String(Number(saved.updated) || 0);
        const percent = Math.min(100, Math.max(0, Number(saved.percent) || 0));
        row.querySelector('button').textContent = `(${percent} %)`;
      });
      rows.sort((a, b) => Number(b.dataset.updated) - Number(a.dataset.updated) ||
        alphabet.compare(a.querySelector('a').textContent, b.querySelector('a').textContent));
      rows.forEach(row => group.querySelector('ul').append(row));
      group.dataset.updated = String(Math.max(0, ...rows.map(row => Number(row.dataset.updated))));
    });
    groups.sort((a, b) => Number(b.dataset.updated) - Number(a.dataset.updated) ||
      alphabet.compare(a.querySelector('summary').textContent, b.querySelector('summary').textContent));
    groups.forEach(group => catalogue.append(group));
  }
  catalogue.addEventListener('click', event => {
    const button = event.target.closest('.reading-state');
    if (!button) return;
    selected = button.closest('li');
    const saved = state(selected);
    document.getElementById('reading-title').textContent = selected.querySelector('a').textContent;
    document.getElementById('reading-description').textContent = saved.section ?
      `Lecture à ${saved.percent} %. Reprendre au dernier passage lu ou effacer la progression ?` : 'Ce livre n’a pas encore été lu.';
    document.getElementById('resume-book').disabled = !saved.section;
    dialog.showModal();
  });
  document.getElementById('resume-book').addEventListener('click', () => {
    const saved = state(selected);
    if (saved.section) location.href = selected.querySelector('a').getAttribute('href') + '#' + saved.section;
  });
  document.getElementById('reset-book').addEventListener('click', () => {
    try { ['reading', 'position', 'last'].forEach(key => localStorage.removeItem(selected.dataset.prefix + '-' + key)); } catch (e) {}
    dialog.close();
    refresh();
  });
  document.getElementById('close-reading').addEventListener('click', () => dialog.close());
  addEventListener('pageshow', refresh);
  addEventListener('storage', refresh);
  refresh();
})();
