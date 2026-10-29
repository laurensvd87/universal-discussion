import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomaticSubjectRetrievalRepository as create} from '../canonical-v4/automatic-subject-retrieval-repository.js';
const scope={generation:'generation-a',matcherHash:'a'.repeat(64)},raw=JSON.stringify;
const snapshot={sourceId:'source-a',sourceVersion:'0',operationId:'operation-a',operationDigest:'b'.repeat(64),sourceStamp:'c'.repeat(64),title:'Steam Deck OLED Repair Help'};
const task={sourceId:'source-a',queueOrdinal:'1',snapshot};
test('index tasks contain bounded current Source witnesses and derive title keys internally',async()=>{
 const calls=[],repo=create({database:{async query(sql,args){calls.push({sql,args});return {rows:[{result:sql.includes('named_index_tasks')?raw([task]):'indexed'}]};}}});
 assert.deepEqual(await repo.indexTasks(raw(scope)),[task]);assert.equal(await repo.index(raw({...scope,task})),'indexed');
 assert.deepEqual(calls[1].args.slice(0,4),[scope.generation,scope.matcherHash,'source-a','1']);assert.deepEqual(JSON.parse(calls[1].args[4]),snapshot);
 assert.deepEqual(JSON.parse(calls[1].args[5]),['steam','deck','oled']);assert(calls[1].sql.includes('$5::jsonb'));
});
test('obsolete or retired work does not fabricate indexing or publication',async()=>{
 const t={...task,snapshot:null};const repo=create({database:{async query(sql,args){assert.equal(args[4],'null');assert.equal(args[5],'[]');return {rows:[{result:'obsolete'}]};}}});
 assert.equal(await repo.index(raw({...scope,task:t})),'obsolete');
});
test('discovery tasks and neighbour transport use fixed parameters without exporting vectors to public ports',async()=>{
 const seed={sourceId:'source-a',indexOrdinal:'4'},repo=create({database:{async query(sql,args){assert.deepEqual(args.slice(0,2),Object.values(scope));
  return {rows:[{result:sql.includes('named_discovery_tasks')?raw([seed]):sql.includes('named_neighbours')?raw([]):true}]};}}});
 assert.deepEqual(await repo.discoveryTasks(raw(scope)),[seed]);assert.deepEqual(await repo.neighbours(raw({...scope,...seed})),[]);assert.equal(await repo.complete(raw({...scope,...seed})),true);
});
test('invalid counters, caller-supplied terms and inconsistent Source snapshots refuse before SQL',async()=>{
 let calls=0;const repo=create({database:{async query(){calls++;throw Error();}}});
 for(const change of [v=>{v.task.queueOrdinal='0';},v=>{v.task.snapshot.sourceId='other';},v=>{v.task.snapshot.sourceVersion='00';},v=>{v.terms=['forged'];}]){
  const v={...scope,task:structuredClone(task)};change(v);await assert.rejects(repo.index(raw(v)),TypeError);
 }assert.equal(calls,0);
});
test('expanded or duplicate task lists and oversized neighbours cannot pass as bounded work',async()=>{
 for(const value of [[task,task],[{...task,extra:true}],Array.from({length:9},(_,i)=>({...task,sourceId:'s-'+i,snapshot:null}))]){
  const repo=create({database:{async query(){return {rows:[{result:raw(value)}]};}}});await assert.rejects(repo.indexTasks(raw(scope)),{code:'storage-corrupt'});
 }
 const repo=create({database:{async query(){return {rows:[{result:raw(Array(129).fill({}))}]};}}});
 await assert.rejects(repo.neighbours(raw({...scope,sourceId:'source-a',indexOrdinal:'1'})),{code:'storage-corrupt'});
});
test('database conflicts and unavailable storage are reported without internal database messages',async()=>{
 for(const [dbCode,code]of [['P1291','conflict'],['P1293','invalid'],['XX000','storage-failure']]){
  const repo=create({database:{async query(){throw Object.assign(Error('sensitive private detail'),{code:dbCode});}}});
  await assert.rejects(repo.indexTasks(raw(scope)),e=>e.code===code&&!e.message.includes('sensitive'));
 }
});
