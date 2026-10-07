/* Copie complète transactionnelle de la bibliothèque, limitée au chemin du site. */
const ROOT = new URL('./', self.registration.scope);
const META = 'ebooks-meta-' + ROOT.pathname;
const POINTER = new URL('__offline_state__', ROOT).href;
let syncing;
async function state() {
  const response = await (await caches.open(META)).match(POINTER);
  return response ? response.json() : null;
}
async function synchronize(port) {
  const old = await state();
  const name = 'ebooks-copy-' + ROOT.pathname + '-' + crypto.randomUUID();
  const candidate = await caches.open(name);
  try {
    const response = await fetch(new URL('offline-manifest.json', ROOT), { cache: 'no-store' });
    if (!response.ok) throw new Error('Catalogue de synchronisation inaccessible.');
    const manifest = await response.json();
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Catalogue invalide.');
    let done = 0;
    for (const file of manifest.files) {
      const url = new URL(file.path, ROOT);
      if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) throw new Error('Adresse hors bibliothèque.');
      const asset = await fetch(url, { cache: 'no-store' });
      if (!asset.ok) throw new Error('Téléchargement incomplet : ' + file.path);
      const bytes = await asset.clone().arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256) throw new Error('Le site a changé pendant le téléchargement. Relancez la synchronisation.');
      await candidate.put(url.href, asset);
      port.postMessage({ type: 'PROGRESS', done: ++done, total: manifest.files.length });
    }
    await candidate.put(new URL('offline-manifest.json', ROOT).href, new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
    const current = { cache: name, date: new Date().toISOString(), books: manifest.books, files: manifest.files.length };
    await (await caches.open(META)).put(POINTER, new Response(JSON.stringify(current)));
    // L'ancienne copie reste disponible jusqu'à la validation de tous les fichiers.
    if (old?.cache && old.cache !== name) await caches.delete(old.cache);
    return current;
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'STATUS') port.postMessage({ type: 'DONE', state: await state() });
      else if (event.data.type === 'SYNC') {
        if (!syncing) syncing = synchronize(port).finally(() => { syncing = null; });
        port.postMessage({ type: 'DONE', state: await syncing });
      }
    } catch (e) { port.postMessage({ type: 'ERROR', message: e.message }); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith((async () => {
    const current = await state();
    const canonical = new URL(url.href);
    canonical.search = ''; canonical.hash = '';
    if (canonical.pathname === ROOT.pathname) canonical.pathname += 'index.html';
    if (current) {
      const cached = await (await caches.open(current.cache)).match(canonical.href);
      if (cached) return cached;
    }
    return fetch(event.request);
  })());
});
