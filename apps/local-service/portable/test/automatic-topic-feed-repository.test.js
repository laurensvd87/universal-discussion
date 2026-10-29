import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticTopicFeedRepository as create} from '../canonical-v4/automatic-topic-feed-repository.js';
const generation='invented-generation',subject='12345678-1234-4123-8123-123456789abc',nodeId='subject-'+subject;
const code=c=>e=>e?.code===c;
const card=(id=subject,overrides={})=>({scope_kind:'named',scope_id:id,caption:'Kapsalon',path:['subject-'+id],human:true,occupied:true,root_ordinal:'9',...overrides});
const raw=(query='',limit=20,cursor=null)=>JSON.stringify({generation,query,limit,cursor});

test('global search has no Source requirement and sends bounded literal Unicode prefix tokens as SQL parameters',async()=>{
 let args;const r=create({database:{async query(sql,a){assert(sql.includes('named_search_topics'));args=a;return {rows:[card()]};}}});
 const result=await r.search(raw('Ｋapsalon koalas Kapsalon'));assert.deepEqual(args,[generation,['kapsalon','koalas'],null,21]);
 assert.deepEqual(result.topics,[{nodeId,label:'Kapsalon',path:[nodeId],human:true,occupied:true}]);assert.equal(result.nextCursor,null);assert(Object.isFrozen(result.topics[0].path));
});

test('search cursors bind generation normalized terms and page size without consulting the current page',async()=>{
 let calls=0,args;const second='22345678-1234-4123-8123-123456789abc';const r=create({database:{async query(sql,a){calls++;args=a;return {rows:calls===1?[card(),card(second,{root_ordinal:'8'})]:[]};}}});
 const first=await r.search(raw('Kapsalon',1));assert(first.nextCursor);await r.search(raw('ＫAPSALON',1,first.nextCursor));
 assert.deepEqual(JSON.parse(args[2]),{human:true,ordinal:'9',kind:'named',id:subject});
 for(const a of [raw('Koalas',1,first.nextCursor),raw('Kapsalon',2,first.nextCursor),JSON.stringify({generation:'other',query:'Kapsalon',limit:1,cursor:first.nextCursor})])
  await assert.rejects(r.search(a),code('conflict'));
 assert.equal(calls,2);
});

test('punctuation-only control malformed Unicode oversized and overloaded queries execute no SQL',async()=>{
 let calls=0;const r=create({database:{async query(){calls++;assert.fail('invalid query');}}});
 for(const q of ['***','a\u0000b','\ud800','a'.repeat(65),'a b c d e f g h i','x'.repeat(257),'\ufdfa'.repeat(80)])await assert.rejects(r.search(raw(q)),code('invalid'));
 for(const cursor of ['!','e30=',Buffer.from('{}').toString('base64url')])await assert.rejects(r.search(raw('',20,cursor)),code('invalid'));
 assert.equal(calls,0);
});

test('alias duplicates malformed paths private fields and impossible public metadata are storage corruption',async()=>{
 for(const rows of [[card(),card()],[card(subject,{path:['page-source-a']})],[card(subject,{path:[nodeId,nodeId]})],
  [card(subject,{caption:'\u202eprivate'})],[card(subject,{occupied:false})],[card(subject,{secret:'unrequested material'})],
  [card(subject,{root_ordinal:'9223372036854775808'})]]){
  const r=create({database:{async query(){return {rows};}}});await assert.rejects(r.search(raw()),code('storage-corrupt'));
 }
});

