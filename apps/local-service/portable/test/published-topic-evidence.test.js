import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {publishedTopicInput as input,PUBLISHED_TOPIC_INPUT_HASH as contract} from '../../src/application/published-topic-evidence.js';
import {createPublishedTopicEvidenceRepository as repository} from '../canonical-v4/published-topic-evidence-repository.js';
import {createPublishedTopicMaintenance as maintenance} from '../../src/application/published-topic-maintenance.js';
import {publicTopicEncoderInput as experimentInput} from '../../experiments/public-topic-recovery-v1/recovery.js';
const hash='a'.repeat(64),scope={generation:'generation-native',matcherHash:hash},raw=JSON.stringify(scope),uuid='9d468dfc-c44c-4d61-9853-b186556d87fe';
const body='A red panda lives in bamboo forests in the mountains of Nepal.',base={rootId:'public-root',topicId:uuid,caption:'Red panda',body};
const publicInput=input(JSON.stringify(base)),witness={...base,rootVersion:'0',publicDigest:publicInput.publicDigest},unit=[1,...Array(383).fill(0)],model='e5-small-q8-browser-main-prefix-v1';
const task={eventId:'1',kind:'root',scopeId:uuid,witness,skipEncoding:false},result=r=>({rows:[{result:r}]}),code=c=>e=>e?.code===c;
const prepared={bodyValues:unit,titleValues:unit,exclusion:null},storeRaw=(t=task,p=prepared)=>JSON.stringify({...scope,eventId:t.eventId,witness:t.witness,prepared:p});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const sql=(await readFile(new URL('../canonical-v4/drafts/published-topic-evidence.sql',import.meta.url),'utf8')).replaceAll('\r\n','\n');

