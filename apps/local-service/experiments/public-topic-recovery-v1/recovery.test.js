import test from 'node:test';import assert from 'node:assert/strict';
import {publicTopicEncoderInput as input,comparePublishedTopicRecovery as compare} from './recovery.js';
const hash='a'.repeat(64),v=(x,y=0)=>[x,y,...Array(382).fill(0)];
const publicBody='Jaguar is a large wild cat living in tropical American forests.';
const candidate=(topicId,vector=v(1),body=publicBody,rootId=topicId)=>{
 const p={topicId,rootId,caption:'Jaguar',body};return {...p,publicDigest:input(JSON.stringify(p)).publicDigest,representationHash:hash,vector};
};
const run=(candidates,memberVectors=[v(1),v(.99,Math.sqrt(1-.99**2))],label='Jaguar')=>compare(JSON.stringify({representationHash:hash,label,memberVectors,candidates}));
const decision=(r,strategy)=>r.decisions.find(d=>d.strategy===strategy);

test('literal-only identity accepts the wrong Jaguar; public discussion evidence refuses it',()=>{
 const r=run([candidate('car',v(0,1),'Jaguar builds luxury cars with electric motors and advanced driving systems.')]);
 assert.equal(decision(r,'literal-name').topicId,'car');assert.equal(decision(r,'literal-and-public-semantic').status,'unresolved');
});
test('a coherent public root recovers its existing topic without an old Source prototype',()=>{
 const r=run([candidate('animals')]);assert.equal(decision(r,'literal-and-public-semantic').topicId,'animals');
 assert.equal(r.assignmentAuthority,false);assert.equal(r.sourceMetadataRetained,false);assert(Object.isFrozen(r.decisions));
});
test('each fresh member must agree, not just the centroid or best page',()=>{
 const r=run([candidate('animals')],[v(1),v(.7,Math.sqrt(1-.7**2))]);assert.equal(decision(r,'public-semantic').status,'unresolved');
});
test('different occupied scopes with close evidence abstain; repeated roots of the same scope do not manufacture ambiguity',()=>{
 const c=candidate('animals2',v(.99,Math.sqrt(1-.99**2)));assert.equal(decision(run([candidate('animals'),c]),'public-semantic').status,'ambiguous');
 assert.equal(decision(run([candidate('animals'),candidate('animals',v(1),publicBody,'root2')]),'public-semantic').topicId,'animals');
});
test('a short generic comment does not become an identity prototype even with an invented perfect vector',()=>{
 assert.equal(decision(run([candidate('animals',v(1),'Love it!')]),'public-semantic').status,'unresolved');
});
test('aliases and specific siblings require separate evidence; lexical and semantic baselines remain visible',()=>{
 const c=candidate('animals');c.caption='Panthera onca';c.publicDigest=input(JSON.stringify({rootId:c.rootId,topicId:c.topicId,caption:c.caption,body:c.body})).publicDigest;
 const r=run([c]);assert.equal(decision(r,'public-semantic').topicId,'animals');assert.equal(decision(r,'literal-and-public-semantic').status,'unresolved');
});
test('changed public text, wrong representation, duplicate roots and private Source fields refuse',()=>{
 for(const mutate of [c=>{c.body+=' Changed.';},c=>{c.representationHash='b'.repeat(64);},c=>{c.operationDigest=hash;}]){
  const c=candidate('animals');mutate(c);assert.throws(()=>run([c]),TypeError);
 }
 assert.throws(()=>run([candidate('animals'),candidate('animals')]),TypeError);
 assert.throws(()=>input(JSON.stringify({...candidate('animals'),sourceId:'private'})),TypeError);
});
test('public input normalizes bounded text but hashes the exact published meaning including text outside the encoder prefix',()=>{
 const p={rootId:'r',topicId:'t',caption:'Jaguar',body:'One\n two  three four five six.'};const a=input(JSON.stringify(p));
 assert.equal(a.bodyInput,'One two three four five six.');assert.equal(a.meaningful,true);assert.equal(a.sourceUsed,false);
 const long={...p,body:'word '.repeat(500)};const b=input(JSON.stringify(long));const c=input(JSON.stringify({...long,body:long.body+'different'}));
 assert.equal(b.bodyInput.length,2000);assert.equal(b.bodyInput,c.bodyInput);assert.notEqual(b.publicDigest,c.publicDigest);
});
test('empty or unbounded inputs and malformed vectors refuse rather than falling back to names',()=>{
 assert.throws(()=>run([],[]),TypeError);assert.throws(()=>run(Array.from({length:65},(_,i)=>candidate('t'+i))),TypeError);
 assert.throws(()=>run([candidate('t',[1])]),TypeError);assert.throws(()=>run([candidate('t')],undefined,'!!!'),TypeError);
 assert.throws(()=>input(JSON.stringify({rootId:'r',topicId:'t',caption:'x',body:'x'.repeat(8001)})),TypeError);
});
test('a competing scope just below the floor still blocks a small-margin recommendation',()=>{
 const r=run([candidate('first',v(.89,Math.sqrt(1-.89**2))),candidate('second',v(.879,Math.sqrt(1-.879**2)))],[v(1),v(1)]);
 assert.equal(decision(r,'literal-and-public-semantic').status,'ambiguous');assert.equal(decision(r,'public-semantic').eligibleTopics,1);
});
test('public encoder inputs keep supplementary characters whole and recognize unspaced language words',()=>{
 const p={rootId:'r',topicId:'t',caption:'Koalas',body:'a'.repeat(1999)+'\u{1f43c}'};
 const a=input(JSON.stringify(p));assert.equal(a.bodyInput.length,1999);assert(a.bodyInput.isWellFormed());
 assert.equal(input(JSON.stringify({...p,body:'\u5927\u718a\u732b\u751f\u6d3b\u5728\u4e2d\u56fd\u7684\u7af9\u5b50\u68ee\u6797\u4e2d\uff0c\u6211\u4eec\u5e94\u8be5\u4fdd\u62a4\u5b83\u4eec\u7684\u81ea\u7136\u6816\u606f\u5730\u3002'})).meaningful,true);
 assert.throws(()=>input(JSON.stringify({...p,rootId:123})),TypeError);
});