test('named and page feeds retain exact original destinations and bigint keyset order',async()=>{
 let args;const r=create({database:{async query(sql,a){args=a;assert(sql.includes('named_read_feed'));return {rows:[
  {root_id:'root-a',discussion_id:'original-discussion',topic_id:'original-topic',root_ordinal:'9223372036854775806'},
  {root_id:'root-b',discussion_id:'other-discussion',topic_id:'other-topic',root_ordinal:'9'}]};}}});
 const page=await r.feedReferences(JSON.stringify({generation,nodeId,beforeOrdinal:'9223372036854775807',limit:20}));
 assert.deepEqual(args,[generation,'named',subject,'9223372036854775807',20]);assert.equal(page.references[0].discussionId,'original-discussion');assert(Object.isFrozen(page.references));
 await r.feedReferences(JSON.stringify({generation,nodeId:'page-source-a',beforeOrdinal:null,limit:20}));assert.equal(args[1],'page');assert.equal(args[2],'source-a');
});

test('duplicate unordered or out-of-page feed references cannot be silently displayed',async()=>{
 const row={root_id:'root-a',discussion_id:'discussion-a',topic_id:'topic-a',root_ordinal:'9'};
 for(const rows of [[row,row],[{...row,root_ordinal:'11'}],[row,{...row,root_id:'root-b',root_ordinal:'10'}]]){
  const r=create({database:{async query(){return {rows};}}});await assert.rejects(r.feedReferences(JSON.stringify({generation,nodeId,beforeOrdinal:'10',limit:20})),code('storage-corrupt'));
 }
});

test('worker event list is bounded unique bigint text and process exposes only finite outcomes',async()=>{
 const calls=[];const r=create({database:{async query(sql,a){calls.push([sql,a]);return {rows:[{result:sql.includes('named_feed_tasks')?['1','9223372036854775807']:'busy'}]};}}});
 assert.deepEqual(await r.tasks(JSON.stringify({generation})),['1','9223372036854775807']);
 assert.equal(await r.process(JSON.stringify({generation,eventId:'1'})),'busy');assert.deepEqual(calls[1][1],[generation,'1']);
 for(const result of [['1','1'],Array.from({length:9},(_,i)=>String(i+1)),['0'],[1]]){
  const bad=create({database:{async query(){return {rows:[{result}]};}}});await assert.rejects(bad.tasks(JSON.stringify({generation})),code('storage-corrupt'));
 }
});

test('membership reads only the requested root and internal SQL details never reach clients',async()=>{
 const r=create({database:{async query(sql,a){assert(sql.includes('named_root_in_scope'));assert.deepEqual(a,[generation,nodeId,'root-a']);return {rows:[{result:true}]};}}});
 assert.equal(await r.contains(JSON.stringify({generation,nodeId,rootId:'root-a'})),true);
 for(const [sqlState,resultCode] of [['P1301','conflict'],['P1303','invalid'],['42501','storage-failure']]){
  const fail=create({database:{async query(){throw Object.assign(Error('private page title and token'),{code:sqlState});}}});
  await assert.rejects(fail.search(raw()),e=>e.code===resultCode&&!e.message.includes('private'));
 }
});

test('the new SQL execute grants and revokes reference exact declared signatures',async()=>{
 const sql=await readFile(new URL('../canonical-v4/drafts/automatic-topic-feeds.sql',import.meta.url),'utf8');
 const declarations=new Map([...sql.matchAll(/CREATE FUNCTION canonical_v4\.(named_\w+)\(([^)]*)\)\s*RETURNS/gu)]
  .map(m=>[m[1],m[2].split(',').filter(p=>p.trim()).map(p=>p.trim().split(/\s+/u).at(-1))]));
 const refs=[...sql.matchAll(/canonical_v4\.(named_\w+)\(([^()]*)\)/gu)].filter(m=>declarations.has(m[1])&&
  m[2].split(',').filter(Boolean).every(v=>['text','text[]','jsonb','integer','bigint','uuid'].includes(v)));
 for(const m of refs)assert.deepEqual(m[2].split(',').filter(Boolean),declarations.get(m[1]),m[1]);
 assert(refs.length>=declarations.size*2);assert(sql.includes('named_topic_directory_order'));assert(sql.includes('USING gin(search)'));
});