test('production public inputs preserve the measured caption/body transform and exact public digest',()=>{
 for(const p of [base,{...base,body:' One\n two three four five six. '},{...base,body:'a'.repeat(1999)+'\u{1f43c}'},{...base,caption:'\ufb01sh'},{...base,body:'\u5927\u718a\u732b\u751f\u6d3b\u5728\u4e2d\u56fd\u7684\u7af9\u5b50\u68ee\u6797\u4e2d\uff0c\u6211\u4eec\u5e94\u8be5\u4fdd\u62a4\u5b83\u4eec\u7684\u81ea\u7136\u6816\u606f\u5730\u3002'}]){
  const a=input(JSON.stringify(p)),b=experimentInput(JSON.stringify(p));for(const k of ['publicDigest','titleInput','bodyInput','meaningful'])assert.deepEqual(a[k],b[k]);
 }
 assert.equal(publicInput.focusKey,createHash('sha256').update(JSON.stringify(['red','panda'])).digest('hex'));
 assert.throws(()=>input(JSON.stringify({...base,sourceId:'private'})),TypeError);
});
test('task decoding joins exact current public text and rejects malformed digest or foreign scope',async()=>{
 let value=[task];const r=repository({database:{query:async()=>result(value)}});const tasks=await r.tasks(raw);assert.deepEqual(tasks,[task]);assert(Object.isFrozen(tasks[0].witness));
 for(const changed of [{...task,witness:{...witness,body:body+' changed'}},{...task,scopeId:'cb7ab741-4b45-43d1-9a25-3772e3f3deda'},{...task,skipEncoding:1}]){
  value=[changed];await assert.rejects(r.tasks(raw),code('storage-corrupt'));
 }
});
test('row and scalar getters never execute while decoding storage responses',async()=>{
 let hooks=0;const row={};Object.defineProperty(row,'result',{enumerable:true,get(){hooks++;return [task];}});
 for(const payload of [{rows:[row]},Object.defineProperty({},'rows',{enumerable:true,get(){hooks++;return [];}})]){
  await assert.rejects(repository({database:{query:async()=>payload}}).tasks(raw),code('storage-corrupt'));
 }assert.equal(hooks,0);
});
test('store binds only public current text, shared numeric inputs and the exact input contract',async()=>{
 let observed;const r=repository({database:{query:async(sql,args)=>{observed={sql,args};return result('stored');}}});
 assert.equal(await r.store(storeRaw()),'stored');assert.equal(observed.args.length,9);assert.equal(observed.args[8],contract);
 assert.equal(observed.args[4],publicInput.focusKey);assert.equal(JSON.parse(observed.args[3]).body,body);assert(!observed.sql.includes('named_publish'));
 await assert.rejects(r.store(storeRaw({...task,witness:{...witness,publicDigest:'b'.repeat(64)}})),TypeError);
 await assert.rejects(r.store(storeRaw(task,{...prepared,bodyValues:[1]})),TypeError);
});
test('public candidate decoding requires current text, correct representation contract and unique occupied identities',async()=>{
 const candidate={...witness,representationHash:hash,focusKey:publicInput.focusKey,inputHash:contract,vector:unit,identityRevision:'2',headPresent:true};
 let value=[candidate];const r=repository({database:{query:async()=>result(value)}}),query=JSON.stringify({generation:scope.generation,representationHash:hash,focusKeys:[publicInput.focusKey]});
 assert.deepEqual(await r.candidates(query),[candidate]);
 for(const v of [{...candidate,inputHash:'b'.repeat(64)},{...candidate,identityRevision:'0'},{...candidate,body:body+' changed'},{...candidate,focusKey:hash}]){
  value=[v];await assert.rejects(r.candidates(query),code('storage-corrupt'));
 }value=[candidate,candidate];await assert.rejects(r.candidates(query),code('storage-corrupt'));
});
test('SQL conflict/invalid failures are not reported as successful indexing',async()=>{
 for(const [pg,expected]of [['P1311','conflict'],['P1313','invalid'],['42501','storage-failure']]){
  const r=repository({database:{query:async()=>{throw Object.assign(Error('private detail'),{code:pg});}}});await assert.rejects(r.store(storeRaw()),code(expected));
 }
});
test('public maintenance encodes current public body and caption sequentially on the supplied shared queue',async()=>{
 const seen=[],saved=[];const m=maintenance({repository:{tasks:async()=>[task],repair:async()=>assert.fail(),defer:async()=>assert.fail(),store:async v=>{saved.push(JSON.parse(v));return 'stored';}},
  resources:{embedCapturedBody:async text=>{seen.push(text);return {modelId:model,values:unit};}}});
 assert.deepEqual(await m.turn(raw),['stored']);assert.deepEqual(seen,[publicInput.bodyInput,publicInput.titleInput]);assert.equal(saved[0].witness.body,body);
 await m.close();assert.throws(()=>m.turn(raw),code('unavailable'));
});
test('stable representatives and insufficient short comments need no additional model call',async()=>{
 const short={...base,body:'Love it!'},w={...short,rootVersion:'1',publicDigest:input(JSON.stringify(short)).publicDigest},seen=[];
 const m=maintenance({repository:{tasks:async()=>[{...task,skipEncoding:true},{...task,eventId:'2',witness:w}],repair:async()=>assert.fail(),defer:async()=>assert.fail(),store:async v=>{seen.push(JSON.parse(v));return 'retained';}},resources:{embedCapturedBody:async()=>assert.fail()}});
 assert.deepEqual(await m.turn(raw),['retained','retained']);assert.equal(seen[0].prepared,null);assert.equal(seen[1].prepared.exclusion,'insufficient-public-text');await m.close();
});
test('one failed public root is deferred while the next bounded task can still complete',async()=>{
 let calls=0;const deferredEvents=[],stores=[];
 const m=maintenance({repository:{tasks:async()=>[task,{...task,eventId:'2',skipEncoding:true}],repair:async()=>assert.fail(),defer:async v=>{deferredEvents.push(JSON.parse(v));return true;},store:async v=>{stores.push(JSON.parse(v));return 'retained';}},
  resources:{embedCapturedBody:async()=>{calls++;throw Error('temporary model refusal');}}});
 assert.deepEqual(await m.turn(raw),['deferred','retained']);assert.equal(calls,1);assert.equal(stores.length,1);assert.equal(deferredEvents[0].eventId,'1');await m.close();
});
test('closing joins the original queued encode, suppresses later title/SQL work and never closes shared resources',async()=>{
 const ready=deferred(),release=deferred();let calls=0,closed=false;const m=maintenance({repository:{tasks:async()=>[task],repair:async()=>assert.fail(),defer:async()=>assert.fail(),store:async()=>assert.fail()},
  resources:{embedCapturedBody:async()=>{calls++;ready.resolve();return release.promise;},close:()=>{closed=true;}}});
 const turn=m.turn(raw);await ready.promise;assert.throws(()=>m.turn(raw),code('unavailable'));let joined=false;const close=m.close().then(()=>{joined=true;});
 await Promise.resolve();assert.equal(joined,false);release.resolve({modelId:model,values:unit});await assert.rejects(turn,code('unavailable'));await close;assert.equal(calls,1);assert.equal(closed,false);
});
test('a malformed or foreign encoder result defers instead of publishing unrelated coordinates',async()=>{
 let hooks=0;const v=[...unit];Object.defineProperty(v,'0',{enumerable:true,get(){hooks++;return 1;}});
 for(const bad of [{modelId:'other-model',values:unit},{modelId:model,values:v}]){
  const m=maintenance({repository:{tasks:async()=>[task],repair:async()=>assert.fail(),store:async()=>assert.fail(),defer:async()=>true},resources:{embedCapturedBody:async()=>bad}});
  assert.deepEqual(await m.turn(raw),['deferred']);await m.close();
 }assert.equal(hooks,0);
});
test('SQL reads current revision bodies and hashes only explicitly public meaning',()=>{
 const view=sql.slice(0,sql.indexOf('CREATE TABLE'));assert(view.includes('rev.ordinal=c.revision_count-1'));assert(view.includes('ELSE rev.payload::jsonb'));
 assert(!/canonical_v4\.(sources|embeddings|operation_receipts|semantic_inputs)|origin_source_id|material_digest/gu.test(sql));
 assert(sql.includes("CHECK(kind IN ('root','scope'))"));assert(sql.includes('retry_after<=clock_timestamp()'));assert(sql.includes("interval '5 seconds'"));
 const trigger=sql.slice(sql.indexOf('CREATE FUNCTION canonical_v4.named_schedule_public_evidence'),sql.indexOf('CREATE TRIGGER named_public_new_context'));
 assert(!/UPDATE canonical_v4|FOR UPDATE|FOR SHARE/gu.test(trigger));
});
test('public lookup bounds raw indexed representatives before joining current public roots',()=>{
 const start=sql.indexOf('WITH raw_ AS MATERIALIZED'),end=sql.indexOf('END $candidates$');const query=sql.slice(start,end);
 assert(query.indexOf('LIMIT 65')<query.indexOf('JOIN canonical_v4.named_public_roots'));assert(query.includes('raw_count_>64'));
 assert(query.includes('ORDER BY p.focus_key,p.scope_id'));assert(query.includes('i.id=p.scope_id::uuid'));assert(!query.includes('i.id::text'));
 assert(sql.includes('PRIMARY KEY(generation,representation_hash,scope_id)'));assert(sql.includes('ORDER BY root_id LIMIT 16'));assert(sql.includes('after_root=last_,event_id=DEFAULT'));
});
test('public input contract and execute-only grant signatures match every actual declaration',()=>{
 assert.equal(sql.split(contract).length-1,5);assert(!sql.includes('GRANT SELECT'));assert(!sql.includes('TO murmingle_app'));
 const declarations=new Map([...sql.matchAll(/CREATE FUNCTION canonical_v4\.(named_\w+)\(([^)]*)\)\s*RETURNS/gu)].map(m=>[m[1],m[2].split(',').filter(Boolean).map(v=>v.trim().split(/\s+/u).slice(1).join(' '))]));
 for(const m of sql.matchAll(/canonical_v4\.(named_\w+)\(([^()]*)\)/gu)){
  const args=m[2].split(',').map(v=>v.trim());if(declarations.has(m[1])&&args.every(v=>['','text','bigint','jsonb','double precision[]'].includes(v)))assert.deepEqual(args[0]===''?[]:args,declarations.get(m[1]),m[1]);
 }
});
