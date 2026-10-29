import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeAutomaticTopics,DISCOVERY_LIMITS} from './proposals.js';
const DAY=86400000,H='a'.repeat(64),P={minimumSimilarity:.9,minimumMargin:.01,minimumDistinctInputs:2,minimumPublishers:2,maximumObservedSpanMs:7*DAY,maximumPublishedSpanMs:DAY};
const v=angle=>Array.from({length:384},(_,i)=>i===0?Math.cos(angle):i===1?Math.sin(angle):0);
const doc=(id,angle,patch={})=>({sourceId:id,inputHash:id.padEnd(64,'a').slice(0,64).replace(/[^a-f0-9]/gu,'b'),url:'https://'+id+'.example.org/article',title:'Public headline '+id,publisherKey:id+'.example',observedAt:1000,publishedAt:1000,vector:v(angle),...patch});
const run=(observations,patch={})=>proposeAutomaticTopics({representationHash:H,parentId:'nature',kind:'subject',policy:P,observations,...patch});

test('novel coherent documents produce an automatically named proposal without a predefined child',()=>{
 const r=run([doc('a',0,{title:'A newly observed public event'}),doc('b',.12)]);assert.equal(r.proposals.length,1);assert.equal(r.proposals[0].status,'supported-proposal');assert.equal(r.proposals[0].label,'A newly observed public event');assert.equal(r.proposals[0].labelBasis,'representative-source-title');assert.equal(r.assignmentAuthority,false);assert.equal(r.registryChanged,false);
});
test('complete pair support prevents transitive bridges between otherwise unrelated stories',()=>{
 const docs=[doc('a',0),doc('b',.4),doc('c',.8)],r=run(docs);assert.deepEqual(r.proposals.map(p=>p.members.map(m=>m.sourceId)),[['a','b'],['c']]);assert.deepEqual(run([...docs].reverse()),r);
});
test('equally plausible groups leave the new document provisional rather than selecting a nearest tie',()=>{
 const r=run([doc('a',0),doc('b',.8),doc('c',.4,{observedAt:1001})]);assert.equal(r.proposals.length,3);assert.equal(r.proposals[2].reason,'ambiguous-clusters');
});
test('repeated URL, identical material and syndicated vector do not manufacture independent support',()=>{
 for(const patch of [{url:'https://a.example.org/article'},{inputHash:doc('a',0).inputHash},{vector:v(0)}]){const r=run([doc('a',0),doc('b',.12,patch)]);assert.equal(r.proposals[0].distinctInputs,1);assert.equal(r.proposals[0].status,'provisional-proposal');}
 const samePublisher=run([doc('a',0),doc('b',.12,{publisherKey:'a.example'})]);assert.equal(samePublisher.proposals[0].publishers,1);assert.equal(samePublisher.proposals[0].status,'provisional-proposal');
 const duplicateChain=run([doc('a',0),doc('b',.09),doc('c',.18)]);assert.equal(duplicateChain.proposals[0].distinctInputs,1);assert.equal(duplicateChain.proposals[0].status,'provisional-proposal');
});
test('news events require explicit publication dates; visit recency cannot invent an event date',()=>{
 const unknown=run([doc('a',0,{publishedAt:null}),doc('b',.12)],{kind:'event'});assert.equal(unknown.proposals.length,2);assert.equal(unknown.proposals[0].reason,'publication-time-unknown');
 const oldEvent=run([doc('a',0),doc('b',.12,{publishedAt:1000+2*DAY})],{kind:'event'});assert.equal(oldEvent.proposals.length,2);
 const event=run([doc('a',0),doc('b',.12,{publishedAt:1000+DAY})],{kind:'event'});assert.equal(event.proposals[0].status,'supported-proposal');
});
test('bounded observed window expires grouping candidates without modifying old discussion identities',()=>{
 const r=run([doc('a',0),doc('b',.12,{observedAt:1000+8*DAY})]);assert.equal(r.proposals.length,2);assert.equal(r.registryChanged,false);
});
test('labels retain source attribution, normalize text and cannot break UTF-16 at the bound',()=>{
 const r=run([doc('a',0,{title:'é'.normalize('NFD')+'😀'.repeat(90)})]);assert.ok(Array.from(r.proposals[0].label).length<=160);assert.equal(r.proposals[0].label.isWellFormed(),true);assert.equal(r.proposals[0].labelSourceId,'a');assert.equal(r.proposals[0].label,r.proposals[0].label.normalize('NFC'));assert.ok(Object.isFrozen(r.proposals[0].members));
});
test('hard bounds and hostile input refusals occur before any accessor or proxy hook',()=>{
 assert.equal(DISCOVERY_LIMITS.maximumPairs,2016);assert.throws(()=>run(Array.from({length:65},(_,i)=>doc('a'+i,.1))));
 let hooks=0;const hostile=new Proxy({}, {get(){hooks++;throw Error('hook');},ownKeys(){hooks++;throw Error('hook');},getPrototypeOf(){hooks++;throw Error('hook');}});assert.throws(()=>run([hostile]));assert.equal(hooks,0);
 const getter={...doc('a',0)};Object.defineProperty(getter,'title',{enumerable:true,get(){hooks++;return 'private';}});assert.throws(()=>run([getter]));assert.equal(hooks,0);
 for(const patch of [{vector:Array(384).fill(0)},{vector:Array(384).fill(NaN)},{url:'https://a.example.org/accounts/private'},{publishedAt:NaN},{title:'bad\ud800'}])assert.throws(()=>run([doc('a',0,patch)]));
});
test('maximum cohort reports finite exact geometric work with no encoding or full catalog scan',()=>{
 const r=run(Array.from({length:64},(_,i)=>doc('a'+i,i*.02)));assert.equal(r.work.pairs,2016);assert.equal(r.work.coordinateProducts,2016*384);assert.equal(r.work.matrixBytes,64*64*8);assert.equal(r.semanticQualityMeasured,false);
});
