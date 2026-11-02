// Fusion déterministe : maximum par chapitre, curseur récent, remise à zéro prioritaire.
(() => {
  const zero = [0, ''];
  const compare = (a = zero, b = zero) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
  const validStamp = s => Array.isArray(s) && s.length === 2 && Number.isSafeInteger(s[0]) && s[0] >= 0 && typeof s[1] === 'string' && /^[a-zA-Z0-9-]{0,80}$/.test(s[1]);
  function cleanBooks(books) {
    if (!books || typeof books !== 'object' || Array.isArray(books) || Object.keys(books).length > 1000) throw new Error('Livres invalides');
    const out = Object.create(null);
    for (const [id, b] of Object.entries(books)) {
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !b || !validStamp(b.generation) || !validStamp(b.stamp)) throw new Error('Version invalide');
      if (!b.chapters || typeof b.chapters !== 'object' || Array.isArray(b.chapters) || Object.keys(b.chapters).length > 5000) throw new Error('Chapitres invalides');
      const chapters = Object.create(null);
      for (const [key, value] of Object.entries(b.chapters)) {
        if (!/^partie-\d{1,5}$/.test(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Progression invalide');
        chapters[key] = value;
      }
      let cursor = null;
      if (b.cursor !== null) {
        const c = b.cursor;
        if (!c || !/^partie-\d{1,5}$/.test(c.section) || typeof c.updated !== 'number' || !Number.isFinite(c.updated) || c.updated < 0) throw new Error('Position invalide');
        cursor = {section: c.section, currentFraction: clamp(c.currentFraction), updated: c.updated, percent: Math.max(0, Math.min(100, Number(c.percent) || 0))};
        if (c.position) {
          const p = c.position;
          if (typeof p.signature !== 'string' || p.signature.length > 200 || !Number.isSafeInteger(p.block) || p.block < 0 || !Number.isFinite(p.offset)) throw new Error('Repère invalide');
          cursor.position = {section: c.section, signature: p.signature, block: p.block, offset: Math.max(-100000, Math.min(100000, p.offset)), fragment: Math.max(0, Math.min(10000, Math.floor(Number(p.fragment) || 0)))};
        }
      }
      out[id] = {generation: b.generation, stamp: b.stamp, chapters, cursor};
    }
    return out;
  }
  function mergeBook(a, b) {
    if (!a) return b;
    if (!b) return a;
    const generation = compare(a.generation, b.generation);
    if (generation) return generation > 0 ? a : b;
    const latest = compare(a.stamp, b.stamp) >= 0 ? a : b;
    const chapters = {...a.chapters};
    for (const [id, value] of Object.entries(b.chapters)) chapters[id] = Math.max(chapters[id] || 0, value);
    return {...latest, chapters};
  }
  function merge(a, b) {
    const result = Object.create(null);
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) result[id] = mergeBook(a[id], b[id]);
    return result;
  }
  function clock(books) { return Math.max(0, ...Object.values(books).flatMap(b => [b.generation[0], b.stamp[0]])); }
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  const api = {compare, cleanBooks, mergeBook, merge, clock, stable};
  globalThis.readingSyncCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
