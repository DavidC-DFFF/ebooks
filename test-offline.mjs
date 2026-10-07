import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

function worker() {
  const stores = new Map(), handlers = {}, requests = [];
  let fail = false, badHash = false;
  const root='https://example.test/ebooks/';
  const assets=new Map([[root+'index.html','home'],[root+'livres/one.html','book']]);
  const caches={
    async open(name) {
      if (!stores.has(name)) stores.set(name,new Map());
      const store=stores.get(name);
      return {async match(url){return store.get(String(url))?.clone()},async put(url,r){store.set(String(url),r.clone())}};
    },
    async delete(name){return stores.delete(name)}
  };
  const hash=async s=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
  const fetch=async request=>{
    const url=String(request.url||request); requests.push(url);
    if (fail) throw new Error('offline');
    if(url===root+'offline-manifest.json') {
      const files=[];
      for(const [path,content] of assets) files.push({path:path.slice(root.length),sha256:badHash?'invalid':await hash(content)});
      return new Response(JSON.stringify({books:1,files}));
    }
    return assets.has(url)?new Response(assets.get(url)):new Response('missing',{status:404});
  };
  vm.runInNewContext(readFileSync('service-worker.js','utf8'),{
    URL,Response,Uint8Array,crypto:webcrypto,caches,fetch,
    self:{registration:{scope:root},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers[name]=fn}
  });
  return {
    requests,stores,setOffline(v){fail=v},setBadHash(v){badHash=v},
    async send(type){let pending;const messages=[];handlers.message({data:{type},ports:[{postMessage:m=>messages.push(m)}],waitUntil:p=>pending=p});await pending;return messages.at(-1)},
    async navigate(path){let response;handlers.fetch({request:new Request(root+path),respondWith:r=>response=r});return response},
  };
}
test('la copie complète sert un livre jamais ouvert et la racine sans réseau',async()=>{
  const w=worker(); const synced=await w.send('SYNC'); assert.equal(synced.type,'DONE');
  w.setOffline(true); const before=w.requests.length;
  assert.equal(await (await w.navigate('livres/one.html')).text(),'book');
  assert.equal(await (await w.navigate('')).text(),'home');
  assert.equal(w.requests.length,before);
});
test('une erreur réseau ne remplace pas la copie précédente',async()=>{
  const w=worker(); const initial=(await w.send('SYNC')).state;
  w.setOffline(true); assert.equal((await w.send('SYNC')).type,'ERROR');
  assert.equal((await w.send('STATUS')).state.cache,initial.cache);
  assert.equal(await (await w.navigate('livres/one.html')).text(),'book');
  assert.equal(w.stores.size,2);
});
test('une mise à jour incohérente est rejetée puis une copie valide remplace la précédente',async()=>{
  const w=worker(); const initial=(await w.send('SYNC')).state;
  w.setBadHash(true); assert.equal((await w.send('SYNC')).type,'ERROR');
  assert.equal((await w.send('STATUS')).state.cache,initial.cache);
  w.setBadHash(false); const next=(await w.send('SYNC')).state;
  assert.notEqual(next.cache,initial.cache);assert.equal(w.stores.has(initial.cache),false);
});
