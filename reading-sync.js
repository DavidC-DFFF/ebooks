// Connexion personnelle et synchronisation hors connexion. Aucun mot de passe conservé.
(() => {
  const core = globalThis.readingSyncCore;
  const endpoint = globalThis.ebooksSyncConfig?.url?.replace(/\/$/, '') || '';
  const safeEndpoint = /^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(endpoint) || /^http:\/\/(localhost|127\.0\.0\.1):\d+\/api$/.test(endpoint);
  const authKey = 'ebooks-sync-session-v2', deviceKey = 'ebooks-sync-device-v1';
  const profileKey = id => 'ebooks-sync-state-v2:' + (id || 'guest');
  let sessionAuth = null, reauthRequired = false;
  try { sessionAuth = JSON.parse(sessionStorage.getItem(authKey)) || JSON.parse(localStorage.getItem(authKey)); } catch {}
  const auth = () => sessionAuth;
  let ledgerKey = profileKey(auth()?.user?.id), accountVersion = 0;
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const store = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let books = Object.create(null), busy = false, timer, failures = 0, device;
  try {
    device = localStorage.getItem(deviceKey) || crypto.randomUUID();
    localStorage.setItem(deviceKey, device);
    books = core.cleanBooks(read(ledgerKey) || (auth() ? {} : read('ebooks-sync-state-v1')) || {});
  } catch {}
  device ||= 'temporary';
  const root = new URL(document.querySelector('a[aria-label="Retour à la bibliothèque"]')?.getAttribute('href') || './index.html', location.href);
  let metadata = {};
  const metadataReady = fetch(new URL('sync-books.json', root)).then(r => r.ok ? r.json() : {}).then(value => { metadata = value; }).catch(() => {});
  const status = document.getElementById('sync-status');
  const say = message => { if (status) status.textContent = message; };
  function reloadLocal() {
    try { books = core.merge(books, core.cleanBooks(read(ledgerKey) || {})); } catch {}
  }
  function persist() { reloadLocal(); localStorage.setItem(ledgerKey, core.stable(books)); }
  function raw(prefix) {
    const reading = read(prefix + '-reading');
    const section = reading?.section || localStorage.getItem(prefix + '-last');
    if (!/^partie-\d{1,5}$/.test(section || '')) return null;
    const position = read(prefix + '-position');
    return {section, percent: reading?.percent || 0, currentFraction: reading?.currentFraction || 0,
      updated: reading?.updated || 0, ...(position?.section === section ? {position} : {})};
  }
  function capture(prefix, reset = false) {
    try {
      reloadLocal();
      const previous = books[prefix], cursor = reset ? null : raw(prefix);
      if (!reset && !cursor) return;
      const chapters = reset ? {} : read(prefix + '-chapters') || {};
      if (!reset && previous && core.stable(previous.cursor) === core.stable(cursor) && core.stable(previous.chapters) === core.stable(chapters)) return;
      const stamp = [Math.max(Date.now(), core.clock(books) + 1), device];
      const entry = core.cleanBooks({[prefix]: {generation: reset ? stamp : previous?.generation || [0, ''], stamp, chapters, cursor}})[prefix];
      books[prefix] = reset ? entry : core.mergeBook(previous, entry);
      persist(); schedule();
    } catch { say('Stockage local indisponible : synchronisation suspendue.'); }
  }
  // Importer les anciens états de cet appareil dans le profil courant.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.endsWith('-reading')) continue;
      const prefix = key.slice(0, -8);
      if (books[prefix]) continue;
      const cursor = raw(prefix);
      if (!cursor) continue;
      try { books[prefix] = core.cleanBooks({[prefix]: {generation: [0, ''], stamp: [Math.max(0, Math.floor(cursor.updated)), device], chapters: read(prefix + '-chapters') || {}, cursor}})[prefix]; } catch {}
    }
    persist();
  } catch {}
  function apply() {
    const changed = [];
    for (const [prefix, entry] of Object.entries(books)) {
      const before = [localStorage.getItem(prefix + '-reading'), localStorage.getItem(prefix + '-chapters')];
      if (!entry.cursor) {
        for (const key of ['reading', 'position', 'last', 'chapters']) localStorage.removeItem(prefix + '-' + key);
      } else {
        const {position, ...reading} = entry.cursor, weights = metadata[prefix];
        if (weights) {
          const total = Object.values(weights).reduce((a, b) => a + b, 0);
          const done = Object.entries(weights).reduce((n, [id, weight]) => n + weight * (entry.chapters[id] || 0), 0);
          reading.percent = done >= total ? 100 : Math.min(99, Math.round(done / total * 100));
        }
        store(prefix + '-reading', reading); store(prefix + '-chapters', entry.chapters);
        localStorage.setItem(prefix + '-last', reading.section);
        if (position) store(prefix + '-position', position);
        else localStorage.removeItem(prefix + '-position');
      }
      if (before[0] !== localStorage.getItem(prefix + '-reading') || before[1] !== localStorage.getItem(prefix + '-chapters')) changed.push(prefix);
    }
    if (changed.length) dispatchEvent(new CustomEvent('reading-sync-applied', {detail: changed}));
  }
  async function request(path, options = {}, credential = auth()) {
    const response = await fetch(endpoint + path, {...options, cache: 'no-store', credentials: 'omit',
      signal: AbortSignal.timeout(15000), headers: {...options.headers, ...(credential?.token ? {Authorization: 'Bearer ' + credential.token} : {})}});
    const data = await response.json();
    if (!response.ok && !(path === '/v1/state' && response.status === 409)) {
      const error = new Error(data.error || 'Connexion indisponible. Tes lectures restent sur cet appareil.');
      error.status = response.status;
      if (response.status === 401 && path !== '/v1/login') {
        reauthRequired = true;
        dispatchEvent(new Event('reading-account-changed'));
      }
      throw error;
    }
    return {status: response.status, data};
  }
  function schedule(delay = 3000) {
    clearTimeout(timer);
    if (safeEndpoint && auth()) timer = setTimeout(sync, delay);
  }
  async function sync() {
    if (busy) return;
    if (!safeEndpoint) { say('La connexion aux comptes est en cours de préparation.'); return; }
    if (!auth()) { say('Connecte-toi pour synchroniser tes lectures.'); return; }
    if (!navigator.onLine) { say('Hors connexion · lectures conservées sur cet appareil.'); return; }
    busy = true; say('Synchronisation des lectures…');
    const version = accountVersion, credential = auth();
    try {
      await metadataReady;
      let {data: remote} = await request('/v1/state', {}, credential);
      for (let attempt = 0; attempt < 4; attempt++) {
        if (version !== accountVersion) return;
        const remoteBooks = core.cleanBooks(remote.books);
        reloadLocal(); books = core.merge(books, remoteBooks); persist(); apply();
        if (core.stable(books) === core.stable(remoteBooks)) break;
        const response = await request('/v1/state', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({revision: remote.revision, books})}, credential);
        if (version !== accountVersion) return;
        if (response.status !== 409) break;
        if (attempt === 3) throw new Error('Un autre appareil synchronise ses lectures. Nouvelle tentative dans quelques instants.');
        remote = response.data;
      }
      failures = 0;
      say('Lectures synchronisées · ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}));
    } catch (error) {
      if (version !== accountVersion) return;
      failures++; say(error.message);
      if (error.status !== 401) schedule(Math.min(300000, 15000 * 2 ** Math.min(failures, 4)));
    } finally { busy = false; }
  }
  function clearProjection() {
    for (const prefix of Object.keys(books))
      for (const key of ['reading', 'position', 'last', 'chapters']) localStorage.removeItem(prefix + '-' + key);
  }
  function switchProfile(credential, remember, importLocal = false) {
    persist();
    const guest = !auth() && importLocal ? books : {};
    const changed = Object.keys(books);
    clearProjection();
    accountVersion++;
    sessionAuth = credential;
    reauthRequired = false;
    ledgerKey = profileKey(credential?.user?.id);
    books = core.merge(core.cleanBooks(read(ledgerKey) || {}), guest);
    localStorage.removeItem(authKey); sessionStorage.removeItem(authKey);
    if (credential) {
      (remember ? localStorage : sessionStorage).setItem(authKey, JSON.stringify(credential));
      if (importLocal && Object.keys(guest).length) localStorage.removeItem(profileKey(null));
    }
    persist(); apply();
    dispatchEvent(new CustomEvent('reading-sync-applied', {detail: changed}));
    dispatchEvent(new Event('reading-account-changed'));
  }
  async function authenticate(mode, username, password, remember = true, importLocal = true) {
    if (!safeEndpoint) throw new Error('Le service est en cours de préparation.');
    const {data: credential} = await request('/v1/' + mode, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password, remember})}, null);
    switchProfile(credential, remember, importLocal);
    await sync();
  }
  async function disconnect() {
    const credential = auth();
    clearTimeout(timer);
    switchProfile(null, false);
    say('Déconnecté. Tu peux continuer à lire sur cet appareil.');
    if (credential && safeEndpoint && navigator.onLine) {
      try { await request('/v1/logout', {method: 'POST'}, credential); }
      catch { say('Déconnecté sur cet appareil. La session serveur expirera automatiquement.'); }
    }
  }
  globalThis.ebooksSync = {capture, sync, login: (...args) => authenticate('login', ...args), register: (...args) => authenticate('register', ...args), disconnect, connected: () => !!auth() && !reauthRequired, user: () => auth()?.user || null};
  addEventListener('storage', event => {
    if (event.key === authKey) {
      const credential = read(authKey);
      if (credential?.token === auth()?.token) return;
      const changed = Object.keys(books);
      clearProjection(); accountVersion++; sessionAuth = credential;
      ledgerKey = profileKey(credential?.user?.id);
      books = core.cleanBooks(read(ledgerKey) || {}); apply();
      dispatchEvent(new CustomEvent('reading-sync-applied', {detail: changed}));
      dispatchEvent(new Event('reading-account-changed')); schedule(100);
      return;
    }
    if (event.key !== ledgerKey) return;
    try { books = core.merge(books, core.cleanBooks(JSON.parse(event.newValue || '{}'))); persist(); apply(); } catch {}
  });
  addEventListener('online', () => schedule(100));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(100); });
  setInterval(() => { if (!document.hidden) schedule(100); }, 60000);
  schedule(100);
  say(auth() ? 'Lectures à synchroniser…' : 'Lectures enregistrées sur cet appareil.');
})();
