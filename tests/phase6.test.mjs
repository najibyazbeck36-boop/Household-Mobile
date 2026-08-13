import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{accountBalances,householdBalance,money}from'../js/models.js';
import{ApiError}from'../js/api.js';
import{createPairingService}from'../js/auth.js';

const root=new URL('../',import.meta.url);
const text=p=>readFile(new URL(p,root),'utf8');
function harness(seed={},responses={}){
  const meta=new Map(Object.entries(seed));
  const calls={pair:[],bootstrap:[],commits:[]};
  const uuids=['uuid-new-1','uuid-new-2'];
  const service=createPairingService({
    readMeta:async(k,f=null)=>meta.has(k)?meta.get(k):f,
    writeMeta:async(k,v)=>meta.set(k,v),
    removeMeta:async k=>meta.delete(k),
    randomUUID:()=>uuids.shift(),
    postPair:async p=>{calls.pair.push(p);const error=typeof responses.pairError==='function'?responses.pairError(calls.pair.length):responses.pairError;if(error)throw error;return{deviceToken:'runtime-token'}},
    postRetry:async p=>{calls.bootstrap.push(p);if(responses.bootstrapError)throw responses.bootstrapError;return responses.snapshot||{householdId:'household',currentRevision:7,members:[{id:'m'}],accounts:[],categories:[],financialEntries:[]}},
    commitBootstrap:async s=>calls.commits.push(s)
  });
  return{meta,calls,service};
}

