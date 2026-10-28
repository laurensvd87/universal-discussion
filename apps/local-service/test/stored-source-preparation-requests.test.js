import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoredSourcePreparationRequests} from '../src/application/stored-source-preparation-requests.js';

const input={generation:'generation',sourceId:'source-1'};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('urgency is optional, inert and deduplicated with finite SQL timeouts and no publication',async()=>{
 let time=0,calls=0;const sql=[];
 const requester=createStoredSourcePreparationRequests({now:()=>time,database:{async transaction(work){calls++;return work({async query(text,args){sql.push([text,args]);return {rows:[{requested:true}]};}});}}});
 assert.equal(calls,0);assert.deepEqual(await Promise.all([requester.request(input),requester.request(input)]),[true,true]);assert.equal(calls,1);
 assert.deepEqual(sql,[ ["SET LOCAL lock_timeout='25ms'",undefined],["SET LOCAL statement_timeout='100ms'",undefined],
  ['SELECT canonical_v4.semantic_request_source_preparation($1,$2) AS requested',['generation','source-1']] ]);
 time=999;assert.equal(await requester.request(input),true);assert.equal(calls,1);
 time=1000;await requester.request(input);assert.equal(calls,2);await requester.close();assert.equal(await requester.request(input),false);assert.equal(calls,2);
});

test('eight original transactions bound concurrent pressure and close drains originals including failures',async()=>{
 const holds=[],requester=createStoredSourcePreparationRequests({database:{transaction(){const d=deferred();holds.push(d);return d.promise;}}});
 const works=Array.from({length:8},(_,i)=>requester.request({...input,sourceId:'source-'+i}));
 assert.equal(await requester.request({...input,sourceId:'source-overflow'}),false);assert.equal(holds.length,8);
 let closed=false;const closing=requester.close().then(()=>{closed=true;});assert.equal(requester.close(),requester.close());await turn();assert.equal(closed,false);
 holds.slice(0,7).forEach(d=>d.resolve(true));await turn();assert.equal(closed,false);holds[7].reject(Error('Private SQL failure'));
 await closing;assert.deepEqual(await Promise.all(works),Array(8).fill(false));assert.equal(closed,true);
});

test('failures remain finite, expired duplicates still respect the outstanding cap, invalid inputs never issue SQL',async()=>{
 let time=0,calls=0;const holds=[],requester=createStoredSourcePreparationRequests({now:()=>time,database:{transaction(){calls++;const d=deferred();holds.push(d);return d.promise;}}});
 const works=Array.from({length:8},(_,i)=>requester.request({...input,sourceId:'source-'+i}));time=2000;
 assert.equal(await requester.request(input),false);assert.equal(calls,8);
 await assert.rejects(requester.request({...input,extra:true}),e=>e.code==='invalid');assert.equal(calls,8);
 holds.forEach(d=>d.reject(Error('Private failure')));assert.deepEqual(await Promise.all(works),Array(8).fill(false));await requester.close();
 const sync=createStoredSourcePreparationRequests({database:{transaction(){throw Error('private');}}});assert.equal(await sync.request(input),false);await sync.close();
});
