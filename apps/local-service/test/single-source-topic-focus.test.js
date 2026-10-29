import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {singleSourceTopicFocus as focus,SINGLE_SOURCE_TOPIC_POLICY as policy,SINGLE_SOURCE_TOPIC_POLICY_HASH as policyHash} from '../src/application/single-source-topic-focus.js';
import {createSingleSourceTopicRepository as repository} from '../portable/canonical-v4/single-source-topic-repository.js';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),hash='a'.repeat(64),uuid='a0000000-0000-4000-8000-000000000001';
const request={generation:'g',matcherHash:hash,sourceId:'s'},raw=JSON.stringify(request),witness={sourceId:'s',sourceVersion:'0',operationId:'o',operationDigest:hash,sourceStamp:hash,title:'Steam Deck OLED battery replacement'};
const row=v=>({rows:[{result:v}]}),code=c=>e=>e?.code===c;
test('all contiguous current title phrases include broad and narrow existing labels',()=>{
 const r=focus(witness.title);assert.equal(r.status,'ready');for(const words of [['steam'],['steam','deck'],['steam','deck','oled'],['deck','oled']])assert(r.focusKeys.includes(sha(words)));
 assert(Object.isFrozen(r.focusKeys));assert.equal(policy.minimumSimilarity,.88);assert.equal(policy.minimumMargin,.03);assert.equal(sha(policy),policyHash);
});
test('Unicode normalization, CJK and repeated phrases use the same word focus keys as public input',()=>{
 assert(focus('\ufb01sh aquarium').focusKeys.includes(sha(['fish'])));
 assert(focus('Koalas KOALAS').focusKeys.filter(k=>k===sha(['koalas'])).length===1);
 assert(focus('\u8003\u62c9\u7684\u751f\u6d3b').focusKeys.length>0);
});
test('a bound refuses the whole title workload rather than truncating a competing phrase',()=>{
 const r=focus('a '.repeat(65).trim());assert.equal(r.status,'capacity');assert.deepEqual(r.focusKeys,[]);
 const complete=focus(Array.from({length:30},(_,i)=>'w'+i).join(' '));assert.equal(complete.status,'ready');assert(complete.focusKeys.includes(sha(['w29'])));assert(complete.focusKeys.length>128);
 assert.equal(focus('\ufdfa'.repeat(40)).status,'capacity');assert.equal(focus('123 456').focusKeys.length,0);
 for(const title of ['', 'bad\u0000title','\ud800','a'.repeat(201)])assert.throws(()=>focus(title),TypeError);
});
test('the repository binds the current protected title witness and policy to a parameterized SQL match',async()=>{
 const calls=[];const r=repository({database:{query:async(sql,args)=>{calls.push({sql,args});return row(calls.length===1?witness:{status:'matched',subjectId:uuid,candidates:3});}}});
 assert.deepEqual(await r.match(raw),{status:'matched',subjectId:uuid,candidates:3});assert.equal(calls.length,2);
 assert.equal(calls[1].args[4],policyHash);assert.deepEqual(JSON.parse(calls[1].args[2]),witness);assert(calls[1].sql.includes('named_match_single_source'));
 assert(!calls[1].sql.includes('named_publish'));assert.equal(calls[1].args.length,5);
});
test('absent, numeric-only or over-budget material performs no assignment write',async()=>{
 for(const [value,status]of [[null,'retired'],[{...witness,title:'123 456'},'unresolved'],[{...witness,title:'a '.repeat(65).trim()},'capacity']]){
  let calls=0;const r=repository({database:{query:async()=>{calls++;return row(value);}}});assert.equal((await r.match(raw)).status,status);assert.equal(calls,1);
 }
});
test('malformed material, result fields and response getters never become assignments',async()=>{
 for(const value of [{...witness,sourceId:'other'}, {...witness,sourceVersion:'-1'}, {...witness,extra:true}])await assert.rejects(repository({database:{query:async()=>row(value)}}).match(raw),code('storage-corrupt'));
 for(const value of [{status:'matched',subjectId:null,candidates:1},{status:'busy',subjectId:uuid,candidates:1},{status:'retained',subjectId:uuid,candidates:66}]){
  let calls=0;await assert.rejects(repository({database:{query:async()=>row(++calls===1?witness:value)}}).match(raw),code('storage-corrupt'));
 }
 let hooks=0;const badRow={};Object.defineProperty(badRow,'result',{enumerable:true,get(){hooks++;return witness;}});
 await assert.rejects(repository({database:{query:async()=>({rows:[badRow]})}}).match(raw),code('storage-corrupt'));assert.equal(hooks,0);
});
test('SQL conflicts remain explicit and raw database text remains private',async()=>{
 for(const [pg,expected]of [['P1321','conflict'],['P1323','invalid'],['42501','storage-failure']])await assert.rejects(repository({database:{query:async()=>{throw Object.assign(Error('private SQL detail'),{code:pg});}}}).match(raw),e=>e.code===expected&&!e.message.includes('private SQL'));
});
