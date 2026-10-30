// Fixed new-domain stored-page validation. No IO, training or publication.
// Gold annotations are consumed only after the unmodified V3 has returned.
import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
import {proposeFocusedSubjects} from '../experiments/automatic-topic-discovery-v3/focus-subjects.js';

const need=v=>{if(!v)throw new TypeError('Invalid fixed stored-topic validation');};
const sha=v=>createHash('sha256').update(v).digest('hex');
const HASH=/^[a-f0-9]{64}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const normalized=s=>s.normalize('NFKC').trim().toLowerCase();
export const STORED_VALIDATION_PROBES=Object.freeze([
 ['python','\\mpython\\M'],['linux','\\mlinux\\M'],['javascript','\\mjavascript\\M'],
 ['iphone','\\miphone\\M'],['android','\\mandroid\\M'],['tesla','\\mtesla\\M'],
 ['solar','\\m(solar|photovoltaik)\\M'],['heat-pump','\\m(heat pump|wärmepumpe|warmtepomp)\\M'],
 ['coffee','\\m(coffee|kaffee|koffie)\\M'],['pizza','\\mpizza\\M'],
 ['elephant','\\m(elephants?|elefant|olifant)\\M'],['dolphin','\\m(dolphins?|delfin|dolfijn)\\M'],
 ['battery','\\m(batter(y|ies)|batterie|accu)\\M'],['bitcoin','\\mbitcoin\\M'],
 ['football','\\m(football|fußball|voetbal)\\M'],['photography','\\m(photography|fotografie)\\M'],
].map(([id,pattern],ord)=>Object.freeze({id,pattern,ord})));

// Apply the current exact material joins BEFORE the per-probe limit. The earlier
// DEV screen limited historical title candidates before checking preparation.
// No body text is read; the two existing E5 arrays retain their binary64 hashes.
export const STORED_VALIDATION_SQL=`WITH probes AS (
 SELECT ord,id,pattern FROM jsonb_to_recordset($1::jsonb) AS p(ord integer,id text,pattern text)
), candidates AS (
 SELECT p.ord,p.id AS probe,q.* FROM probes p CROSS JOIN LATERAL (
  SELECT s.id AS "sourceId",s.title,s.url,s.ordinal,s.write_version::text AS "sourceVersion",
   s.operation_id AS "operationId",i.operation_digest AS "operationDigest",st.stamp AS "sourceStamp",
   i.supported_path AS "acceptedPath",i.body_wire_hash AS "bodyWireHash",i.title_wire_hash AS "titleWireHash",
   replace(encode(array_send(i.body_values),'base64'),E'\\n','') AS "bodyBase64",
   replace(encode(array_send(i.title_values),'base64'),E'\\n','') AS "titleBase64"
  FROM canonical_v4.sources s
  JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id
  JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id AND st.postable
  JOIN canonical_v4.semantic_installation h ON h.singleton
  JOIN canonical_v4.semantic_observations o ON o.source_id=s.id AND o.source_version=s.write_version
   AND o.matcher_hash=h.matcher_hash AND o.generation=$2 AND o.installation_revision=h.revision
   AND o.operation_id=s.operation_id AND o.operation_digest=r.operation_digest
  JOIN canonical_v4.semantic_inputs i ON i.source_id=o.source_id AND i.operation_digest=o.operation_digest AND i.matcher_hash=o.matcher_hash
  JOIN canonical_v4.embeddings e ON e.source_id=s.id AND e.model_id='e5-small-q8-browser-main-prefix-v1' AND e.dimensions=384
  WHERE s.provenance='owner-local-page-embedding/v1' AND s.has_embedding AND s.title ~* p.pattern AND i.semantic_eligible
   AND s.payload::jsonb->>'operationDigest'=r.operation_digest
   AND s.payload::jsonb->>'title'=s.title AND s.payload::jsonb->>'url'=s.url
   AND i.body_wire_hash=encode(sha256(array_send(e.values_double)),'hex')
   AND i.title_wire_hash=encode(sha256(array_send(i.title_values)),'hex')
  ORDER BY s.ordinal,s.id LIMIT 4
 ) q
), unique_sources AS (SELECT DISTINCT ON("sourceId") * FROM candidates ORDER BY "sourceId",ord)
SELECT * FROM unique_sources ORDER BY ord,ordinal,"sourceId" LIMIT 64`;

export function prepareStoredValidation({rows,inputDefinition,matcherHash}){
 need(Array.isArray(rows)&&rows.length<=64&&HASH.test(matcherHash)&&Buffer.byteLength(JSON.stringify(rows))<=1048576);
 const seen=new Set(),paired=compilePairedE5Input(inputDefinition),representationHash=describePairedE5Input(paired).representationHash;
 const observations=rows.map(r=>{
  need(r&&ID.test(r.sourceId)&&!seen.has(r.sourceId)&&STORED_VALIDATION_PROBES.some(p=>p.id===r.probe));seen.add(r.sourceId);
  need(typeof r.title==='string'&&r.title.length>0&&r.title.length<=200&&Array.isArray(r.acceptedPath));
  need(typeof r.sourceVersion==='string'&&/^[1-9][0-9]{0,18}$/u.test(r.sourceVersion)&&ID.test(r.operationId)&&HASH.test(r.operationDigest)&&HASH.test(r.sourceStamp));
  const url=new URL(r.url);need(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password);
  const decode=(wire,hash)=>{need(typeof wire==='string'&&wire.length<=8192&&HASH.test(hash)&&sha(Buffer.from(wire,'base64'))===hash);return decodeEmbeddingBase64Array(wire);};
  const inputHash=sha(JSON.stringify([r.sourceId,r.sourceVersion,r.operationId,r.operationDigest,r.sourceStamp]));
  const fused=applyPairedE5Input(paired,{sourceId:r.sourceId,sourceVersion:inputHash,bodyVector:decode(r.bodyBase64,r.bodyWireHash),titleVector:decode(r.titleBase64,r.titleWireHash)});need(fused.status==='available');
  return {sourceId:r.sourceId,inputHash,materialHash:sha(JSON.stringify([r.bodyWireHash,r.titleWireHash])),title:r.title,
   publisherKey:url.hostname.replace(/^www\./u,''),acceptedPath:r.acceptedPath,vector:fused.vector};
 });
 return {representationHash,matcherHash,minimumSimilarity:.8,observations};
}

