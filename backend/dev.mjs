// Serveur de validation locale : même API que le Worker, SQLite persistante ignorée par Git.
import http from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import worker from './accounts.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.EBOOKS_DEV_PORT) || 8771;
// Hors de la racine web, même si un autre serveur statique sert ce dépôt.
const privateDir = resolve(tmpdir(), 'ebooks-auth-dev-' + createHash('sha256').update(root).digest('hex').slice(0, 12));
await mkdir(privateDir, {recursive: true});
const secretPath = resolve(privateDir, 'dev-pepper');
let pepper;
try { pepper = await readFile(secretPath, 'utf8'); }
catch { pepper = randomBytes(32).toString('hex'); await writeFile(secretPath, pepper, {mode: 0o600}); }
const db = new DatabaseSync(resolve(privateDir, 'accounts-dev.sqlite'));
db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const statement = db.prepare(sql);
    const make = args => {
      const bindings = args.length ? [Object.fromEntries(args.map((value, i) => ['?' + (i + 1), value]))] : [];
      return {first: async () => statement.get(...bindings) || null, run: async () => statement.run(...bindings), bind: (...values) => make(values)};
    };
    return make([]);
  },
  async batch(statements) {
    db.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
};
const origin = `http://localhost:${port}`;
const configuration = `globalThis.ebooksSyncConfig = { url: '${origin}/api' };`;
const env = {DB, AUTH_PEPPER: pepper, ALLOWED_ORIGINS: origin, MAX_ACCOUNTS: '100'};
async function asset(path) {
  let bytes = await readFile(resolve(root, path));
  if (path === 'sync-config.js') bytes = Buffer.from(configuration);
  else if (path.endsWith('.html')) bytes = Buffer.from(bytes.toString('utf8').replace("globalThis.ebooksSyncConfig = { url: '' };", configuration));
  return bytes;
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) {
      const method = req.method;
      const request = new Request(origin + url.pathname.slice(4), {method, headers: req.headers,
        ...(!['GET', 'HEAD'].includes(method) ? {body: Readable.toWeb(req), duplex: 'half'} : {})});
      const response = await worker.fetch(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const manifest = JSON.parse(await readFile(resolve(root, 'offline-manifest.json'), 'utf8'));
    const publicFiles = new Set(manifest.files.map(f => f.path));
    publicFiles.add('service-worker.js'); publicFiles.add('offline-manifest.json'); publicFiles.add('backend/setup.html');
    const path = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!publicFiles.has(path)) { res.writeHead(404); res.end('Introuvable'); return; }
    let bytes;
    if (path === 'offline-manifest.json') {
      for (const file of manifest.files) file.sha256 = createHash('sha256').update(await asset(file.path)).digest('hex');
      bytes = Buffer.from(JSON.stringify(manifest));
    } else bytes = await asset(path);
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.pdf':'application/pdf'};
    res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(bytes);
  } catch { res.writeHead(500); res.end('Service local indisponible'); }
}).listen(port, '127.0.0.1', () => console.log(`Bibliothèque et comptes de test : ${origin}/index.html#connexion`));
