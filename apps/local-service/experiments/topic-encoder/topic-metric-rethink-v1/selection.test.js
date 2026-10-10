import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFreshRethink } from './core.js';

const fixture=()=>Array.from({length:4687},(_,i)=>({id:`r${i}`,eventKey:`event-${Math.floor(i/10)}`,duplicateKey:`input-${i}`}));
test('fresh event selection excludes whole prior events and cross-cohort input reuse',()=>{
  const all=fixture(),prior=all.slice(0,20);
  all[30].duplicateKey=all[0].duplicateKey;
  const chosen=selectFreshRethink(all,[prior]);
  assert.equal(chosen.availableEvents,466);
  assert.ok(chosen.documents.length>=250&&chosen.documents.length<=300);
  assert.ok(chosen.documents.every(row=>!['event-0','event-1','event-3'].includes(row.eventKey)));
  const picked=new Set(chosen.documents.map(row=>row.id));
  for(const row of chosen.documents)assert.ok(all.filter(candidate=>candidate.eventKey===row.eventKey).every(candidate=>picked.has(candidate.id)));
  assert.deepEqual(chosen.documents,selectFreshRethink(all,[prior]).documents);
});
test('selection rejects partial-event exposures and copied row objects',()=>{
  const all=fixture();
  assert.throws(()=>selectFreshRethink(all,[all.slice(0,3)]),/PARTIAL_EXPOSURE/u);
  assert.throws(()=>selectFreshRethink(all,[[{...all[0]}]]),/SELECTION_IDENTITY/u);
});
