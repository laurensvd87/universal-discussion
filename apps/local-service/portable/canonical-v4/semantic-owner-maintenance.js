// Explicit owner maintenance. No startup hook, claims, encoder or HTTP authority.
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
import {readId} from '../../src/domain/validation.js';
import {createCanonicalV4SemanticSourceRepository} from './semantic-source-repository.js';
import {createCanonicalV4SemanticDiscussionRepository} from './semantic-discussion-repository.js';
import {verifyStoredSourceCandidate} from './semantic-source-preparation.js';
import {decodeEmbeddingBase64Array} from './embedding-binary-wire.js';

const MAX=9223372036854775807n,BYTES=4194304;
const invalid=()=>{throw new TypeError('Invalid semantic owner maintenance request');};
const conflict=()=>{throw new ServiceError('conflict','Semantic owner context changed');};
function record(value,keys){if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;}
function counter(v){if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(v)||BigInt(v)>MAX)invalid();return v;}
function revision(v){if(!Number.isSafeInteger(v)||v<0||v>=Number.MAX_SAFE_INTEGER)invalid();return v;}
function scope(value,extra){const a=record(value,['expectedGeneration','expectedMatcherIdentityHash','expectedHeadRevision','expectedPolicyRevision',...extra]);if(typeof a.expectedGeneration!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(a.expectedGeneration)||typeof a.expectedMatcherIdentityHash!=='string'||!/^[a-f0-9]{64}$/u.test(a.expectedMatcherIdentityHash))invalid();revision(a.expectedHeadRevision);revision(a.expectedPolicyRevision);return a;}
function rootInput(value){const a=scope(value,['cursor','initialHighWatermark','limit']);if(a.cursor!==null)counter(a.cursor);if(a.initialHighWatermark!==null)counter(a.initialHighWatermark);if(!Number.isInteger(a.limit)||a.limit<1||a.limit>10||a.cursor!==null&&(a.initialHighWatermark===null||BigInt(a.cursor)>BigInt(a.initialHighWatermark)))invalid();return a;}
function policyInput(value){const a=scope(value,['policy']),p=record(a.policy,['defaultMaxDepth','overrides']);if(!Number.isInteger(p.defaultMaxDepth)||p.defaultMaxDepth<1||p.defaultMaxDepth>8||!Array.isArray(p.overrides)||types.isProxy(p.overrides)||p.overrides.length>512||Reflect.ownKeys(p.overrides).length!==p.overrides.length+1)invalid();const seen=new Set();const overrides=Array.from({length:p.overrides.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(p.overrides,String(i));if(!d||!Object.hasOwn(d,'value'))invalid();const r=record(d.value,['nodeId','maxDepth']);if(typeof r.nodeId!=='string'||!r.nodeId.length||r.nodeId.length>160||/[\p{Cc}\p{Cf}]/u.test(r.nodeId)||seen.has(r.nodeId)||!Number.isInteger(r.maxDepth)||r.maxDepth<1||r.maxDepth>8)invalid();seen.add(r.nodeId);return r;});return {...a,policy:{defaultMaxDepth:p.defaultMaxDepth,overrides}};}
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
async function fence(tx,a,readOnly,policyWrite=false){
 if(tx?.dialect!=='pg'||typeof tx.query!=='function')invalid();
 if(readOnly)await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const access=await tx.query("SELECT current_user AS role,current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only");
 if(access.rows?.length!==1||access.rows[0].role!=='murmingle_owner')throw new ServiceError('forbidden','Owner PostgreSQL role required');
 if(access.rows[0].isolation!==(readOnly?'repeatable read':'read committed')||access.rows[0].read_only!==(readOnly?'on':'off'))invalid();
 const {rows}=await tx.query(`SELECT r.generation,i.matcher_hash,i.revision::text AS head_revision
 FROM canonical_v4.semantic_installation i CROSS JOIN canonical_v4.runtime_state r
 WHERE i.singleton AND r.singleton${readOnly?'':' FOR SHARE OF i'}`);
 if(rows?.length!==1||rows[0].generation!==a.expectedGeneration||rows[0].matcher_hash!==a.expectedMatcherIdentityHash||rows[0].head_revision!==String(a.expectedHeadRevision))conflict();
 // Separate statements fix head-before-policy lock order. A policy writer must
 // not acquire SHARE then upgrade: concurrent writers would deadlock on upgrade.
 const policy=await tx.query(`SELECT revision::text AS policy_revision FROM canonical_v4.semantic_owner_policy WHERE singleton${readOnly||policyWrite?'':' FOR SHARE'}`);
 if(policy.rows?.length!==1||policy.rows[0].policy_revision!==String(a.expectedPolicyRevision))conflict();
}

