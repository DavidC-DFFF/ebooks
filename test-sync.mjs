import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker, {keyHash} from './backend/accounts.mjs';
const require = createRequire(import.meta.url);
const core = require('./sync-core.js');
const entry = (n, chapters, fraction = .5, device = 'pc') => ({generation: [0, ''], stamp: [n, device], chapters, cursor: {section: 'partie-0', currentFraction: fraction, updated: n, percent: 50}});
test('deux appareils lisent des chapitres différents et conservent le curseur récent', () => {
  const a = {'livre-01': entry(10, {'partie-0': 1}, 1)};
  const b = {'livre-01': entry(20, {'partie-1': .6}, .6, 'phone')};
  const merged = core.merge(a, b);
  assert.deepEqual(merged['livre-01'].chapters, {'partie-0': 1, 'partie-1': .6});
  assert.equal(merged['livre-01'].cursor.updated, 20);
  assert.equal(core.stable(merged), core.stable(core.merge(b, a)));
  assert.equal(core.stable(merged), core.stable(core.merge(merged, merged)));
});
test('une remise à zéro résiste à un appareil ancien revenant hors connexion', () => {
  const reset = {generation: [30, 'pc'], stamp: [30, 'pc'], chapters: {}, cursor: null};
  const stale = entry(100, {'partie-0': 1});
  assert.deepEqual(core.mergeBook(reset, stale), reset);
  const fresh = {...entry(31, {'partie-0': .2}), generation: [30, 'pc']};
  assert.equal(core.mergeBook(reset, fresh).chapters['partie-0'], .2);
});
test('retour en arrière : la position recule et le maximum reste conservé', () => {
  const merged = core.mergeBook(entry(10, {'partie-0': .8}, .8), entry(11, {'partie-0': .3}, .3));
  assert.equal(merged.cursor.currentFraction, .3);
  assert.equal(merged.chapters['partie-0'], .8);
});
test('la fusion converge indépendamment de l’ordre des trois appareils', () => {
  const a = {'livre-01': entry(10, {'partie-0': .8})}, b = {'livre-01': entry(11, {'partie-1': .3}, .3, 'phone')}, c = {'livre-01': entry(12, {'partie-0': .4}, .4, 'tablet')};
  assert.equal(core.stable(core.merge(core.merge(a,b),c)), core.stable(core.merge(a,core.merge(b,c))));
});
test('les versions et progressions invalides sont rejetées', () => {
  assert.throws(() => core.cleanBooks({'livre-01': entry(-1, {})}));
  assert.throws(() => core.cleanBooks({'livre-01': entry(1, {'partie-0': 2})}));
  assert.throws(() => core.cleanBooks({'../escape': entry(1, {})}));
});
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./backend/schema.sql', import.meta.url), 'utf8'));
  return {raw: db, prepare(sql) {
    const statement = db.prepare(sql);
    const make = args => {
      const bindings = args.length ? [Object.fromEntries(args.map((value, i) => ['?' + (i + 1), value]))] : [];
      return {first: async () => statement.get(...bindings) || null, run: async () => statement.run(...bindings), bind: (...values) => make(values)};
    };
    return make([]);
  }, async batch(statements) {
    db.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
    catch(error) { db.exec('ROLLBACK'); throw error; }
  }};
}
function environment() { return {DB: database(), ALLOWED_ORIGINS: 'https://davidc-dfff.github.io', AUTH_PEPPER: 'test-only-pepper-32-characters-minimum'}; }
function request(path = '/v1/state', method = 'GET', body, token = '', origin = 'https://davidc-dfff.github.io') {
  return new Request('https://reading.test' + path, {method, headers: {Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
}
const password = 'test-only-very-long-password';
async function register(env, username = 'david') {
  const response = await worker.fetch(request('/v1/register','POST',{username,password,remember:true}),env);
  assert.equal(response.status,201);
  return response.json();
}
test('création de compte, mots de passe salés et absence de secrets dans la réponse',async()=>{
  const env=environment(), session=await register(env);
  assert.equal(session.user.username,'david');
  assert.equal(session.token.length,64);
  const row=env.DB.raw.prepare('SELECT * FROM users').get();
  assert.notEqual(row.password_hash,password);
  assert.ok(row.password_salt.length>=32);
  assert.equal(Object.keys(session).sort().join(','),'expiresAt,token,user');
  assert.equal(env.DB.raw.prepare('SELECT token_hash FROM sessions').get().token_hash,await keyHash(session.token));
});
test('connexion, identifiant indisponible, mauvais mot de passe et origine étrangère',async()=>{
  const env=environment();await register(env);
  const login=await worker.fetch(request('/v1/login','POST',{username:'DAVID',password}),env);
  assert.equal(login.status,200);
  assert.equal((await worker.fetch(request('/v1/register','POST',{username:'david',password}),env)).status,409);
  assert.equal((await worker.fetch(request('/v1/login','POST',{username:'david',password:'wrong'}),env)).status,401);
  assert.equal((await worker.fetch(request('/v1/state','GET',null,'bad'),env)).status,401);
  assert.equal((await worker.fetch(request('/v1/login','POST',{username:'david',password},'','https://foreign.test'),env)).status,403);
});
test('chaque compte dispose de ses lectures, sans possibilité de choisir un autre utilisateur',async()=>{
  const env=environment(),a=await register(env),b=await register(env,'autre');
  const books={'livre-01':entry(1,{'partie-0':.5})};
  assert.equal((await worker.fetch(request('/v1/state','PUT',{revision:0,books,user_id:b.user.id},a.token),env)).status,200);
  const own=await(await worker.fetch(request('/v1/state','GET',null,a.token),env)).json();
  const other=await(await worker.fetch(request('/v1/state','GET',null,b.token),env)).json();
  assert.equal(own.books['livre-01'].chapters['partie-0'],.5);assert.deepEqual(other.books,{});
  const conflict=await worker.fetch(request('/v1/state','PUT',{revision:0,books:{}},a.token),env);
  assert.equal(conflict.status,409);assert.equal((await conflict.json()).revision,1);
});
test('déconnexion serveur et expiration des sessions',async()=>{
  const env=environment(),session=await register(env);
  assert.equal((await worker.fetch(request('/v1/logout','POST',null,session.token),env)).status,200);
  assert.equal((await worker.fetch(request('/v1/me','GET',null,session.token),env)).status,401);
  const next=await register(env,'autre');
  env.DB.raw.exec('UPDATE sessions SET expires_at=0');
  assert.equal((await worker.fetch(request('/v1/state','GET',null,next.token),env)).status,401);
});
test('limitation des tentatives et validation des formulaires',async()=>{
  const env=environment();await register(env);
  let response;
  for(let i=0;i<11;i++)response=await worker.fetch(request('/v1/login','POST',{username:'david',password:'wrong'}),env);
  assert.equal(response.status,429);
  assert.equal((await worker.fetch(request('/v1/register','POST',{username:'short',password:'a'}),environment())).status,201);
  assert.equal((await worker.fetch(request('/v1/register','POST',{username:'empty',password:''}),environment())).status,400);
  assert.equal((await worker.fetch(request('/v1/register','POST',{username:'x',password:'a'}),environment())).status,201);
  assert.equal((await worker.fetch(request('/v1/login','POST',{username:' ',password}),environment())).status,400);
});
test('JSON invalide et document trop volumineux ne modifient pas la base',async()=>{
  const env=environment(),s=await register(env);
  assert.equal((await worker.fetch(request('/v1/state','PUT',{revision:0,books:{bad:{}}},s.token),env)).status,400);
  assert.equal((await worker.fetch(request('/v1/state','PUT',{revision:0,books:{},padding:'x'.repeat(600000)},s.token),env)).status,413);
  assert.equal((await(await worker.fetch(request('/v1/state','GET',null,s.token),env)).json()).revision,0);
});
class Storage {
  values=new Map();get length(){return this.values.size}key(i){return [...this.values.keys()][i]}
  getItem(k){return this.values.get(k)??null}setItem(k,v){this.values.set(k,String(v))}removeItem(k){this.values.delete(k)}
}
function client(env,name) {
  const storage=new Storage(),session=new Storage();
  const context=vm.createContext({console,TextEncoder,TextDecoder,URL,AbortSignal,CustomEvent,Event,
    crypto:{subtle:webcrypto.subtle,randomUUID:()=>name},localStorage:storage,sessionStorage:session,
    location:{href:'https://davidc-dfff.github.io/ebooks/index.html'},navigator:{onLine:true},
    document:{hidden:false,getElementById:()=>null,querySelector:()=>null,addEventListener(){}},
    addEventListener(){},dispatchEvent(){},setTimeout:()=>1,clearTimeout(){},setInterval(){},
    fetch:async(url,options={})=>String(url).endsWith('sync-books.json')?Response.json({'livre-01':{'partie-0':1,'partie-1':3}}):worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:'https://davidc-dfff.github.io'}}),env)
  });
  vm.runInContext(readFileSync(new URL('./sync-core.js',import.meta.url),'utf8'),context);
  context.ebooksSyncConfig={url:'https://reading.test.workers.dev'};
  vm.runInContext(readFileSync(new URL('./reading-sync.js',import.meta.url),'utf8'),context);
  return {api:context.ebooksSync,storage,session,context};
}
test('deux clients : compte, hors connexion, fusion, reset et séparation après déconnexion',async()=>{
  const env=environment(),pc=client(env,'pc'),phone=client(env,'phone');
  await pc.api.register('David',password,true);
  await phone.api.login('david',password,false);
  assert.ok(pc.storage.getItem('ebooks-sync-session-v2'));
  assert.equal(phone.storage.getItem('ebooks-sync-session-v2'),null);
  assert.ok(phone.session.getItem('ebooks-sync-session-v2'));
  const save=(c,section,fraction,chapters)=>{
    c.storage.setItem('livre-01-reading',JSON.stringify({section,currentFraction:fraction,updated:Date.now(),percent:0}));
    c.storage.setItem('livre-01-chapters',JSON.stringify(chapters));c.api.capture('livre-01');
  };
  pc.context.navigator.onLine=false;phone.context.navigator.onLine=false;
  save(pc,'partie-0',.8,{'partie-0':.8});save(phone,'partie-1',.5,{'partie-1':.5});
  await pc.api.sync();
  pc.context.navigator.onLine=true;phone.context.navigator.onLine=true;
  await pc.api.sync();await phone.api.sync();await pc.api.sync();
  assert.deepEqual(JSON.parse(pc.storage.getItem('livre-01-chapters')),{'partie-0':.8,'partie-1':.5});
  assert.ok(Math.abs(JSON.parse(pc.storage.getItem('livre-01-reading')).percent-57.5)<=.5);
  phone.api.capture('livre-01',true);await phone.api.sync();await pc.api.sync();
  assert.equal(pc.storage.getItem('livre-01-reading'),null);
  save(pc,'partie-0',.6,{'partie-0':.6});await pc.api.sync();
  await pc.api.disconnect();assert.equal(pc.api.connected(),false);assert.equal(pc.storage.getItem('livre-01-reading'),null);
  await pc.api.register('autre',password,true,false);assert.equal(pc.storage.getItem('livre-01-reading'),null);
  await pc.api.disconnect();await pc.api.login('david',password,true,false);
  assert.equal(JSON.parse(pc.storage.getItem('livre-01-chapters'))['partie-0'],.6);
});
