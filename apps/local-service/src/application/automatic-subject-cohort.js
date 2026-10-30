// Pure bounded candidate verification and exact binary64 re-ranking. Retrieval
// supplies approximate neighbours, not topic/identity/canonical route authority.
import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../domain/hierarchical-e5-paired-input.js';
import {readLearnedUrl} from '../domain/learned-sources.js';
import {decodeEmbeddingBase64Array} from '../../portable/canonical-v4/embedding-binary-wire.js';
import {GENERAL_SUBJECT_POLICY_V2_HASH,GENERAL_SUBJECT_POLICY_V3_HASH} from './automatic-named-subject-plan.js';
const LIMITS=Object.freeze({rawCandidates:128,cohort:64,lexicalReserve:16,titleTerms:8,minimumSimilarity:.8,inputBytes:4194304});
export const AUTOMATIC_COHORT_LIMITS=LIMITS;
const bad=()=>{throw new TypeError('Invalid automatic subject neighbourhood');};
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sha=x=>createHash('sha256').update(x).digest('hex');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const counter=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const order=(a,b)=>a<b?-1:a>b?1:0;
const rowKeys=['sourceId','sourceVersion','ordinal','operationId','operationDigest','sourceStamp','url','title','bodyWireHash','titleWireHash','bodyBase64','titleBase64','supportedPath','lexical'];
const stop=new Set('a an and as at by for from in into is it of on or that the this to with de den der des die ein eine en een het met op te van voor und von zu zum zur how what why when where who learn fix repair help guide guides official site website youtube new yourself wie was warum wann wo wer hilfe reparatur anleitung offiziell hoe wat waarom wanneer waar handleiding hulp'.split(' '));
const segmenter=new Intl.Segmenter('und',{granularity:'word'});

export function automaticSubjectTitleTerms(title){
 if(arguments.length!==1||typeof title!=='string'||!title.isWellFormed()||title.length>200||/[\u0000-\u001f\u007f]/u.test(title))bad();
 const normalized=title.normalize('NFKC');if(normalized.length>512)return Object.freeze([]);
 const terms=[];let scanned=0;
 for(const part of segmenter.segment(normalized))if(part.isWordLike){
  if(++scanned>64)break;const key=part.segment.toLowerCase();
  if(key.length<3||key.length>80||!/[\p{L}]/u.test(key)||!/^\p{L}[\p{L}\p{M}\p{N}]*$/u.test(key)||stop.has(key)||terms.includes(key))continue;
  terms.push(key);if(terms.length===LIMITS.titleTerms)break;
 }
 return Object.freeze(terms);
}

function vector(base64,expected){
 const values=decodeEmbeddingBase64Array(base64);
 if(values.length!==384||Math.abs(Math.hypot(...values)-1)>1e-5||sha(Buffer.from(base64,'base64'))!==expected)bad();return values;
}

export function buildAutomaticSubjectCohort(rawJson){
 if(arguments.length!==1)bad();return build(rawJson,GENERAL_SUBJECT_POLICY_V2_HASH);
}
export function buildAutomaticSubjectCohortV3(rawJson){
 if(arguments.length!==1)bad();return build(rawJson,GENERAL_SUBJECT_POLICY_V3_HASH);
}
function build(rawJson,policyHash){
 if(typeof rawJson!=='string'||Buffer.byteLength(rawJson)>LIMITS.inputBytes)bad();let a;
 try{a=JSON.parse(rawJson);}catch{bad();}
 if(!shape(a,['generation','matcherHash','representationHash','inputDefinition','seedSourceId','rows'])||!id(a.generation)||!hash(a.matcherHash)||
    !hash(a.representationHash)||!id(a.seedSourceId)||!Array.isArray(a.rows)||a.rows.length>LIMITS.rawCandidates)bad();
 const paired=compilePairedE5Input(a.inputDefinition);if(describePairedE5Input(paired).representationHash!==a.representationHash)bad();
 const rows=[],seen=new Set();
 for(const r of a.rows){
  if(!shape(r,rowKeys)||!id(r.sourceId)||seen.has(r.sourceId)||!counter(r.sourceVersion)||!counter(r.ordinal)||!id(r.operationId)||
     !hash(r.operationDigest)||!hash(r.sourceStamp)||!hash(r.bodyWireHash)||!hash(r.titleWireHash)||typeof r.lexical!=='boolean'||
     typeof r.title!=='string'||!r.title.isWellFormed()||!r.title.trim()||r.title.length>200||/[\u0000-\u001f\u007f]/u.test(r.title)||
     !Array.isArray(r.supportedPath)||r.supportedPath.length>8||r.supportedPath.some(v=>!id(v))||new Set(r.supportedPath).size!==r.supportedPath.length)bad();
  const url=readLearnedUrl(r.url);if(url!==r.url)bad();seen.add(r.sourceId);
  const witness={sourceId:r.sourceId,sourceVersion:r.sourceVersion,operationId:r.operationId,operationDigest:r.operationDigest,sourceStamp:r.sourceStamp},
   inputHash=sha(JSON.stringify(Object.values(witness))),body=vector(r.bodyBase64,r.bodyWireHash),title=vector(r.titleBase64,r.titleWireHash),
   output=applyPairedE5Input(paired,{sourceId:r.sourceId,sourceVersion:inputHash,bodyVector:body,titleVector:title});
  if(output.status!=='available')bad();
  rows.push({witness,lexical:r.lexical,observation:{sourceId:r.sourceId,inputHash,materialHash:sha(JSON.stringify([r.bodyWireHash,r.titleWireHash])),
   title:r.title,publisherKey:new URL(url).hostname.replace(/^www\./u,''),acceptedPath:r.supportedPath,vector:output.vector}});
 }
 const seed=rows.find(r=>r.witness.sourceId===a.seedSourceId);if(!seed)bad();
 for(const row of rows){row.score=0;for(let i=0;i<384;i++)row.score+=seed.observation.vector[i]*row.observation.vector[i];}
 const ranked=rows.filter(r=>r!==seed&&r.score>=LIMITS.minimumSimilarity)
  .sort((x,y)=>y.score-x.score||order(x.witness.sourceId,y.witness.sourceId));
 const selected=[seed],selectedIds=new Set([seed.witness.sourceId]);
 for(const row of ranked.filter(r=>r.lexical).slice(0,LIMITS.lexicalReserve)){selected.push(row);selectedIds.add(row.witness.sourceId);}
 for(const row of ranked)if(!selectedIds.has(row.witness.sourceId)&&selected.length<LIMITS.cohort){selected.push(row);selectedIds.add(row.witness.sourceId);}
 selected.sort((x,y)=>order(x.witness.sourceId,y.witness.sourceId));
 return freeze({schema:'automatic-subject-cohort/v1',input:{generation:a.generation,policyHash,representationHash:a.representationHash,matcherHash:a.matcherHash,
   minimumSimilarity:LIMITS.minimumSimilarity,observations:selected.map(r=>r.observation),sourceWitnesses:selected.map(r=>r.witness),candidates:[]},
  seedWitness:seed.witness,work:{retrieved:rows.length,selected:selected.length,coordinateProducts:rows.length*384,lexicalSelected:selected.filter(r=>r!==seed&&r.lexical).length},
  approximateRetrieval:true,globalRecallProven:false,assignmentAuthority:false,registryChanged:false});
}
