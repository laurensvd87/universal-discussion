// Real owned PostgreSQL/HTTP/issuer checks. Invented numeric material; only the
// external provider is stubbed. No live connection or model/capture request.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {combinedHierarchyFixtureRows} from './combined-author-hierarchy-fixture.js';
import {createAutomaticAuthorContextRepository as authors} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4SemanticDiscussionRepository as policies} from '../canonical-v4/semantic-discussion-repository.js';
import {createCanonicalV4SemanticSourceRepository} from '../canonical-v4/semantic-source-repository.js';
import {createStoredSourceHierarchyPreparation} from '../canonical-v4/semantic-source-preparation.js';
import {createAutomaticNamedSubjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createAutomaticTopicFeedRepository} from '../canonical-v4/automatic-topic-feed-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../../src/http/request-handler.js';
import {createChatGPTRuntime} from '../../src/ai/chatgpt-runtime.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {createHash} from 'node:crypto';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {createLocalAiClient} from '../../../../spikes/topic-resolution/browser/core/local-ai-client.js';
import {createPostgresDashboardSource} from '../../../topic-dashboard/src/data/postgres-catalog.js';
import {semanticLegacyRootPageSql} from '../canonical-v4/semantic-owner-maintenance.js';
import {describeAutomaticTopicBackupTables,automaticTopicBackupRowQuery} from '../../src/ops/automatic-topics-backup-operator.js';
import {authoredFixtureInsightContext} from './automatic-author-insight-native-assertions.js';
const actor={id:'demo-alex',type:'human',demo:true},code=c=>e=>e?.code===c,MODEL='e5-small-q8-browser-main-prefix-v1',TOPIC='topic-semantic-manual';
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
function sourceFunction(sql,name){const m=sql.match(new RegExp('CREATE(?: OR REPLACE)? FUNCTION canonical_v4\\.'+name+'\\([\\s\\S]*?\\$(\\w+)\\$[\\s\\S]*?\\$\\1\\$;','u'));assert(m);return m[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');}
export function combinedGenerationCollisionProbe(sql,broken=false){
 if(typeof sql!=='string'||typeof broken!=='boolean')throw new TypeError('Invalid combined generation probe');
 const body=sourceFunction(sql,'combined_read_fixed_feed'),query=body.match(/IF NOT EXISTS\((SELECT 1 FROM canonical_v4\.runtime_state r WHERE r\.singleton AND r\.generation=p_generation)\)/u)?.[1];
 if(!query)throw new TypeError('Invalid combined generation predicate');
 const selected=broken?query.replace('runtime_state r WHERE r.singleton AND r.generation','runtime_state WHERE singleton AND generation'):query;
 return `DO $probe$ DECLARE generation text;p_generation text;BEGIN IF NOT EXISTS(${selected}) THEN NULL;END IF;END $probe$;`;
}
export async function runCombinedAuthorHierarchyNativeAssertions(scope){
 const {owner,worker,app,generation,matcher,check}=scope,fixtures=combinedHierarchyFixtureRows(),ids=fixtures.map(v=>v.id),source=ids[0],roots=[],replies=[];
 const identity=describeRootedHierarchyMatcher(matcher),matcherHash=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
 const policy=policies({database:owner}),prior=await policy.ownerPolicy();let serial=0,broad,leaf,parent,semanticRoot,namedRoot,client,handler,service,config;
 const editor=authors({database:app,ownerGrouping:true,combinedHierarchy:true,nextId:()=> 'combined-native-root-'+(++serial)});
 const schemaProfile=scope.schemaProfile??'legacy9';
 const dashboard=schemaProfile==='hierarchy18'?createPostgresDashboardSource({database:app,schemaProfile}):null;
 const reads=createCanonicalV4ReadFacade({database:app,automaticTopics:true,unifiedTopicSearch:true,combinedHierarchy:true}),runtime=createCanonicalV4RuntimeRepository({database:app,schemaProfile}),life=createCanonicalV4LifecycleRepository({database:app,schemaProfile});
 const expected=()=>one(app,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const context=()=>editor.editor(JSON.stringify({generation,sourceId:source}));
 async function set(defaultMaxDepth,overrides=[]){const p=await policy.ownerPolicy();return policy.setOwnerPolicy({expectedRevision:p.revision,defaultMaxDepth,overrides});}
 async function post(e){const result=await editor.appendRoot(JSON.stringify({actorId:actor.id,requestId:'combined-native-request-'+(++serial),expected:await expected(),
  command:{type:'create-root',topicId:e.topicId,originSourceId:e.scope.sourceId,body:'A question in the explicitly selected topic '+e.scope.caption},scope:e.scope}));roots.push(result.result.contributionId);return result.result.contributionId;}
 async function drain(){const r=createAutomaticTopicFeedRepository({database:worker});for(let n=0;n<256;n++){const tasks=await r.tasks(JSON.stringify({generation}));if(!tasks.length)return;for(const eventId of tasks)assert.notEqual(await r.process(JSON.stringify({generation,eventId})),'busy');}assert.fail('Combined feed did not drain');}
 const has=async(nodeId,id)=>(await reads.semanticFeed({nodeId,limit:50,cursor:null})).roots.some(v=>v.root.id===id);
 await check(0,async()=>{
  const before=await expected(),manifest=(await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows;
  const sql=await readFile(new URL('../canonical-v4/drafts/combined-author-hierarchy.sql',import.meta.url),'utf8');
  if(scope.alreadyInstalled!==true)await owner.exec(sql);else assert.equal((await one(owner,'SELECT max(version)::integer n FROM canonical_v4.schema_migrations')).n,18);
  if(scope.alreadyInstalled!==true)await owner.exec(await readFile(new URL('../canonical-v4/drafts/combined-topic-breadcrumbs.sql',import.meta.url),'utf8'));
  await assert.rejects(owner.query(combinedGenerationCollisionProbe(sql,true)),code('42702'));await owner.exec(combinedGenerationCollisionProbe(sql));
  assert.deepEqual(await expected(),before);assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows,manifest);
 });
 await check(1,async()=>{
  await owner.transaction(async tx=>{for(const row of fixtures){const material={url:'https://general.example.org/combined/'+row.id,title:row.title,embedding:{modelId:MODEL,values:row.values},extractorVersion:'crawler-static-html-prefix/v1'},
   operationId='operation-'+row.id,operationDigest=operationDigestFor(material),policyVersion='ridge1-fixed-reference-radius/v1';
   await tx.query("INSERT INTO canonical_v4.id_registry VALUES($1,'sources')",[row.id]);
   await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
    VALUES($1,nextval('canonical_v4.source_ordinal_sequence'),$2,$3,$4,'owner-local-page-embedding/v1',$5,$6,$7,true)`,
    [row.id,JSON.stringify({id:row.id,...material,provenance:'owner-local-page-embedding/v1',operationId,operationDigest,policyVersion,topicIds:[TOPIC]}),material.url,row.title,material.extractorVersion,policyVersion,operationId]);
   await tx.query('INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES($1,$2,$3,384,$4::double precision[])',[row.id,JSON.stringify(material.embedding),MODEL,'{'+row.values.join(',')+'}']);
   await tx.query('INSERT INTO canonical_v4.operation_receipts VALUES($1,$2,$3)',[row.id,operationId,operationDigest]);await tx.query('INSERT INTO canonical_v4.runtime_source_stamps VALUES($1,$2,true)',[row.id,sourceStamp(material)]);
   await tx.query('INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) VALUES($1,$2,0)',[row.id,TOPIC]);
   await tx.query("INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES($1,$2,nextval('canonical_v4.source_link_ordinal_sequence'),$3,'manual-confirmed')",[row.id,TOPIC,JSON.stringify({sourceId:row.id,topicId:TOPIC,method:'manual-confirmed'})]);
  }});
  const stored=createCanonicalV4SemanticSourceRepository({database:worker}),vectors=new Map(fixtures.map(r=>[r.title,r.values]));
  const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async title=>({modelId:MODEL,values:vectors.get(title)})});
  try{const packet=await stored.candidates({generation,matcherIdentityHash:matcherHash,afterOrdinal:null,limit:50});
   const candidates=packet.candidates.filter(c=>ids.includes(c.sourceId));assert.equal(candidates.length,4);
   for(const c of candidates){const prepared=await prep.prepare(c);assert(prepared);await stored.reclassify({generation,matcherIdentityHash:matcherHash,items:[prepared]});}
  }finally{await prep.close();}
  for(const id of ids)assert.equal((await one(owner,'SELECT supported_path FROM canonical_v4.semantic_inputs WHERE source_id=$1 AND matcher_hash=$2',[id,matcherHash])).supported_path[0],'games');
  await createAutomaticNamedSubjectRepository({database:worker}).publish(JSON.stringify(await scope.publicationInput(ids)));
  leaf=(await authors({database:app}).editor(JSON.stringify({generation,sourceId:source}))).scope.id;
  parent=(await one(owner,'SELECT parent_id::text parent FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[leaf])).parent;assert(parent);
  assert.deepEqual((await one(owner,'SELECT canonical_v4.combined_named_prefix($1,$2) path',[generation,leaf])).path,['games']);
  if(dashboard){
   const summary=await dashboard.readHierarchySummary();assert.equal(summary.semantic.automatic.matchedSources,4);assert.equal(summary.semantic.assignments.automaticDiscovery,'enabled');
   const counts=summary.semantic.automatic,leafRow=counts.topics.find(t=>t.id==='subject-'+leaf),parentRow=counts.topics.find(t=>t.id==='subject-'+parent);
   assert(leafRow.directSources>0);assert(parentRow.sources>=leafRow.sources);assert.equal(counts.topics.reduce((n,t)=>n+t.directSources,0),4);
   const revision=await dashboard.readRevision(),before=await expected(),selected=await one(owner,'DELETE FROM canonical_v4.named_subject_selections WHERE source_id=$1 RETURNING subject_id::text subject_id',[source]);
   assert.notEqual(await dashboard.readRevision(),revision,'derived assignment changes refresh without a canonical rewrite');assert.deepEqual(await expected(),before);
   assert.equal((await dashboard.readHierarchySummary()).semantic.automatic.matchedSources,3);
   await owner.query('INSERT INTO canonical_v4.named_subject_selections VALUES($1,$2)',[source,selected.subject_id]);
   assert.equal((await dashboard.readHierarchySummary()).semantic.automatic.matchedSources,4);
   // A rolled-back table-layout control, not a classifier-quality case: prove
   // the real app SQL response is capped while its aggregate totals stay exact.
   const marker=Error('Rollback dashboard bound control');let rolled=false;
   try{await owner.transaction(async tx=>{
    const ids=Array.from({length:1000},(_,i)=>'f0000000-0000-4000-8000-'+String(i).padStart(12,'0'));
    await tx.query('INSERT INTO canonical_v4.named_subject_ids SELECT id,1 FROM unnest($1::uuid[]) id',[ids]);
    await tx.query(`INSERT INTO canonical_v4.named_subject_heads(subject_id,revision,generation,policy_hash,matcher_hash,representation_hash,focus_key,context_root_id,label,label_source_id,parent_id,ancestor_path,prototype_values)
     SELECT id_,1,h.generation,h.policy_hash,h.matcher_hash,h.representation_hash,h.focus_key,h.context_root_id,'Dashboard bound '||n_,h.label_source_id,NULL,h.ancestor_path,h.prototype_values
      FROM canonical_v4.named_subject_heads h CROSS JOIN unnest($1::uuid[]) WITH ORDINALITY ids_(id_,n_) WHERE h.subject_id=$2`,[ids,leaf]);
    await tx.exec('SET LOCAL ROLE murmingle_app');const row=await one(tx,'SELECT canonical_v4.named_read_dashboard_counts($1) AS metadata',[generation]);
    assert.equal(row.metadata.activeSubjects,counts.activeSubjects+1000);assert.equal(row.metadata.topics.length,200);assert.equal(row.metadata.truncated,true);assert.equal(row.metadata.matchedSources,4);throw marker;
   });}catch(error){if(error!==marker)throw error;rolled=true;}assert(rolled);
   assert.equal((await dashboard.readHierarchySummary()).semantic.automatic.activeSubjects,counts.activeSubjects);
   for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter'])await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT canonical_v4.named_read_dashboard_counts($1)',[generation]);}),code('42501'));
  }
 });
 await check(2,async()=>{
  await set(1);broad=await context();assert.equal(broad.scope.kind,'semantic');assert.equal(broad.scope.id,'games');
  await set(2);assert.equal((await context()).scope.id,parent);await set(3);assert.equal((await context()).scope.id,leaf);
  await set(8);assert.equal((await context()).scope.id,leaf);assert.equal((await one(owner,'SELECT subject_id::text id FROM canonical_v4.named_subject_selections WHERE source_id=$1',[source])).id,leaf);
  await owner.query('DELETE FROM canonical_v4.named_subject_selections WHERE source_id=$1',[source]);await set(2);assert.equal((await context()).scope.id,'invented-game-branch','prepared fixed hierarchy works without a learned selection');
  await owner.query('INSERT INTO canonical_v4.named_subject_selections VALUES($1,$2)',[source,leaf]);
  if(scope.sourceIds?.length)assert.equal((await editor.editor(JSON.stringify({generation,sourceId:scope.sourceIds.at(-1)}))).scope.kind,'page','unresolved page remains immediately writable');
  else{
   const rollback=Error('Rollback unprepared metadata control');let restored=false;
   try{await owner.transaction(async tx=>{await tx.query('DELETE FROM canonical_v4.named_subject_selections WHERE source_id=$1',[source]);
    await tx.query('DELETE FROM canonical_v4.semantic_observations WHERE source_id=$1',[source]);
    const page=await authors({database:tx,ownerGrouping:true,combinedHierarchy:true}).editor(JSON.stringify({generation,sourceId:source}));assert.equal(page.scope.kind,'page');throw rollback;
   });}catch(e){if(e!==rollback)throw e;restored=true;}assert(restored);
  }
 });
 await check(3,async()=>{
  await set(1,[{nodeId:'games',maxDepth:3}]);assert.equal((await context()).scope.id,leaf);
  await set(1,[{nodeId:'games',maxDepth:3},{nodeId:'subject-'+parent,maxDepth:2}]);assert.equal((await context()).scope.id,parent);
  const member=await one(owner,'DELETE FROM canonical_v4.named_subject_members WHERE subject_id=$1 AND source_id=$2 RETURNING *',[parent,source]);
  assert.equal((await context()).scope.id,parent,'a confident current child supports its current parent without copying all historical Sources into a new cohort');await post(await context());
  await owner.query('INSERT INTO canonical_v4.named_subject_members VALUES($1,$2,$3,$4,$5,$6)',[member.subject_id,member.source_id,member.source_version,member.operation_id,member.operation_digest,member.source_stamp]);
  const p=await policy.ownerPolicy();await assert.rejects(policy.setOwnerPolicy({expectedRevision:p.revision,defaultMaxDepth:1,overrides:[{nodeId:'subject-'+leaf,maxDepth:2}]}),code('invalid'));assert.deepEqual(await policy.ownerPolicy(),p);
  await set(3);assert.equal(await editor.scopeCurrent(JSON.stringify({generation,topicId:broad.topicId,scope:broad.scope})),true,'captured broad draft remains valid');
 });
 await check(4,async()=>{
  service=createPostgresCanonicalService({reads,runtime,lifecycle:life,authoredTopics:editor,semanticDiscussions:true,automaticTopics:true,allowLegacyAuthorCommands:schemaProfile==='hierarchy18'});
  config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-combined-topic-capability'};handler=createRequestHandler({config,service});
  const fetchImpl=async(url,options)=>{const u=new URL(url),r=await handler({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});};
  client=createLocalServiceClient({fetchImpl,getToken:()=>config.capability});assert.equal((await client.semanticCapabilities()).protocol,'semantic-topics/v2');await set(1);assert.equal((await client.authorContext({sourceId:source})).context.scope.kind,'semantic');
  await set(3);semanticRoot=await post(broad);assert(await has('games',semanticRoot));assert.equal(await has('invented-game-branch',semanticRoot),false,'a deliberately broad root cannot inherit the more specific Source path');
  const view=await client.semanticThread({nodeId:'games',rootId:semanticRoot,limit:20,cursor:null});assert.deepEqual(view.scope,{kind:'semantic',id:'games',caption:'Games'});assert.equal(view.topic.id,TOPIC);
 });
 await check(5,async at=>{
  await set(3);namedRoot=await post(await context());assert(await has('games',namedRoot));assert(await has('subject-'+leaf,namedRoot));
  const stored=await editor.root(JSON.stringify({generation,rootId:namedRoot}));assert.equal(stored.scope.id,leaf);assert.equal(stored.topicId,TOPIC);
  const occupied=(await client.semanticSearch({query:'Games',limit:20,cursor:null})).topics.find(t=>t.nodeId==='games');assert(occupied?.human&&occupied.occupied);
  at('BUNDLE');assert.deepEqual(occupied.breadcrumbs,{fixed:[{nodeId:'games',label:'Games'}],topic:[]});
  // Fixed aggregation above remains immediate. Named directory cards are
  // maintained asynchronously by the real worker; drain before their checks.
  at('CONTEXT');await drain();
  at('RESULT');const results=await client.semanticSearch({query:'Zenith',limit:50,cursor:null}),card=results.topics.find(t=>t.nodeId==='subject-'+leaf);assert(card);
  at('THREAD');
  assert.deepEqual(card.breadcrumbs.fixed,[{nodeId:'games',label:'Games'}]);
  assert.deepEqual(card.breadcrumbs.topic.map(t=>t.nodeId),['subject-'+parent,'subject-'+leaf]);
  assert.equal(card.breadcrumbs.topic.at(-1).label,card.label);
  const position=(await one(owner,'SELECT ordinal::text n FROM canonical_v4.contributions WHERE id=$1',[namedRoot])).n;
  const pageArgs=[String(BigInt(position)-1n),position,2,generation,matcherHash];
  assert((await owner.query(semanticLegacyRootPageSql(false),pageArgs)).rows.some(r=>r.id===namedRoot),'the old legacy candidate query sees this expressly authored root');
  assert.equal((await owner.query(semanticLegacyRootPageSql(true),pageArgs)).rows.length,0,'automatic owner maintenance cannot infer a replacement subject for an expressly authored root');
  await owner.transaction(async tx=>{
   await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   for(const table of Object.keys(describeAutomaticTopicBackupTables())){
    await tx.query(automaticTopicBackupRowQuery(table));let failed=false;
    try{for(;;){const {rows}=await tx.query('FETCH FORWARD 128 FROM backup_rows');assert(rows.length<=128);assert(rows.every(r=>/^[a-f0-9]{64}$/u.test(r.row_sha)));if(rows.length<128)break;}}
    catch(error){failed=true;throw error;}finally{try{await tx.query('CLOSE backup_rows');}catch(error){if(!failed)throw error;}}
   }
  });
 });
 await check(6,async()=>{
  for(const id of [semanticRoot,namedRoot]){const v=await client.semanticTarget({nodeId:'games',rootId:id,targetId:id});
   const result=await client.command(await expected(),{type:'reply',discussionId:v.discussionId,rootId:id,replyToId:id,originSourceId:null,body:'Reply through the confident general topic.',
    semanticTarget:{nodeId:'games',topicId:v.topic.id,rootRevision:v.rootRevision,targetRevision:v.targetRevision}},actor.id);replies.push(result.result.contributionId);
   assert((await client.semanticThread({nodeId:'games',rootId:id,limit:20,cursor:null})).root.replies.some(r=>r.id===result.result.contributionId));
  }
 });
 await check(7,async()=>{
  await set(1);const selected=await context(),bundle=await service.insightBundle({sourceId:source,topicId:TOPIC,includeDiscussion:false,includeRelatedSources:false,destinationTopicId:TOPIC});
  const insightContext=authoredFixtureInsightContext(bundle,source,TOPIC),inflight=new Set(),track=name=>(...args)=>{const p=Promise.resolve().then(()=>service[name](...args));inflight.add(p);p.then(()=>inflight.delete(p),()=>inflight.delete(p));return p;};let calls=0;
  const ai=createChatGPTRuntime({service:{...service,insightBundle:track('insightBundle'),insightJobBundle:track('insightJobBundle')},connectionAdapter:{status:()=>({connected:true,planEnabled:true,pending:false}),dispose(){}},
   insightsAdapter:{async createInsight(){calls++;return {body:'A generated public insight in the explicitly chosen Games topic.',citations:[],model:'synthetic'};},cancel(){},dispose(){}}});
  try{handler=createRequestHandler({config,service,ai});const aiClient=createLocalAiClient({fetchImpl:async(url,options)=>{const u=new URL(url),r=await handler({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});},getToken:()=>config.capability}),operationId='combined-native-ai-root';
   await aiClient.start({operationId,model:'synthetic',context:insightContext,articleText:'Invented product evidence for this general Games question.',allowWebResearch:false,includeRelatedSources:false,authorScope:selected.scope,expected:bundle.version},actor.id);
   const deadline=performance.now()+3000;while(!ai.diagnostics().events.some(e=>e.kind==='insight')&&performance.now()<deadline)await new Promise(done=>setTimeout(done,5));assert(ai.diagnostics().events.some(e=>e.kind==='insight'));
   const result=await aiClient.result(operationId,actor.id);assert.equal(result.state,'completed');assert.deepEqual(result.authorScope,selected.scope);assert.equal(calls,1);
   const posted=await client.command(bundle.version,{type:'share-insight',topicId:TOPIC,body:result.result.body,operationId,originSourceId:source,authorScope:selected.scope},actor.id);roots.push(posted.result.contributionId);
   assert(await has('games',posted.result.contributionId));assert.equal((await editor.root(JSON.stringify({generation,rootId:posted.result.contributionId}))).scope.kind,'semantic');
   if(schemaProfile==='hierarchy18'){
    const legacyBundle=await service.insightBundle({sourceId:source,topicId:TOPIC,includeDiscussion:false,includeRelatedSources:false,destinationTopicId:TOPIC}),legacyContext=authoredFixtureInsightContext(legacyBundle,source,TOPIC),legacyOperation='combined-native-legacy-ai-root';
    await aiClient.start({operationId:legacyOperation,model:'synthetic',context:legacyContext,articleText:'A legacy public article question with no named-topic intent.',allowWebResearch:false,includeRelatedSources:false,expected:legacyBundle.version},actor.id);
    const deadline=performance.now()+3000;let result;
    do{result=await aiClient.result(legacyOperation,actor.id);if(result.state==='completed'||result.state==='failed')break;await new Promise(done=>setTimeout(done,5));}while(performance.now()<deadline);
    assert.equal(result.state,'completed');assert.equal(result.authorScope,undefined);assert.equal(calls,2);
    const saved=await client.command(legacyBundle.version,{type:'share-insight',topicId:TOPIC,body:result.result.body,operationId:legacyOperation,originSourceId:source},actor.id);roots.push(saved.result.contributionId);
    assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_root_contexts WHERE root_id=$1',[saved.result.contributionId])).n,0,'legacy generated roots retain their original canonical destination without claiming a selected subject');
   }
  }finally{ai.dispose();await Promise.allSettled([...inflight]);handler=createRequestHandler({config,service});}
 });
 await check(8,async at=>{
  at('CONTEXT');
  // The owned cluster has app/crawler/worker roles only. Check every ACL
  // grantee (including PUBLIC), without inventing or impersonating a fifth role.
  assert.equal((await one(owner,`SELECT count(*)::integer n FROM pg_proc p
   CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='canonical_v4.combined_search_topics(text,text[],jsonb,integer)'::regprocedure
    AND a.privilege_type='EXECUTE' AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='murmingle_app'))`)).n,0);
  at('START');for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter'])await assert.rejects(owner.transaction(async tx=>{
   await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT * FROM canonical_v4.combined_search_topics($1,ARRAY[]::text[],NULL,20)',[generation]);}),code('42501'));
  at('RESULT');
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ["SELECT * FROM canonical_v4.combined_fixed_edges","SELECT canonical_v4.combined_supported_scopes('g','s')","SELECT canonical_v4.combined_index_fixed_root('r')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  const before=await one(owner,'SELECT count(*)::integer n FROM canonical_v4.contributions');
  for(const changed of [{caption:'A forged public topic'},{id:'nature',caption:'Nature'},{materialDigest:'f'.repeat(64)}])await assert.rejects(post({...broad,scope:{...broad.scope,...changed}}),code('conflict'));
  assert.deepEqual(await one(owner,'SELECT count(*)::integer n FROM canonical_v4.contributions'),before);
 });
 await check(9,async()=>{
  await set(prior.defaultMaxDepth,prior.overrides);for(const id of ids)await owner.query('SELECT canonical_v4.ingest_forget_source($1,$2)',[generation,id]);await drain();
  assert(await has('games',semanticRoot));assert.equal(await has('games',namedRoot),false,'Source-derived fixed membership disappears');assert(await has('subject-'+leaf,namedRoot));
  const retained=(await reads.semanticSearch({query:'Zenith',limit:50,cursor:null})).topics.find(t=>t.nodeId==='subject-'+leaf);assert(retained);
  assert.deepEqual(retained.breadcrumbs,{fixed:[],topic:[{nodeId:retained.nodeId,label:retained.label}]},'retired derived ancestry never relabels the surviving authored topic');
  const saved=await editor.root(JSON.stringify({generation,rootId:semanticRoot}));assert.deepEqual(saved.scope,{kind:'semantic',id:'games',caption:'Games'});
  if(dashboard){const counts=(await dashboard.readHierarchySummary()).semantic.automatic;assert.equal(counts.matchedSources,0);assert.equal(counts.occupiedSubjects,0);assert(counts.topics.every(t=>t.sources===0));}
  for(const root of roots)await life.command(await expected(),{type:'withdraw',contributionId:root},actor);
  const all=[...roots,...replies];await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[all]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[all]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[[...all,...ids]]);});
  if(scope.afterRetirement)await scope.afterRetirement();
  if(scope.retireSchema===false)return;
  for(const [file,names]of [['automatic-author-context.sql',['named_valid_editor_scope','named_attach_root_context']],['automatic-topic-feeds.sql',['named_schedule_root_feed']],['named-owner-grouping.sql',['semantic_set_owner_policy']],['unified-topic-search.sql',['unified_search_topics']]]){
   const raw=await readFile(new URL('../canonical-v4/drafts/'+file,import.meta.url),'utf8');for(const name of names)await owner.exec(sourceFunction(raw,name));
  }
  await owner.exec(`DROP FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_index_root_feed(text),canonical_v4.named_reply_member(text,text,text,bigint,text,text);
   ALTER FUNCTION canonical_v4.combined_original_check_scope(text,text,jsonb) RENAME TO named_check_editor_scope;
   ALTER FUNCTION canonical_v4.combined_original_index_root(text) RENAME TO named_index_root_feed;
   ALTER FUNCTION canonical_v4.combined_original_reply_member(text,text,text,bigint,text,text) RENAME TO named_reply_member;
   GRANT EXECUTE ON FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb) TO murmingle_app;
   DROP TABLE canonical_v4.combined_fixed_edges;
   DROP FUNCTION canonical_v4.combined_search_topics(text,text[],jsonb,integer);
   DROP FUNCTION canonical_v4.combined_named_prefix(text,uuid),canonical_v4.combined_source_fixed_path(text,text),canonical_v4.combined_supported_scopes(text,text),canonical_v4.combined_read_editor(text,text),canonical_v4.combined_index_fixed_root(text),canonical_v4.combined_read_fixed_feed(text,text,bigint,integer),canonical_v4.combined_fixed_activity(text,text),canonical_v4.combined_inherited_named_scope(text,text,uuid);
   ALTER TABLE canonical_v4.named_root_contexts DROP CONSTRAINT named_root_contexts_scope_kind_check;
   ALTER TABLE canonical_v4.named_root_contexts ADD CONSTRAINT named_root_contexts_scope_kind_check CHECK(scope_kind IN ('page','named'));
   ALTER TABLE canonical_v4.named_root_contexts DROP CONSTRAINT named_root_contexts_scope_id_check;
   ALTER TABLE canonical_v4.named_root_contexts ADD CONSTRAINT named_root_contexts_scope_id_check CHECK(canonical_v4.runtime_safe_text(scope_id,128,false));`);
 });
}
