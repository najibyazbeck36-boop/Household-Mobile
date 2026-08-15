import test from'node:test';
import assert from'node:assert/strict';
import{accountBalances,balanceSummary,orderedAccounts}from'../js/models.js';

const accounts=[
  {id:'saving',name:'Saving',display_order:6,include_in_available_balance:0},
  {id:'wish',name:'Najib Wish',display_order:2,include_in_available_balance:1},
  {id:'cash',name:'Najib Cash',display_order:1,include_in_available_balance:1},
];

test('account order is deterministic',()=>assert.deepEqual(orderedAccounts(accounts).map(a=>a.id),['cash','wish','saving']));
test('saving is separate from available money and transfers change available naturally',()=>{
  const opening=[{entry_type:'Income',amount:'500',account_id:'wish'}];
  let summary=balanceSummary(accounts,opening);
  assert.deepEqual({available:summary.available,savings:summary.savings},{available:500,savings:0});
  const into={entry_type:'Transfer',amount:'200',from_account_id:'wish',to_account_id:'saving'};
  summary=balanceSummary(accounts,[...opening,into]);
  assert.deepEqual({available:summary.available,savings:summary.savings,total:summary.totalAssets},{available:300,savings:200,total:500});
  const out={entry_type:'Transfer',amount:'100',from_account_id:'saving',to_account_id:'cash'};
  summary=balanceSummary(accounts,[...opening,into,out]);
  assert.deepEqual({available:summary.available,savings:summary.savings,total:summary.totalAssets},{available:400,savings:100,total:500});
  assert.equal(accountBalances(accounts,[into]).get('saving'),200);
});
test('legacy accounts without classification remain available',()=>assert.equal(balanceSummary([{id:'old'}],[{entry_type:'Income',amount:'10',account_id:'old'}]).available,10));
