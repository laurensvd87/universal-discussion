import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomaticTopicFeedRepository as repository,isLegacyTopicRoute} from '../canonical-v4/automatic-topic-feed-repository.js';
import {createUnifiedTopicSearchMaintenance as maintenance} from '../canonical-v4/unified-topic-search-maintenance.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {unifiedSearchPlanUses} from './unified-topic-search-native-assertions.js';
const generation='invented-generation',subject='12345678-1234-4123-8123-123456789abc';
const code=c=>e=>e?.code===c;
const raw=(query='',limit=20,cursor=null)=>JSON.stringify({generation,query,limit,cursor});
const fixed={scope_kind:'fixed',scope_id:'koalas',caption:'Koalas',path:['nature','animals','koalas'],human:false,root_ordinal:'0',occupied:false};
const legacy={scope_kind:'legacy',scope_id:'original-topic',caption:'Saved conversation',path:['legacy-original-topic'],human:true,root_ordinal:'17',occupied:true};
const named={scope_kind:'named',scope_id:subject,caption:'Steam Deck',path:['subject-'+subject],human:true,root_ordinal:'12',occupied:true};

test('combined search supplies complete public ancestor labels in the same bounded query',async()=>{
 const parent='22345678-1234-4123-8123-123456789abc',row={...named,path:['subject-'+parent,'subject-'+subject],breadcrumbs:{
  fixed:[{nodeId:'games',label:'Games'}],topic:[{nodeId:'subject-'+parent,label:'Handheld consoles'},{nodeId:'subject-'+subject,label:'Steam Deck'}]}};
 let calls=0;const r=repository({unifiedSearch:true,breadcrumbs:true,database:{async query(sql,args){calls++;assert(sql.includes('combined_search_topics'));assert.equal(args.at(-1),21);return {rows:[row]};}}});
 const result=await r.search(raw('Steam'));assert.deepEqual(result.topics[0].breadcrumbs,row.breadcrumbs);assert.equal(calls,1);assert(Object.isFrozen(result.topics[0].breadcrumbs.topic));
 const fallback={...row,breadcrumbs:{fixed:[],topic:[row.breadcrumbs.topic.at(-1)]}};
 assert.deepEqual((await repository({unifiedSearch:true,breadcrumbs:true,database:{async query(){return {rows:[fallback]};}}}).search(raw())).topics[0].breadcrumbs,fallback.breadcrumbs);
});

test('breadcrumb bounds are independent and malformed private or mismatched metadata is refused',async()=>{
 const row={...fixed,breadcrumbs:{fixed:fixed.path.map((nodeId,i)=>({nodeId,label:['Nature','Animals','Koalas'][i]})),topic:[]}};
 for(const change of [r=>r.breadcrumbs.fixed.push({nodeId:'other',label:'Other'}),r=>r.breadcrumbs.fixed[0].label='bad\u202e',
  r=>r.breadcrumbs.fixed[0].sourceId='private',r=>r.breadcrumbs.fixed[0].nodeId='subject-'+subject,
  r=>r.breadcrumbs.fixed[2].label='Different',r=>r.breadcrumbs.fixed=Array(9).fill(r.breadcrumbs.fixed[0]),r=>r.breadcrumbs.topic=[{nodeId:'koalas',label:'Koalas'}],r=>r.breadcrumbs.vector=[1]]){
  const changed=structuredClone(row);change(changed);await assert.rejects(repository({unifiedSearch:true,breadcrumbs:true,database:{async query(){return {rows:[changed]};}}}).search(raw()),code('storage-corrupt'));
 }
 const database={query(){assert.fail('Invalid composition must not execute');}};assert.throws(()=>repository({database,breadcrumbs:true}),TypeError);assert.throws(()=>repository({database,unifiedSearch:true,breadcrumbs:1}),TypeError);
});