// Root bodies/revisions are deliberately absent from this result. Only bounded
// Source material is read internally to reuse the existing exact verifier.
const ROOT_PAGE=`WITH roots AS MATERIALIZED (
 SELECT c.id,c.write_version,c.ordinal,c.discussion_id,c.origin_source_id,c.anchor_source_id,c.withdrawn,c.visibility,
 c.payload::jsonb->'anchor'->>'kind' anchor_kind,c.payload::jsonb->'anchor'->>'stamp' anchor_stamp,
 c.payload::jsonb->>'originalTopicId' original_topic,c.payload::jsonb->'learnedOrigin' learned_origin
 FROM canonical_v4.contributions c WHERE c.root_id IS NULL AND ($1::bigint IS NULL OR c.ordinal>$1)
 AND c.ordinal<=$2::bigint ORDER BY c.ordinal LIMIT $3
) SELECT c.id,c.write_version::text AS root_version,c.ordinal::text AS ordinal,c.discussion_id,d.topic_id,
 c.withdrawn,c.visibility,c.origin_source_id,c.anchor_source_id,c.anchor_kind,c.anchor_stamp,c.original_topic,c.learned_origin,
 t.kind AS topic_kind,l.method AS source_link_method,
 (snap.root_id IS NOT NULL) AS existing_snapshot,st.stamp AS current_stamp,st.postable,
 o.source_id AS observed_source,i.semantic_eligible,i.supported_path,
 CASE WHEN s.id IS NULL OR e.source_id IS NULL OR r.source_id IS NULL OR st.source_id IS NULL OR
 octet_length(s.payload)>65536 OR octet_length(e.payload)>32768 THEN NULL ELSE jsonb_build_object(
 'sourceId',s.id,'ordinal',s.ordinal::text,'sourceVersion',s.write_version::text,'generation',$4::text,'matcherIdentityHash',$5::text,
 'url',s.url,'title',s.title,'provenance',s.provenance,'extractorVersion',s.extractor_version,'policyVersion',s.policy_version,
 'operationId',s.operation_id,'hasEmbedding',s.has_embedding,'sourcePayload',s.payload,
 'embedding',jsonb_build_object('sourceId',s.id,'modelId',e.model_id,'dimensions',e.dimensions,'payload',e.payload,
 'valuesBase64',replace(encode(array_send(e.values_double),'base64'),chr(10),'')),
 'receipt',jsonb_build_object('sourceId',r.source_id,'operationId',r.operation_id,'operationDigest',r.operation_digest),
 'stamp',jsonb_build_object('sourceId',st.source_id,'stamp',st.stamp,'postable',st.postable),'reuse',NULL) END AS candidate
 FROM roots c LEFT JOIN canonical_v4.discussions d ON d.id=c.discussion_id
 LEFT JOIN canonical_v4.topics t ON t.id=d.topic_id
 LEFT JOIN canonical_v4.semantic_root_snapshots snap ON snap.root_id=c.id
 LEFT JOIN canonical_v4.sources s ON s.id=c.origin_source_id LEFT JOIN canonical_v4.embeddings e ON e.source_id=s.id
 LEFT JOIN canonical_v4.source_links l ON l.source_id=s.id
 LEFT JOIN canonical_v4.operation_receipts r ON r.source_id=s.id LEFT JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id
 LEFT JOIN canonical_v4.semantic_observations o ON o.source_id=s.id AND o.source_version=s.write_version AND o.matcher_hash=$5
 AND o.generation=$4 AND o.operation_id=s.operation_id AND o.operation_digest=r.operation_digest
 LEFT JOIN canonical_v4.semantic_inputs i ON i.source_id=o.source_id AND i.operation_digest=o.operation_digest AND i.matcher_hash=o.matcher_hash
 ORDER BY c.ordinal`;
