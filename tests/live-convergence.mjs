import 'fake-indexeddb/auto';
import {readFile} from 'node:fs/promises';
import {bootstrapCommit,all,getMeta} from '../js/db.js';

const config=JSON.parse(await readFile(new URL('../../data/sync-config.json',import.meta.url),'utf8'));
const response=await fetch('https://household-mobile-api.household-mobile.workers.dev',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8','Origin':'https://najibyazbeck36-boop.github.io'},body:JSON.stringify({apiVersion:1,action:'bootstrap',deviceId:config.device_id,deviceToken:config.device_token})});
const envelope=await response.json();if(!envelope.ok)throw new Error(envelope.error?.message||'Bootstrap failed');
const snapshot=envelope.data;await bootstrapCommit(snapshot);
const stores={members:'members',accounts:'accounts',categories:'categories',financialEntries:'financial_entries'},counts={};let exact=true;
for(const[key,store]of Object.entries(stores)){const stored=await all(store);counts[store]=stored.length;const byId=new Map(stored.map(row=>[row.id,row]));for(const row of snapshot[key])if(JSON.stringify(byId.get(row.id))!==JSON.stringify(row))exact=false}
function balances(rows){const result={};for(const row of rows){if(row.deleted_at||['Expected Income','Expected Expense','Opening Balance'].includes(row.entry_type))continue;const amount=Number(row.amount||0),add=(id,value)=>{if(id)result[id]=Number(((result[id]||0)+value).toFixed(2))};if(row.entry_type==='Income')add(row.account_id,amount);else if(row.entry_type==='Expense')add(row.account_id,-amount);else if(row.entry_type==='Transfer'){add(row.from_account_id,-amount);add(row.to_account_id,amount)}}return result}
const storedFinancials=await all('financial_entries'),storedBalances=balances(storedFinancials),cloudBalances=balances(snapshot.financialEntries),sameBalances=Object.keys({...storedBalances,...cloudBalances}).every(id=>storedBalances[id]===cloudBalances[id]);console.log(JSON.stringify({revision:await getMeta('last_server_revision'),cloudRevision:snapshot.currentRevision,counts,exactEntityPayloads:exact,balanceMatch:sameBalances,balances:storedBalances},null,2));
