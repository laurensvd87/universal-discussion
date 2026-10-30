// Offline comparison over a bounded, already captured development cohort.
// Import performs no IO. No vectors are encoded, published or sent elsewhere.
import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
import {proposeFocusedSubjects as oldSubjects} from '../experiments/automatic-topic-discovery-v1/focus-subjects.js';
import {proposeFocusedSubjects as currentSubjects} from '../experiments/automatic-topic-discovery-v2/focus-subjects.js';
const SHA=/^[a-f0-9]{64}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const sha=value=>createHash('sha256').update(value).digest('hex');
const need=value=>{if(!value)throw new TypeError('Invalid stored-topic screen');};
export const STORED_TOPIC_SCREEN_LIMITS=Object.freeze({rows:48,repetitions:30,inputBytes:1048576,totalMs:45000});
export const STORED_TOPIC_SCREEN_PROBES=Object.freeze([
 {id:'koalas',pattern:'\\mkoalas?\\M'}, {id:'gta',pattern:'\\m(gta|grand theft auto)\\M'},
 {id:'kapsalon',pattern:'\\mkapsalon\\M'}, {id:'pandas',pattern:'\\mpandas?\\M'},
 {id:'switch',pattern:'\\mnintendo switch\\M'}, {id:'steam-deck',pattern:'\\msteam deck\\M'},
].map(Object.freeze));
// Each probe is independently bounded before the exact current material join.
// The query reads no body text. Binary64 arrays preserve stored E5 coordinates.
export const STORED_TOPIC_SCREEN_SQL=`WITH probes AS (
 SELECT ord,id,pattern FROM jsonb_to_recordset($1::jsonb) AS p(ord integer,id text,pattern text)
), candidates AS (
 SELECT p.ord,p.id AS probe,s.* FROM probes p CROSS JOIN LATERAL (
  SELECT id,title,url,ordinal,write_version,operation_id FROM canonical_v4.sources
  WHERE provenance='owner-local-page-embedding/v1' AND title ~* p.pattern ORDER BY ordinal,id LIMIT 8
 ) s
), unique_sources AS (SELECT DISTINCT ON(id) * FROM candidates ORDER BY id,ord)
SELECT c.probe,c.id AS "sourceId",c.title,c.url,c.write_version::text AS "sourceVersion",
 c.operation_id AS "operationId",i.operation_digest AS "operationDigest",st.stamp AS "sourceStamp",
 i.supported_path AS "acceptedPath",i.body_wire_hash AS "bodyWireHash",i.title_wire_hash AS "titleWireHash",
 replace(encode(array_send(i.body_values),'base64'),E'\\n','') AS "bodyBase64",
 replace(encode(array_send(i.title_values),'base64'),E'\\n','') AS "titleBase64"
FROM unique_sources c JOIN canonical_v4.semantic_installation h ON h.singleton
JOIN canonical_v4.semantic_observations o ON o.source_id=c.id AND o.source_version=c.write_version AND o.matcher_hash=h.matcher_hash
 AND o.generation=$2 AND o.installation_revision=h.revision AND o.operation_id=c.operation_id
JOIN canonical_v4.semantic_inputs i ON i.source_id=o.source_id AND i.operation_digest=o.operation_digest AND i.matcher_hash=o.matcher_hash
JOIN canonical_v4.runtime_source_stamps st ON st.source_id=c.id
WHERE i.semantic_eligible ORDER BY c.ord,c.ordinal,c.id LIMIT 48`;

function decode(raw,expected){need(typeof raw==='string'&&raw.length<=8192&&typeof expected==='string'&&SHA.test(expected)&&sha(Buffer.from(raw,'base64'))===expected);
 const v=decodeEmbeddingBase64Array(raw);need(v.length===384&&Math.abs(Math.hypot(...v)-1)<1e-5);return v;}
export function screenStoredTopics({rows,inputDefinition,matcherHash,now=()=>performance.now()}){
 need(Array.isArray(rows)&&rows.length<=STORED_TOPIC_SCREEN_LIMITS.rows&&typeof matcherHash==='string'&&SHA.test(matcherHash)&&typeof now==='function');
 need(Buffer.byteLength(JSON.stringify(rows))<=STORED_TOPIC_SCREEN_LIMITS.inputBytes);const seen=new Set();
 const decoded=rows.map(r=>{
  need(r&&typeof r==='object'&&typeof r.sourceId==='string'&&ID.test(r.sourceId)&&!seen.has(r.sourceId)&&STORED_TOPIC_SCREEN_PROBES.some(p=>p.id===r.probe));seen.add(r.sourceId);
  need(typeof r.title==='string'&&r.title.length<=200&&Array.isArray(r.acceptedPath));
  const url=new URL(r.url);need(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password);
  return {raw:r,body:decode(r.bodyBase64,r.bodyWireHash),title:decode(r.titleBase64,r.titleWireHash),publisherKey:url.hostname.replace(/^www\./u,'')};
 });
 const started=now(),variants=[];
 for(const [id,bodyWeight,titleWeight,algorithm]of [
  ['paired-v1',.75,.25,oldSubjects],['paired-v2',.75,.25,currentSubjects],
  ['body-only-v2',1,0,currentSubjects],['title-only-v2',0,1,currentSubjects],
 ]){
  need(now()-started<STORED_TOPIC_SCREEN_LIMITS.totalMs);const paired=compilePairedE5Input({...inputDefinition,bodyWeight,titleWeight}),representationHash=describePairedE5Input(paired).representationHash;
  const observations=decoded.map(({raw:r,body,title,publisherKey})=>{
   const inputHash=sha(JSON.stringify([r.sourceId,r.sourceVersion,r.operationId,r.operationDigest,r.sourceStamp]));
   const v=applyPairedE5Input(paired,{sourceId:r.sourceId,sourceVersion:inputHash,bodyVector:body,titleVector:title});need(v.status==='available');
   return {sourceId:r.sourceId,inputHash,materialHash:sha(JSON.stringify([r.bodyWireHash,r.titleWireHash])),title:r.title,publisherKey,acceptedPath:r.acceptedPath,vector:v.vector};
  });
  const raw=JSON.stringify({representationHash,matcherHash,minimumSimilarity:.8,observations});need(Buffer.byteLength(raw)<=1048576);
  const result=algorithm(raw),times=[];for(let i=0;i<STORED_TOPIC_SCREEN_LIMITS.repetitions;i++){need(now()-started<STORED_TOPIC_SCREEN_LIMITS.totalMs);const at=now();algorithm(raw);times.push(now()-at);}times.sort((a,b)=>a-b);
  variants.push({id,representationHash,status:result.status,reason:result.reason??null,assigned:result.selections.filter(s=>s.preferredProposalKey!==null).length,
   proposedSubjects:result.proposals.length,proposals:result.proposals.map(p=>({label:p.label,sourceIds:p.members.map(m=>m.sourceId),parentProposalKey:p.parentProposalKey,minimumPairSimilarity:p.minimumPairSimilarity})),
   selections:result.selections,timing:{repetitions:times.length,p50Ms:times[14],p95Ms:times[28]},work:result.work});
 }
 return {schema:'stored-topic-development-screen/v1',rows:rows.length,probes:STORED_TOPIC_SCREEN_PROBES.map(p=>({id:p.id,rows:rows.filter(r=>r.probe===p.id).length})),variants,
  scope:{storedE5:true,newEncoder:false,newCapture:false,databaseWrites:false,publication:false,liveChanged:false,prospectiveValidation:false,representativeAccuracy:false,globalRetrievalRecall:false,endToEndLatency:false}};
}