const AUTOMATIC_ROOT_PAGE=ROOT_PAGE.replace('c.root_id IS NULL AND ($1::bigint IS NULL OR c.ordinal>$1)',
 'c.root_id IS NULL AND NOT EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts authored_ WHERE authored_.root_id=c.id) AND ($1::bigint IS NULL OR c.ordinal>$1)');
if(AUTOMATIC_ROOT_PAGE===ROOT_PAGE)throw new TypeError('Invalid legacy root query composition');
// Shared with the owned SQL rehearsal. This exposes fixed query text only;
// neither caller supplies SQL nor acquires a database or migration capability.
export function semanticLegacyRootPageSql(automaticTopics=false){if(typeof automaticTopics!=='boolean')invalid();return automaticTopics?AUTOMATIC_ROOT_PAGE:ROOT_PAGE;}
const REASONS=['eligible','adopted','existing','withdrawn','manual','unpinned','stale-anchor','pending','excluded','abstained','invalid-material'];
function inspectRow(row){
 if(row.existing_snapshot)return {status:'existing'};
 if(row.withdrawn||row.visibility!=='local-public')return {status:'withdrawn'};
 if(row.learned_origin!==true||!row.origin_source_id||row.topic_kind==='manual'||row.source_link_method==='manual-confirmed')return {status:'manual'};
 if(row.anchor_kind!=='source'||row.anchor_source_id!==row.origin_source_id||!row.anchor_stamp)return {status:'unpinned'};
 if(row.original_topic!==row.topic_id||row.anchor_stamp!==row.current_stamp)return {status:'stale-anchor'};
 if(row.postable!==true)return {status:'excluded'};
 try{const candidate=row.candidate;if(!candidate)invalid();const checked=verifyStoredSourceCandidate({...candidate,embedding:{...candidate.embedding,values:decodeEmbeddingBase64Array(candidate.embedding.valuesBase64)}});if(!checked.semanticEligible)return {status:'excluded'};
  // Pending means preparation can consume this exact material. A missing
  // observation must not bypass the same mirror checks used for adoption.
  if(row.observed_source===null)return {status:'pending'};
  if(row.semantic_eligible!==true||row.postable!==true)return {status:'excluded'};
  if(!Array.isArray(row.supported_path)||!row.supported_path.length)return {status:'abstained'};
  return {status:'eligible',item:{generation:checked.generation,matcherIdentityHash:checked.matcherIdentityHash,sourceId:checked.sourceId,sourceVersion:checked.sourceVersion,operationId:checked.operationId,operationDigest:checked.operationDigest,requestMaterial:checked.requestMaterial,sourceStamp:checked.sourceStamp,bodyWireHash:checked.bodyWireHash,rootId:row.id,rootVersion:row.root_version,topicId:row.topic_id,discussionId:row.discussion_id}};
 }catch{return {status:'invalid-material'};}
}
export function createSemanticOwnerMaintenance({database,automaticTopics=false}={}){
 if(database?.dialect!=='pg'||typeof database.query!=='function'||typeof database.transaction!=='function'||typeof automaticTopics!=='boolean')invalid();
 async function roots(input,adopt){const a=rootInput(input);return database.transaction(async tx=>{
  await fence(tx,a,!adopt);let high=a.initialHighWatermark;
  if(high===null){const result=await tx.query('SELECT max(ordinal)::text AS high_watermark FROM canonical_v4.contributions WHERE root_id IS NULL');if(result.rows?.length!==1)invalid();high=result.rows[0].high_watermark;if(high!==null)counter(high);}
  let selected=[];if(high!==null){const result=await tx.query(semanticLegacyRootPageSql(automaticTopics),[a.cursor,high,a.limit+1,a.expectedGeneration,a.expectedMatcherIdentityHash]);selected=result.rows;if(!Array.isArray(selected)||selected.length>a.limit+1||Buffer.byteLength(JSON.stringify(selected))>BYTES)invalid();}
  const more=selected.length>a.limit,rows=selected.slice(0,a.limit),counts=Object.fromEntries(REASONS.map(k=>[k,0]));let prior=a.cursor;
  const seen=new Set();const details=rows.map(row=>{counter(row.ordinal);counter(row.root_version);readId(row.id);readId(row.topic_id);readId(row.discussion_id);if(typeof row.withdrawn!=='boolean'||typeof row.existing_snapshot!=='boolean'||seen.has(row.id)||prior!==null&&BigInt(row.ordinal)<=BigInt(prior)||BigInt(row.ordinal)>BigInt(high))invalid();seen.add(row.id);prior=row.ordinal;const inspected=inspectRow(row);counts[inspected.status]++;return {row,...inspected};});
  let adopted=0;if(adopt){const items=details.filter(d=>d.status==='eligible').map(d=>d.item);if(items.length){const outcomes=await createCanonicalV4SemanticSourceRepository({database:tx}).adoptLegacyRoots({generation:a.expectedGeneration,matcherIdentityHash:a.expectedMatcherIdentityHash,items});for(const outcome of outcomes){const detail=details.find(d=>d.row.id===outcome.rootId);counts.eligible--;counts[outcome.status]++;detail.status=outcome.status;if(outcome.status==='adopted')adopted++;}}}
  return freeze({schema:'semantic-legacy-root-maintenance/v1',mode:adopt?'adopt':'inspect',scope:{generation:a.expectedGeneration,matcherIdentityHash:a.expectedMatcherIdentityHash,headRevision:a.expectedHeadRevision,policyRevision:a.expectedPolicyRevision,initialHighWatermark:high},scanned:rows.length,counts,adopted,
   rows:details.map(d=>({rootId:d.row.id,rootVersion:d.row.root_version,ordinal:d.row.ordinal,topicId:d.row.topic_id,discussionId:d.row.discussion_id,status:d.status})),nextCursor:more?prior:null,complete:!more,
   contextBasis:'legacy-current-source-context',canonicalContentChanged:false,workerAdoptionGranted:false,unclassifiedCanonicalAccessStillRequired:true});
 });}
 return Object.freeze({inspectLegacyRoots:input=>roots(input,false),adoptLegacyRoots:input=>roots(input,true),
  async setHierarchyPolicy(input){const a=policyInput(input);return database.transaction(async tx=>{await fence(tx,a,false,true);const policy=await createCanonicalV4SemanticDiscussionRepository({database:tx}).setOwnerPolicy({expectedRevision:a.expectedPolicyRevision,...a.policy});return freeze({schema:'semantic-owner-policy-maintenance/v1',generation:a.expectedGeneration,matcherIdentityHash:a.expectedMatcherIdentityHash,headRevision:a.expectedHeadRevision,policy,matcherActivated:false,canonicalContentChanged:false});});},
 });
}
export function readSemanticOwnerMaintenanceInput(operation,value){
 if(operation==='inspect-legacy-roots'||operation==='adopt-legacy-roots')return freeze(rootInput(value));
 if(operation==='set-hierarchy-policy')return freeze(policyInput(value));
 invalid();
}
