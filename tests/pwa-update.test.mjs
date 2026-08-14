import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import vm from'node:vm';
import'fake-indexeddb/auto';
import{all,getMeta,setMeta,transaction}from'../js/db.js';

const root=new URL('../',import.meta.url);

class MockRequest{
  constructor(input,options={}){this.url=new URL(input?.url||input,'https://example.test/Household-Mobile/').href;this.method=input?.method||'GET';this.mode=options.mode||input?.mode||'same-origin';this.cache=options.cache}
}

async function workerHarness(){
  const source=await readFile(new URL('service-worker.js',root),'utf8'),listeners={},stores=new Map(),deleted=[];
  const cacheApi=name=>({
    async addAll(requests){stores.set(name,new Map(requests.map(request=>[new URL(request.url).pathname,{asset:new URL(request.url).pathname}])));},
    async match(request){const path=new URL(request?.url||request,'https://example.test/Household-Mobile/').pathname;return stores.get(name)?.get(path)},
  });
  stores.set('household-mobile-v20',new Map([['old',{asset:'old'}]]));
  stores.set('unrelated-cache',new Map([['keep',{asset:'keep'}]]));
  let skipped=0,claimed=0;
  const context={URL,Request:MockRequest,fetch:async request=>({network:new URL(request.url).pathname}),caches:{open:async name=>{if(!stores.has(name))stores.set(name,new Map());return cacheApi(name)},keys:async()=>[...stores.keys()],delete:async name=>{deleted.push(name);return stores.delete(name)},match:async request=>{for(const name of stores.keys()){const found=await cacheApi(name).match(request);if(found)return found}}},self:{location:new URL('https://example.test/Household-Mobile/service-worker.js'),addEventListener:(type,handler)=>{listeners[type]=handler},skipWaiting:async()=>{skipped++},clients:{claim:async()=>{claimed++}}},setTimeout,clearTimeout};
  vm.runInNewContext(source,context,{filename:'service-worker.js'});
  return{listeners,stores,deleted,get skipped(){return skipped},get claimed(){return claimed}};
}

async function dispatchWait(handler,event={}){let promise;handler({...event,waitUntil:value=>{promise=Promise.resolve(value)}});await promise}

test('v20 to v21 installs a complete shell and activates immediately',async()=>{
  const worker=await workerHarness();
  await dispatchWait(worker.listeners.install);
  const shell=worker.stores.get('household-mobile-v21');
  assert.ok(shell?.has('/Household-Mobile/index.html'));
  assert.ok(shell?.has('/Household-Mobile/js/app.js'));
  assert.ok(shell?.has('/Household-Mobile/js/sync.js'));
  assert.equal(worker.skipped,1);
  await dispatchWait(worker.listeners.activate);
  assert.equal(worker.stores.has('household-mobile-v20'),false);
  assert.equal(worker.stores.has('unrelated-cache'),true);
  assert.equal(worker.claimed,1);
});

test('worker update preserves IndexedDB financial data, outbox, auth, and revision',async()=>{
  const marker=crypto.randomUUID();
  await transaction(['financial_entries','outbox'],'readwrite',tx=>{tx.objectStore('financial_entries').put({id:marker,entry_type:'Income',amount:12});tx.objectStore('outbox').put({changeId:marker,entityType:'financial_entry',operation:'create',payload:{id:marker},createdAt:new Date().toISOString()})});
  await setMeta('device_token','secret-preserved');await setMeta('device_id','phone-preserved');await setMeta('last_server_revision',63);
  const worker=await workerHarness();await dispatchWait(worker.listeners.install);await dispatchWait(worker.listeners.activate);
  assert.ok((await all('financial_entries')).some(row=>row.id===marker));
  assert.ok((await all('outbox')).some(row=>row.changeId===marker));
  assert.equal(await getMeta('device_token'),'secret-preserved');
  assert.equal(await getMeta('device_id'),'phone-preserved');
  assert.equal(await getMeta('last_server_revision'),63);
});

test('version handshake reports v21 without sensitive state',async()=>{
  const worker=await workerHarness();let reply;
  worker.listeners.message({data:{type:'GET_VERSION'},ports:[{postMessage:value=>{reply=value}}]});
  assert.deepEqual({...reply},{type:'HOUSEHOLD_SW_VERSION',version:'21',cache:'household-mobile-v21'});
  assert.equal(JSON.stringify(reply).includes('token'),false);
});

test('shell is immutable within a worker generation and deployed version stays network-visible',async()=>{
  const source=await readFile(new URL('service-worker.js',root),'utf8');
  assert.match(source,/event\.request\.mode==='navigate'\|\|SHELL_PATHS\.has/);
  assert.match(source,/cache\.match\(key,\{ignoreSearch:true\}\)/);
  assert.match(source,/version\.json.*cache:'no-store'/s);
  assert.doesNotMatch(source,/cache\.put\(/);
});

test('reload coordination is loop-guarded and waits for active synchronization',async()=>{
  const source=await readFile(new URL('js/update.js',root),'utf8');
  assert.match(source,/household-update-reloaded-\$\{targetVersion\}/);
  assert.match(source,/if\(reloadScheduled\)return/);
  assert.match(source,/sessionStorage\.getItem\(guard\)&&!force/);
  assert.match(source,/status\.status!==\'syncing\'/);
  assert.match(source,/addEventListener\('online',checkForUpdate\)/);
  assert.match(source,/visibilityState==='visible'/);
});

test('frontend, worker, deployed app, and cloud versions are observable',async()=>{
  const version=await readFile(new URL('js/version.js',root),'utf8'),app=await readFile(new URL('js/app.js',root),'utf8');
  assert.match(version,/FRONTEND_VERSION='21'/);
  assert.match(version,/CLOUD_DEPLOYMENT_VERSION='13'/);
  assert.match(app,/Service worker/);assert.match(app,/Latest deployed/);assert.match(app,/Device identity/);
  assert.match(app,/row\('Device identity',authenticated\?'Present':'Not configured'\)/);
  assert.doesNotMatch(app,/row\('Device token'/);
});