export function evaluateStoredValidation({input,annotations,now=()=>performance.now()}){
 need(Array.isArray(input?.observations)&&input.observations.length<=64&&typeof now==='function');
 const raw=JSON.stringify(input),started=now(),output=proposeFocusedSubjects(raw),elapsedMs=now()-started;
 // Never send gold keys, labels, roots or paths to the proposal algorithm.
 need(Array.isArray(annotations)&&annotations.length===input.observations.length);
 const ids=new Set(input.observations.map(o=>o.sourceId)),gold=new Map();
 for(const a of annotations){
  need(a&&ids.has(a.sourceId)&&!gold.has(a.sourceId)&&Object.keys(a).sort().join(',')==='expectedRootId,sourceId,subjects');
  need(a.expectedRootId===null||typeof a.expectedRootId==='string'&&ID.test(a.expectedRootId));
  need(Array.isArray(a.subjects)&&a.subjects.length<=8);
  const keys=new Set();for(const s of a.subjects){
   need(s&&Object.keys(s).sort().join(',')==='key,labels'&&typeof s.key==='string'&&ID.test(s.key)&&!keys.has(s.key));keys.add(s.key);
   need(Array.isArray(s.labels)&&s.labels.length>0&&s.labels.length<=8&&s.labels.every(l=>typeof l==='string'&&l.trim()&&l.length<=80));
  }gold.set(a.sourceId,a);
 }
 const proposals=new Map(output.proposals.map(p=>[p.proposalKey,p])),selections=new Map(output.selections.map(s=>[s.sourceId,s]));
 const counts={total:ids.size,reviewed:0,unreviewed:0,assigned:0,correctLabel:0,wrongLabel:0,unreviewedAssigned:0,
  abstainedReviewed:0,moreSpecificSupportedButNotSelected:0,rootReviewed:0,rootCorrect:0,rootWrong:0,rootAbstained:0,
  pairedReviewed:0,correctMergedPairs:0,wrongMergedPairs:0,missedSameSubjectPairs:0,correctSeparatedPairs:0};
 const decisions=[];
 for(const o of input.observations){
  const a=gold.get(o.sourceId),s=selections.get(o.sourceId),p=proposals.get(s?.preferredProposalKey),reviewed=a.subjects.length>0;
  counts[reviewed?'reviewed':'unreviewed']++;if(p)counts.assigned++;
  const depth=label=>a.subjects.findLastIndex(v=>v.labels.some(l=>normalized(l)===normalized(label)));
  const selectedDepth=p?depth(p.label):-1;
  const supportedDepth=Math.max(-1,...(s?.supportedProposalKeys??[]).map(k=>proposals.has(k)?depth(proposals.get(k).label):-1));
  let status='unreviewed';
  if(!reviewed){if(p)counts.unreviewedAssigned++;}
  else if(!p){counts.abstainedReviewed++;status='abstained';}
  else if(selectedDepth<0){counts.wrongLabel++;status='wrong-label';}
  else{counts.correctLabel++;status='correct-label';if(supportedDepth>selectedDepth)counts.moreSpecificSupportedButNotSelected++;}
  if(a.expectedRootId!==null){counts.rootReviewed++;if(!o.acceptedPath.length)counts.rootAbstained++;else counts[o.acceptedPath[0]===a.expectedRootId?'rootCorrect':'rootWrong']++;}
  decisions.push({sourceId:o.sourceId,status,selectedProposalKey:p?.proposalKey??null,selectedDepth,supportedDepth});
 }
 const reviewed=input.observations.filter(o=>gold.get(o.sourceId).subjects.length>0);
 for(let i=0;i<reviewed.length;i++)for(let j=0;j<i;j++){
  const x=reviewed[i].sourceId,y=reviewed[j].sourceId,a=gold.get(x),b=gold.get(y),selectedX=selections.get(x)?.preferredProposalKey,selectedY=selections.get(y)?.preferredProposalKey;
  // Gold is subject identity, not event/date equality. Unassigned pairs stay
  // separated; two null selections must never count as a predicted merge.
  const same=a.subjects.some(s=>b.subjects.some(t=>t.key===s.key)),merged=selectedX!=null&&selectedX===selectedY;
  counts.pairedReviewed++;counts[merged?(same?'correctMergedPairs':'wrongMergedPairs'):(same?'missedSameSubjectPairs':'correctSeparatedPairs')]++;
 }
 return {schema:'stored-topic-prospective-validation/v1',algorithmOutput:output,counts,decisions,proposalElapsedMs:elapsedMs,
  scope:{newTopicsAfterPolicyFreeze:true,titleReviewedOnly:true,stratifiedStoredCohort:true,representativeWebPopulation:false,
   newEncoder:false,databaseWrites:false,publication:false,liveChanged:false,globalRetrievalRecall:false,endToEndLatency:false}};
}