test('money serializes with two decimals',()=>{assert.equal(money('25'),'25.00');assert.equal(money('2.5'),'2.50');assert.throws(()=>money('1.234'))});
test('transfer is one record and preserves household wealth',()=>{const accounts=[{id:'a'},{id:'b'}],entries=[{id:'t',entry_type:'Transfer',amount:'10.00',from_account_id:'a',to_account_id:'b'}];const b=accountBalances(accounts,entries);assert.equal(entries.length,1);assert.equal(b.get('a'),-10);assert.equal(b.get('b'),10);assert.equal(householdBalance(entries),0)});
test('manifest is project-path safe and valid',async()=>{const m=JSON.parse(await text('manifest.webmanifest'));assert.equal(m.start_url,'./');assert.equal(m.scope,'./');assert.equal(m.display,'standalone');assert.ok(m.icons[0].src.startsWith('./'))});
test('service worker caches shell and excludes API',async()=>{const sw=await text('service-worker.js');for(const asset of ['./index.html','./css/app.css','./js/app.js'])assert.match(sw,new RegExp(asset.replaceAll('.','\\.')));assert.doesNotMatch(sw,/script\.google\.com/)});
test('API uses the CORS proxy while pairing remains single-attempt',async()=>{const api=await text('js/api.js'),auth=await text('js/auth.js');assert.match(api,/attempt<3/);assert.match(api,/postOnce=payload=>request/);assert.match(auth,/postPair\(\{action:'pairDevice'/);assert.match(api,/fetch\(API_URL/);assert.match(api,/workers\.dev/);assert.doesNotMatch(api,/script\.google\.com|transport=jsonp|form\.submit/);assert.doesNotMatch(api,/pairingCode.*URLSearchParams/)});
test('fresh pairing makes one request and bootstraps',async()=>{const h=harness();const snapshot=await h.service.pair(' Phone ',' abcd1234 ');assert.equal(h.calls.pair.length,1);assert.equal(h.calls.bootstrap.length,1);assert.equal(h.calls.commits.length,1);assert.equal(h.calls.pair[0].deviceId,'uuid-new-1');assert.equal(h.meta.get('device_token'),'runtime-token');assert.equal(snapshot.currentRevision,7)});
test('one-time pairing request is never automatically replayed',async()=>{const h=harness({}, {pairError:new ApiError('offline','NETWORK_ERROR')});await assert.rejects(h.service.pair('Phone','ABCD1234'),{code:'NETWORK_ERROR'});assert.equal(h.calls.pair.length,1);assert.equal(h.calls.bootstrap.length,0);assert.equal(h.meta.has('device_token'),false)});
test('INVALID_DEVICE bootstrap clears only token and retains stable identity',async()=>{const h=harness({device_id:'stable-id',device_token:'stale-token',cached_marker:4,outbox_marker:3},{bootstrapError:new ApiError('rejected','INVALID_DEVICE')});await assert.rejects(h.service.pair('Phone',''),{code:'INVALID_DEVICE'});assert.equal(h.meta.has('device_token'),false);assert.equal(h.meta.get('device_id'),'stable-id');assert.equal(h.meta.get('cached_marker'),4);assert.equal(h.meta.get('outbox_marker'),3);assert.equal(h.meta.has('pairing_requires_new_device_id'),false);assert.equal(h.calls.pair.length,0)});
test('fresh re-pair rotates rejected identity only on next explicit submission',async()=>{const h=harness({device_id:'rejected-id',pairing_requires_new_device_id:true});await h.service.pair('Phone','ABCD1234');assert.equal(h.calls.pair.length,1);assert.equal(h.calls.pair[0].deviceId,'uuid-new-1');assert.equal(h.meta.get('device_id'),'uuid-new-1');assert.equal(h.meta.has('pairing_requires_new_device_id'),false)});
test('DEVICE_EXISTS never auto-retries and rotates on the next user submission',async()=>{let first=true;const h=harness({}, {pairError:()=>first?(first=false,new ApiError('exists','DEVICE_EXISTS')):null});await assert.rejects(h.service.pair('Phone','ABCD1234'),{code:'DEVICE_EXISTS'});assert.equal(h.calls.pair.length,1);assert.equal(h.meta.get('pairing_requires_new_device_id'),true);await h.service.pair('Phone','ABCD1234');assert.equal(h.calls.pair.length,2);assert.notEqual(h.calls.pair[1].deviceId,h.calls.pair[0].deviceId)});
test('successful pair followed by interrupted bootstrap retains token',async()=>{const h=harness({}, {bootstrapError:new ApiError('offline','NETWORK_ERROR')});await assert.rejects(h.service.pair('Phone','ABCD1234'),{code:'BOOTSTRAP_PENDING'});assert.equal(h.calls.pair.length,1);assert.equal(h.meta.get('device_token'),'runtime-token')});
test('Continue Setup uses retained token without another pairing request',async()=>{const h=harness({device_id:'stable-id',device_token:'valid-token'});await h.service.pair('Phone','');assert.equal(h.calls.pair.length,0);assert.equal(h.calls.bootstrap.length,1);assert.equal(h.calls.bootstrap[0].deviceToken,'valid-token')});
test('pairing UI exposes progress, prevents duplicate taps, and clears the used code',async()=>{const app=await text('js/app.js');assert.match(app,/Pairing securely/);assert.match(app,/pairButton\.disabled=true/);assert.match(app,/if\(pairingInFlight\)return/);assert.match(app,/continuing\?'Loading…':'Pairing…'/);assert.match(app,/querySelector\('#pairing-code'\)\.value=''/)});
test('outbox retries stable change IDs and remote apply avoids enqueue',async()=>{const s=await text('js/sync.js');assert.match(s,/changeId=crypto\.randomUUID/);assert.match(s,/sentMap=new Map/);assert.match(s,/tx\.objectStore\(store\)\.put/);assert.doesNotMatch(s,/applyResponse[\s\S]*localMutation\(/)});
test('authorization recovery preserves entity and outbox stores',async()=>{const db=await text('js/db.js'),auth=await text('js/auth.js');assert.match(auth,/removeMeta\('device_token'\)/);assert.doesNotMatch(auth,/clear\(|deleteDatabase/);assert.match(db,/bootstrapCommit\(data\)[\s\S]*!\['outbox','conflicts'\]\.includes/)});
test('no committed credential material',async()=>{const files=['index.html','service-worker.js','js/api.js','js/auth.js','js/db.js','js/sync.js','js/views.js'];for(const file of files){const value=await text(file);assert.doesNotMatch(value,/deviceToken\s*[:=]\s*['"][A-Za-z0-9_-]{24,}/);assert.doesNotMatch(value,/HOUSEHOLD_SPREADSHEET_ID|BEGIN PRIVATE KEY|pairingCode\s*[:=]\s*['"][A-Z0-9]{8}/)}});
test('proxy fixes the upstream target, restricts CORS, and never logs bodies',async()=>{const worker=await text('worker/src/index.js'),config=await text('wrangler.jsonc');assert.match(worker,/env\.APPS_SCRIPT_URL/);assert.match(worker,/ALLOWED_ORIGIN = 'https:\/\/najibyazbeck36-boop\.github\.io'/);assert.match(worker,/MAX_BODY_BYTES/);assert.doesNotMatch(worker,/console\.|script\.google\.com/);assert.doesNotMatch(config,/APPS_SCRIPT_URL|script\.google\.com/)});
