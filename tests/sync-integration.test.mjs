import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
if(!globalThis.CustomEvent)globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const events=new EventTarget();globalThis.dispatchEvent=events.dispatchEvent.bind(events);globalThis.addEventListener=events.addEventListener.bind(events);

const db=await import('../js/db.js');
const sync=await import('../js/sync.js');

async function reset(){
  const opened=await db.openDb();
  await db.transaction(db.STORES,'readwrite',tx=>db.STORES.forEach(name=>tx.objectStore(name).clear()));
  await db.setMeta('device_id','11111111-1111-4111-8111-111111111111');
  await db.setMeta('device_token','x'.repeat(43));
  await db.setMeta('household_id','22222222-2222-4222-8222-222222222222');
  await db.setMeta('last_server_revision',0);
  return opened;
}

function cloud({loseFirstResponse=false}={}){
  let revision=0,lost=false;const entities=new Map(),changes=[],processed=new Map(),requests=[];
  globalThis.fetch=async(_url,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    if(request.action==='revision')return Response.json({ok:true,apiVersion:1,data:{serverRevision:revision}});
    assert.equal(request.action,'sync');const acknowledgments=[],conflicts=[];
    for(const mutation of request.changes){
      if(processed.has(mutation.changeId)){acknowledgments.push({...processed.get(mutation.changeId),duplicate:true});continue}
      const existing=entities.get(mutation.entityId),base=Number(existing?.server_revision||0);
      if(base!==mutation.baseServerRevision){conflicts.push({changeId:mutation.changeId,entityType:mutation.entityType,entityId:mutation.entityId,baseServerRevision:mutation.baseServerRevision,serverRevision:base,localPayload:mutation.data,serverPayload:existing});continue}
      revision+=1;const entity={...(existing||{}),...mutation.data,id:mutation.entityId,server_revision:revision};
      if(['archive','delete'].includes(mutation.operation))entity.deleted_at=new Date().toISOString();
      if(mutation.operation==='restore')entity.deleted_at=null;
      entities.set(mutation.entityId,entity);const ack={changeId:mutation.changeId,entityType:mutation.entityType,entityId:mutation.entityId,operation:mutation.operation,serverRevision:revision};processed.set(mutation.changeId,ack);acknowledgments.push(ack);changes.push({revision,changeId:mutation.changeId,entityType:mutation.entityType,entityId:mutation.entityId,operation:mutation.operation,data:entity});
    }
    const response={ok:true,apiVersion:1,data:{acknowledgments,conflicts,changes:changes.filter(change=>change.revision>request.lastServerRevision),currentRevision:revision}};
    if(loseFirstResponse&&!lost&&request.changes.length){lost=true;throw new TypeError('simulated response loss')}
    return Response.json(response);
  };
  return{entities,processed,requests,get revision(){return revision}};
}

test('rapid same-record edits serialize, rebase, and converge to the last value',async()=>{
  await reset();const server=cloud(),id=crypto.randomUUID();
  await sync.localMutation('financial_entry','create',{id,entry_type:'Income',entry_date:'2026-08-14',amount:'1.00',notes:'A'});
  await sync.localMutation('financial_entry','update',{id,amount:'2.00',notes:'B'});
  await sync.localMutation('financial_entry','update',{id,amount:'3.00',notes:'D'});
  const result=await sync.syncNow();
  assert.equal(result.uploaded,3);assert.equal(server.entities.get(id).notes,'D');assert.equal(server.entities.get(id).amount,'3.00');
  assert.deepEqual(server.requests.filter(r=>r.action==='sync'&&r.changes.length).map(r=>r.changes[0].baseServerRevision),[0,1,2]);
  assert.equal((await db.all('outbox')).length,0);assert.equal((await db.get('financial_entries',id)).notes,'D');assert.equal(await db.getMeta('last_server_revision'),3);
});

test('lost response retries one permanent mutation ID without duplicating a transfer',async()=>{
  await reset();const server=cloud({loseFirstResponse:true}),id=crypto.randomUUID();
  await sync.localMutation('financial_entry','create',{id,entry_type:'Transfer',entry_date:'2026-08-14',amount:'50.00',from_account_id:crypto.randomUUID(),to_account_id:crypto.randomUUID()});
  await sync.syncNow();
  assert.equal(server.entities.size,1);assert.equal(server.processed.size,1);assert.equal(server.revision,1);assert.equal((await db.all('outbox')).length,0);
  const mutationIds=server.requests.filter(r=>r.action==='sync'&&r.changes.length).map(r=>r.changes[0].changeId);
  assert.equal(new Set(mutationIds).size,1);assert.ok(mutationIds.length>=2);
});

test('offline tombstone remains durable and synchronizes after reconnect',async()=>{
  await reset();const server=cloud(),id=crypto.randomUUID();
  await sync.localMutation('financial_entry','create',{id,entry_type:'Expense',entry_date:'2026-08-14',amount:'4.00'});await sync.syncNow();
  navigator.onLine=false;await sync.localMutation('financial_entry','delete',{id});
  assert.equal((await db.all('outbox')).length,1);assert.ok((await db.get('financial_entries',id)).deleted_at);
  navigator.onLine=true;await sync.syncNow();
  assert.ok(server.entities.get(id).deleted_at);assert.equal((await db.all('outbox')).length,0);assert.equal(server.revision,2);
});
