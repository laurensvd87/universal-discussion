// Explicit original-backup exercise only. Import performs no SQL/model/IO.
import {randomUUID,createHash} from 'node:crypto';
import {types} from 'node:util';
import {createSemanticOwnerMaintenance} from '../canonical-v4/semantic-owner-maintenance.js';
import {createCanonicalV4SemanticDiscussionRepository} from '../canonical-v4/semantic-discussion-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {openInstalledHierarchyWorkerResources} from '../../src/application/hierarchy-worker-resources.js';
import {readInstalledOwnerTopicConfiguration} from '../../src/application/owner-topic-configuration.js';
import {createInstalledFixedReferenceMatcher} from '../../src/domain/fixed-reference-topic-integration.js';

const MATCHER='eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c';
const fail=()=>Object.assign(new Error('Private original legacy adoption unavailable'),{code:'PRIVATE_LEGACY_ADOPTION'});
const need=value=>{if(!value)throw fail();};
function exact(value,keys){need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length);const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'));out[key]=d.value;}return out;}
function counter(v){need(typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n);return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
const SCOPE_SQL=`SELECT r.generation,h.matcher_hash,h.revision::text AS head_revision,p.revision::text AS policy_revision
 FROM canonical_v4.runtime_state r CROSS JOIN canonical_v4.semantic_installation h CROSS JOIN canonical_v4.semantic_owner_policy p
 WHERE r.singleton AND h.singleton AND p.singleton`;
const SOURCE_SQL=`SELECT s.id,s.ordinal::text AS ordinal FROM canonical_v4.contributions c
 JOIN canonical_v4.sources s ON s.id=c.origin_source_id WHERE c.id=$1 AND c.root_id IS NULL AND c.ordinal=$2::bigint`;
// Fixed closure only, bounded BEFORE aggregation. No whole-catalog projection.
const CANONICAL_SQL=`WITH c AS MATERIALIZED (SELECT * FROM canonical_v4.contributions WHERE id=$1 OR root_id=$1 ORDER BY ordinal LIMIT 1001),
 v AS MATERIALIZED (SELECT r.* FROM canonical_v4.revisions r JOIN c ON c.id=r.contribution_id ORDER BY r.contribution_id,r.ordinal LIMIT 4001),
 root AS (SELECT * FROM c WHERE id=$1), doc AS (SELECT s.* FROM canonical_v4.sources s JOIN root c ON c.origin_source_id=s.id),
 material AS (SELECT jsonb_build_object(
 'contributions',(SELECT jsonb_agg(to_jsonb(c) ORDER BY ordinal) FROM c),
 'revisions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY contribution_id,ordinal) FROM v),
 'source',(SELECT to_jsonb(doc) FROM doc),
 'embedding',(SELECT to_jsonb(e) FROM canonical_v4.embeddings e JOIN doc ON doc.id=e.source_id),
 'stamp',(SELECT to_jsonb(s) FROM canonical_v4.runtime_source_stamps s JOIN doc ON doc.id=s.source_id),
 'receipt',(SELECT to_jsonb(r) FROM canonical_v4.operation_receipts r JOIN doc ON doc.id=r.source_id),
 'link',(SELECT to_jsonb(l) FROM canonical_v4.source_links l JOIN doc ON doc.id=l.source_id),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.topic_id) FROM canonical_v4.topic_memberships m JOIN doc ON doc.id=m.source_id),
 'discussion',(SELECT to_jsonb(d) FROM canonical_v4.discussions d JOIN root c ON c.discussion_id=d.id),
 'topic',(SELECT to_jsonb(t) FROM canonical_v4.topics t JOIN canonical_v4.discussions d ON d.topic_id=t.id JOIN root c ON c.discussion_id=d.id),
 'runtime',(SELECT to_jsonb(r) FROM canonical_v4.runtime_state r WHERE singleton))::text AS text)
 SELECT encode(sha256(convert_to(text,'UTF8')),'hex') AS digest,octet_length(text) AS bytes,
 (SELECT count(*)::integer FROM c) AS contributions,(SELECT count(*)::integer FROM v) AS revisions,
 (SELECT encode(sha256(convert_to(payload::jsonb->>'body','UTF8')),'hex') FROM v WHERE contribution_id=$1 ORDER BY ordinal DESC LIMIT 1) AS root_body_hash FROM material`;
const REAL={owner:database=>createSemanticOwnerMaintenance({database}),feeds:database=>createCanonicalV4SemanticDiscussionRepository({database}),reads:database=>createCanonicalV4ReadFacade({database}),
 openResources:openInstalledHierarchyWorkerResources,
 reference:()=>{const config=readInstalledOwnerTopicConfiguration();need(config.alternateRidgeAdapter!==null);return createInstalledFixedReferenceMatcher(config.alternateRidgeAdapter);}};

async function run(context,ports,testComposition){
 const a=exact(context,['ownerDatabase','workerDatabase','originalRootHighWatermark','deadline','checkDeadline']);
 for(const db of [a.ownerDatabase,a.workerDatabase])need(db&&db.dialect==='pg'&&typeof db.query==='function'&&typeof db.transaction==='function');
 need(a.ownerDatabase!==a.workerDatabase&&typeof a.checkDeadline==='function'&&Number.isFinite(a.deadline));
 if(a.originalRootHighWatermark!==null)counter(a.originalRootHighWatermark);
 const check=()=>{a.checkDeadline();need(performance.now()<a.deadline);};
 async function original(work){check();const result=await work();check();return result;}
 async function query(sql,args=[]){return original(()=>a.ownerDatabase.query(sql,args));}
 const counts={pages:0,scanned:0,pending:0,eligible:0,prepared:0,reclassified:0,adopted:0};
 let resources=null,retirement=null,resourcesClosed=true,stage='scope',status='failed',reason=null,canonicalPreserved=false,repeatInert=false,readVerified=false;
 async function retire(){if(resources){retirement??=Promise.resolve().then(()=>resources.close());await retirement;resourcesClosed=true;}}
 try{
  const head=(await query(SCOPE_SQL)).rows;need(head.length===1&&head[0].matcher_hash===MATCHER);
  const h=head[0];counter(h.head_revision);counter(h.policy_revision);
  need(Number.isSafeInteger(Number(h.head_revision))&&Number.isSafeInteger(Number(h.policy_revision)));
  const scope={expectedGeneration:h.generation,expectedMatcherIdentityHash:MATCHER,expectedHeadRevision:Number(h.head_revision),expectedPolicyRevision:Number(h.policy_revision)};
  const owner=ports.owner(a.ownerDatabase);let cursor=null,selected=null,complete=a.originalRootHighWatermark===null;
  stage='original-inspection';
  for(let page=0;page<10&&!complete;page++){
   const result=await original(()=>owner.inspectLegacyRoots({...scope,cursor,initialHighWatermark:a.originalRootHighWatermark,limit:10}));
   counts.pages++;counts.scanned+=result.scanned;
   for(const row of result.rows){need(BigInt(counter(row.ordinal))<=BigInt(a.originalRootHighWatermark));if(row.status==='pending'||row.status==='eligible'){counts[row.status]++;selected=row;break;}}
   if(selected)break;complete=result.complete;cursor=result.nextCursor;need(complete||cursor!==null);
  }
  if(!selected){status='not-applicable';reason=complete?'no-eligible-original-root':'original-scan-bound';}
  else{
   const rootId=selected.rootId;
   async function canonical(){return original(()=>a.ownerDatabase.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const result=(await tx.query(CANONICAL_SQL,[rootId])).rows;need(result.length===1);const row=result[0];
    need(/^[a-f0-9]{64}$/u.test(row.digest)&&/^[a-f0-9]{64}$/u.test(row.root_body_hash)&&row.contributions>=1&&row.contributions<=1000&&row.revisions<=4000&&row.bytes<=4194304);return row;
   }));}
   stage='canonical-baseline';const before=await canonical();
   if(selected.status==='pending'){
    stage='original-source';const found=(await query(SOURCE_SQL,[rootId,selected.ordinal])).rows;need(found.length===1);const source=found[0];counter(source.ordinal);
    stage='stored-preparation';resourcesClosed=false;
    // Capture resource ownership before the post-await deadline check.
    check();resources=await ports.openResources({database:a.workerDatabase,referenceMatcher:ports.reference(),nextId:kind=>kind+'-'+randomUUID(),now:()=>new Date().toISOString()});check();
    need(resources.descriptor.installed.matcherIdentityHash===MATCHER);
    const batch=await original(()=>resources.storedSources.candidates({generation:h.generation,matcherIdentityHash:MATCHER,afterOrdinal:BigInt(source.ordinal)===0n?null:String(BigInt(source.ordinal)-1n),limit:1}));
    need(batch.candidates.length===1&&batch.candidates[0].sourceId===source.id&&batch.candidates[0].ordinal===source.ordinal);
    const item=await original(()=>resources.prepareStoredSource(batch.candidates[0]));
    if(item===null){status='not-applicable';reason='original-source-ineligible';}
    else{counts.prepared++;const result=await original(()=>resources.storedSources.reclassify({generation:h.generation,matcherIdentityHash:MATCHER,items:[item]}));need(result.length===1&&result[0].sourceId===source.id);counts.reclassified++;}
    stage='resource-retirement';await retire();check();
   }
   if(status!=='not-applicable'){
    stage='adoption';const input={...scope,cursor:BigInt(selected.ordinal)===0n?null:String(BigInt(selected.ordinal)-1n),initialHighWatermark:selected.ordinal,limit:1};
    const result=await original(()=>owner.adoptLegacyRoots(input));need(result.scanned===1&&result.rows[0].rootId===rootId);
    if(result.adopted!==1){status='not-applicable';reason='original-source-unclassified';}
    else{
     counts.adopted=1;stage='readback';
     const snapshot=(await query(`SELECT s.supported_path,s.context_basis,(SELECT array_agg(e.node_id ORDER BY array_position(s.supported_path,e.node_id)) FROM canonical_v4.semantic_root_edges e WHERE e.root_id=s.root_id) AS ancestor_edges
      FROM canonical_v4.semantic_root_snapshots s WHERE s.root_id=$1`,[rootId])).rows;
     need(snapshot.length===1&&snapshot[0].context_basis==='legacy-current-source-context'&&Array.isArray(snapshot[0].supported_path)&&snapshot[0].supported_path.length>0&&snapshot[0].supported_path.length<=8&&JSON.stringify(snapshot[0].ancestor_edges)===JSON.stringify(snapshot[0].supported_path));
     for(const nodeId of snapshot[0].supported_path){const refs=await original(()=>ports.feeds(a.ownerDatabase).feedReferences({generation:h.generation,nodeId,beforeOrdinal:String(BigInt(selected.ordinal)+1n),limit:1}));need(refs.references.length===1&&refs.references[0].rootId===rootId&&refs.references[0].topicId===selected.topicId&&refs.references[0].discussionId===selected.discussionId);}
     const thread=await original(()=>ports.reads(a.ownerDatabase).semanticThread({nodeId:snapshot[0].supported_path.at(-1),rootId,limit:50,cursor:null}));
     need(thread.root.id===rootId&&thread.topic.id===selected.topicId&&thread.discussionId===selected.discussionId&&thread.root.replies.every(reply=>reply.rootId===rootId));
     need(typeof thread.root.body==='string'&&createHash('sha256').update(thread.root.body).digest('hex')===before.root_body_hash);readVerified=true;
     stage='repeat';const stamp=async()=>JSON.stringify((await query('SELECT * FROM canonical_v4.semantic_read_revision()')).rows);
     const prior=await stamp(),again=await original(()=>owner.adoptLegacyRoots(input));need(again.adopted===0&&again.counts.existing===1&&await stamp()===prior);repeatInert=true;
     status='passed';
    }
   }
   stage='canonical-preservation';const after=await canonical();need(after.digest===before.digest);canonicalPreserved=true;
  }
 }catch{status='failed';reason=stage==='resource-retirement'?'resource-retirement-failed':'original-legacy-exercise-failed';}
 finally{if(resources&&!resourcesClosed)try{await retire();}catch{if(status!=='failed'){status='failed';stage='resource-retirement';reason='resource-retirement-failed';}}}
 return freeze({schema:'private-original-legacy-adoption-proof/v1',status,reason,failure:status==='failed'?{stage,code:'PRIVATE_LEGACY_ADOPTION'}:null,counts,
  canonicalPreserved,repeatInert,readVerified,resourcesClosed,testComposition,
  scope:{originalBackupRootsOnly:true,maximumPages:10,pageSize:10,maximumAdoptedRoots:1,contextBasis:'legacy-current-source-context',recapture:false,qualityEvaluation:false,canonicalWrites:false,callerDatabasesClosed:false}});
}
export async function runPrivateLegacyAdoptionRehearsal(context){need(arguments.length===1);return run(context,REAL,false);}
// Explicit pure fake-port composition; it never claims a real model/SQL run.
export async function runPrivateLegacyAdoptionRehearsalForTest(context,dependencies){need(arguments.length===2);const p=exact(dependencies,Object.keys(REAL));need(Object.values(p).every(v=>typeof v==='function'));return run(context,p,true);}