test('eight fixed and eight named display steps do not enlarge the original eight-step navigation path',async()=>{
 const ids=Array.from({length:8},(_,i)=>'12345678-1234-4123-8123-'+String(i).padStart(12,'0')),path=ids.map(id=>'subject-'+id);
 const row={...named,scope_id:ids.at(-1),path,breadcrumbs:{fixed:Array.from({length:8},(_,i)=>({nodeId:'fixed-'+i,label:'Fixed '+i})),topic:path.map((nodeId,i)=>({nodeId,label:i===7?'Steam Deck':'Named '+i}))}};
 const r=repository({unifiedSearch:true,breadcrumbs:true,database:{async query(){return {rows:[row]};}}});assert.equal((await r.search(raw())).topics[0].breadcrumbs.topic.length,8);
 const invalid={...row,path:[...path,'subject-'+subject]};await assert.rejects(repository({unifiedSearch:true,breadcrumbs:true,database:{async query(){return {rows:[invalid]};}}}).search(raw()),code('storage-corrupt'));
});
test('one explicit search returns fixed learned and original saved scopes without a current page',async()=>{
 const calls=[],r=repository({unifiedSearch:true,database:{async query(sql,args){calls.push({sql,args});return {rows:[legacy,named,fixed]};}}});
 const result=await r.search(raw());assert.deepEqual(result.topics.map(t=>t.nodeId),['legacy-original-topic','subject-'+subject,'koalas']);assert.deepEqual(result.topics.at(-1).path,['nature','animals','koalas']);
 assert(calls[0].sql.includes('unified_search_topics'));assert.deepEqual(calls[0].args,[generation,[],null,21]);assert(Object.isFrozen(result.topics));
});
test('unified cursor retains the fixed position and binds query generation and limit',async()=>{
 let calls=0,args;const r=repository({unifiedSearch:true,database:{async query(sql,a){args=a;return {rows:++calls===1?[fixed,named]:[]};}}});
 const page=await r.search(raw('',1));assert(page.nextCursor);await r.search(raw('',1,page.nextCursor));assert.deepEqual(JSON.parse(args[2]),{human:false,ordinal:'0',kind:'fixed',id:'koalas'});
 for(const request of [raw('different',1,page.nextCursor),raw('',2,page.nextCursor)])await assert.rejects(r.search(request),code('conflict'));
 const old=repository({database:{async query(){assert.fail('Wrong cursor must not execute SQL');}}});await assert.rejects(old.search(raw('',1,page.nextCursor)),code('invalid'));
});
test('legacy feeds preserve original destinations and refuse the route without explicit composition',async()=>{
 const row={root_id:'root-a',discussion_id:'original-discussion',topic_id:'original-topic',root_ordinal:'17'};
 const r=repository({unifiedSearch:true,database:{async query(sql,args){assert(sql.includes('unified_read_legacy_feed'));assert.deepEqual(args,[generation,'original-topic',null,20]);return {rows:[row]};}}});
 const value=JSON.stringify({generation,nodeId:'legacy-original-topic',beforeOrdinal:null,limit:20});assert.equal((await r.feedReferences(value)).references[0].discussionId,'original-discussion');
 await assert.rejects(repository({database:{query(){assert.fail('Legacy routes require explicit opt in');}}}).feedReferences(value),code('invalid'));
 assert(isLegacyTopicRoute('legacy-original-topic'));for(const id of ['legacy-','legacy-../outside','games',null])assert(!isLegacyTopicRoute(id));
});
test('mixed private or malformed paths fail as storage corruption',async()=>{
 for(const row of [{...legacy,path:['legacy-other']},{...legacy,path:['legacy-original-topic','legacy-original-topic']},
  {...fixed,path:['subject-'+subject,'koalas']},{...fixed,scope_id:'legacy-forged'}, {...fixed,caption:'private\u202e'}, {...fixed,sourceVector:[1]}]){
  const r=repository({unifiedSearch:true,database:{async query(){return {rows:[row]};}}});await assert.rejects(r.search(raw()),code('storage-corrupt'));
 }
});
test('search maintenance exposes bounded unique jobs and finite outcomes without private storage errors',async()=>{
 let calls=0;const r=maintenance({database:{async query(sql,args){calls++;return {rows:[{result:sql.includes('_tasks')?['1','2']:'busy'}]};}}});
 assert.deepEqual(await r.tasks(JSON.stringify({generation})),['1','2']);assert.equal(await r.process(JSON.stringify({generation,eventId:'1'})),'busy');
 for(const value of [{generation,eventId:'0'},{generation,eventId:'9223372036854775808'},{generation,eventId:'1',sourceId:'private'}])await assert.rejects(r.process(JSON.stringify(value)),TypeError);assert.equal(calls,2);
 const fail=maintenance({database:{async query(){throw Object.assign(Error('private title and token'),{code:'42501'});}}});await assert.rejects(fail.tasks(JSON.stringify({generation})),e=>e.code==='storage-failure'&&!e.message.includes('private'));
});
test('malformed over-capacity and duplicate worker task lists cannot dispatch',async()=>{
 for(const result of [['1','1'],['0'],Array.from({length:9},(_,i)=>String(i+1)),[1],null]){
  const r=maintenance({database:{async query(){return {rows:[{result}]};}}});await assert.rejects(r.tasks(JSON.stringify({generation})),code('storage-corrupt'));
 }
});
test('unified read composition requires automatic topics and remains inert',()=>{
 const database={query(){assert.fail('Construction is inert');},transaction(){assert.fail('Construction is inert');}};
 assert.throws(()=>createCanonicalV4ReadFacade({database,unifiedTopicSearch:true}),TypeError);
 assert.equal(createCanonicalV4ReadFacade({database,automaticTopics:true,unifiedTopicSearch:true}).automaticTopicsEnabled,true);
 assert.throws(()=>repository({database,unifiedSearch:'yes'}),TypeError);
});
test('the real public feed rejects the former fixture limit100 before SQL because its existing maximum is50',async()=>{
 const database={query(){assert.fail('Invalid page size must not execute SQL');},transaction(){assert.fail('Invalid page size must not open a transaction');}};
 const reads=createCanonicalV4ReadFacade({database,automaticTopics:true,unifiedTopicSearch:true});
 await assert.rejects(reads.semanticFeed({nodeId:'legacy-original-topic',limit:100,cursor:null}),code('invalid'));
});
test('a normal tiny-fixture B-tree plan is indexed while separate GIN eligibility remains mandatory',()=>{
 const plan=[{'QUERY PLAN':[{Plan:{'Node Type':'Index Scan','Index Name':'unified_search_directory_order'}}]}];
 assert(!unifiedSearchPlanUses(plan,['unified_search_directory_terms']),'the former GIN-only check rejects a valid small-fixture plan');
 assert(unifiedSearchPlanUses(plan,['unified_search_directory_terms','unified_search_directory_order','unified_search_directory_pkey']));
 const isolated=[{'QUERY PLAN':[{Plan:{'Node Type':'Bitmap Heap Scan',Plans:[{'Index Name':'unified_search_directory_terms'}]}}]}];
 assert(unifiedSearchPlanUses(isolated,['unified_search_directory_terms']));assert(!unifiedSearchPlanUses([{'QUERY PLAN':[{Plan:{'Node Type':'Seq Scan'}}]}],['unified_search_directory_terms']));
});
