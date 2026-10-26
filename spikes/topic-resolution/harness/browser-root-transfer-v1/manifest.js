// ADR148 pure metadata/paired-envelope contracts. No IO, models or browser.
export { BATCHES,CANDIDATE_SHA256,validateCandidateStructure,fixedBatch,validateProducerProfile,ROOT_IDS } from '../current-producer-final-v2/manifest.js';
import { BATCHES,record,dense,bounded,hash,freeze,digest,sha,validateProducerProfile } from '../current-producer-final-v2/manifest.js';
import {types} from 'node:util';
export { record,dense,bounded,hash,freeze,digest,sha };
export const LABEL_SEAL_SHA256='a138f586f3590bf4b3c3158a2902d4187967f40de38703a981eae72335db8101';
const invalid=()=>{throw new TypeError('Invalid browser root transfer envelope');};
function field(v,k){if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)invalid();const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;}
function hashes(v){if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)invalid();const keys=Reflect.ownKeys(v);if(!keys.length||keys.length>256||keys.some(k=>typeof k!=='string'||k.length>512))invalid();const out=record(v,keys);for(const h of Object.values(out))hash(h);return out;}
function outcome(value){
 const status=field(value,'status');
 if(status==='collected'){
  const a=record(value,['id','status','reason','capture','documentWitness','responseWitness','pagePolicyHash','sourceInputHash']);
  a.capture=record(a.capture,['titleCharacters','titleSha256','bodyCharacters','bodySha256','extractorVersion']);
  a.documentWitness=validateFullDocumentWitness(a.documentWitness);a.responseWitness=record(a.responseWitness,Object.keys(a.documentWitness.response));
  if(JSON.stringify(a.responseWitness)!==JSON.stringify(a.documentWitness.response)||a.pagePolicyHash!==digest({schema:'browser-root-page-policy/v1',responseWitnessHash:a.documentWitness.responseWitnessHash,domWitnessHash:a.documentWitness.domWitnessHash}))invalid();
  return a;
 }
 if(status!=='unavailable')invalid();const keys=Object.getOwnPropertyDescriptor(value,'readerReason')?['id','status','reason','readerReason']:['id','status','reason'];return record(value,keys);
}
export function deriveDocumentIdentity(value){
 const a=record(value,['id','batch','freezeHash','frameId','loaderId']);hash(a.freezeHash);bounded(a.frameId,160);bounded(a.loaderId,160);
 if(!Number.isInteger(a.batch)||a.batch<1||a.batch>8||!BATCHES[a.batch-1].includes(a.id))invalid();
 const sourceVersion=a.freezeHash+'|browser-only|'+a.batch,navigationId='browser-root-'+a.batch+'-'+a.id;
 const sourceIncarnation=digest({schema:'browser-root-document-incarnation/v1',id:a.id,batch:a.batch,sourceVersion,frameId:a.frameId,loaderId:a.loaderId,navigationId});
 return freeze({sourceVersion,navigationId,sourceIncarnation});
}
export function validateFullDocumentWitness(value){
 const d=record(value,['schema','finalUrlHash','frameId','loaderId','navigationId','documentId','response','dom','responseWitnessHash','domWitnessHash','networkRequestIdCorrelated','nativeAttestation']);
 if(d.schema!=='playwright-owned-document/v1'||d.networkRequestIdCorrelated!==false||d.nativeAttestation!==false)invalid();
 for(const k of ['finalUrlHash','responseWitnessHash','domWitnessHash'])hash(d[k]);for(const k of ['frameId','loaderId','navigationId','documentId'])bounded(d[k],160);
 const response=record(d.response,['status','frameId','loaderId','exactFinalUrl','observedRemoteAddressPublic','ordinaryTlsSecure','requestIdentityScope','networkRequestIdCorrelated','nofollow','tdmReservation','headersSha256']);
 if(!Number.isInteger(response.status)||response.status<200||response.status>=300||response.frameId!==d.frameId||response.loaderId!==d.loaderId||
  response.exactFinalUrl!==true||response.observedRemoteAddressPublic!==true||response.ordinaryTlsSecure!==true||response.requestIdentityScope!=='same-playwright-request-object/v1'||
  response.networkRequestIdCorrelated!==false||typeof response.nofollow!=='boolean'||![null,0].includes(response.tdmReservation))invalid();hash(response.headersSha256);
 const dom=record(d.dom,['frameId','loaderId','navigationId','exactDocumentUrl','canonicalUrlSha256','canonicalEqualsExpected','domDirectivesChecked']);
 if(dom.frameId!==d.frameId||dom.loaderId!==d.loaderId||dom.navigationId!==d.navigationId||dom.exactDocumentUrl!==true||dom.domDirectivesChecked!==true||typeof dom.canonicalEqualsExpected!=='boolean')invalid();
 if(dom.canonicalUrlSha256!==null)hash(dom.canonicalUrlSha256);if(dom.canonicalEqualsExpected&&dom.canonicalUrlSha256!==d.finalUrlHash)invalid();
 if(digest(response)!==d.responseWitnessHash||digest(dom)!==d.domWitnessHash)invalid();return freeze({...d,response,dom});
}
const RAW=['id','groupId','url','sourceVersion','sourceIncarnation','title','body','extractorVersion','documentWitness','originPolicyHash','pagePolicyHash'];
export function inputEnvelope(value,producerProfile){
 const r=record(value,RAW),p=validateProducerProfile(producerProfile);if(p.producerId!=='browser-current')invalid();
 for(const k of ['id','groupId','sourceVersion','sourceIncarnation'])bounded(r[k],160);bounded(r.url,2048);bounded(r.title,200,false);bounded(r.body,4096);
 if(!r.body.trim()||!p.extractorVersions.includes(r.extractorVersion))invalid();hash(r.originPolicyHash);hash(r.pagePolicyHash);
 const d=validateFullDocumentWitness(r.documentWitness);if(d.finalUrlHash!==sha(r.url)||d.documentId!==r.sourceIncarnation||
  r.pagePolicyHash!==digest({schema:'browser-root-page-policy/v1',responseWitnessHash:d.responseWitnessHash,domWitnessHash:d.domWitnessHash}))invalid();
 const version=/^([a-f0-9]{64})\|browser-only\|([1-8])$/u.exec(r.sourceVersion);if(!version)invalid();
 const identity=deriveDocumentIdentity({id:r.id,batch:Number(version[2]),freezeHash:version[1],frameId:d.frameId,loaderId:d.loaderId});
 if(identity.sourceIncarnation!==r.sourceIncarnation||identity.navigationId!==d.navigationId)invalid();
 const envelope=freeze({schema:'playwright-browser-root-input-envelope/v1',id:r.id,groupId:r.groupId,urlHash:sha(r.url),sourceVersion:r.sourceVersion,
  sourceIncarnation:r.sourceIncarnation,producerProfileHash:p.producerProfileHash,inputConstructionHash:p.inputConstructionHash,
  titleSha256:sha(r.title),bodySha256:sha(r.body),extractorVersion:r.extractorVersion,documentWitness:d,originPolicyHash:r.originPolicyHash,pagePolicyHash:r.pagePolicyHash});
 const envelopeHash=digest(envelope),sourceInputHash=digest({schema:'browser-root-transfer-input/v1',envelopeHash});
 return freeze({envelope,envelopeHash,sourceInputHash});
}
const HEADER=['schema','phase','batch','freezeHash','freezeSha256','candidateSha256','labelSealSha256','artifactReuseReceiptSha256','producerProfile','rows'];
export function buildInputPacket(value){
 const a=record(value,HEADER.filter(k=>k!=='schema'));if(a.phase!=='browser-only'||!Number.isInteger(a.batch)||a.batch<1||a.batch>8)invalid();
 for(const k of ['freezeHash','freezeSha256','candidateSha256','labelSealSha256','artifactReuseReceiptSha256'])hash(a[k]);const p=validateProducerProfile(a.producerProfile);if(p.producerId!=='browser-current')invalid();
 let prior=-1;const rows=dense(a.rows,4).map(raw=>{
  const r=record(raw,RAW),index=BATCHES[a.batch-1].indexOf(r.id);if(index<=prior)invalid();prior=index;
  const e=inputEnvelope(r,p);return freeze({...r,documentWitness:e.envelope.documentWitness,titleSha256:e.envelope.titleSha256,bodySha256:e.envelope.bodySha256,
   envelopeHash:e.envelopeHash,sourceInputHash:e.sourceInputHash});
 });const packet=freeze({schema:'browser-root-transfer-input-packet/v1',...a,producerProfile:p,rows});
 if(Buffer.byteLength(JSON.stringify(packet))>128*1024)invalid();return packet;
}
export function validateInputPacket(value,context){
 const a=record(value,HEADER),c=record(context,[...HEADER.filter(k=>!['schema','rows'].includes(k)),'cases','collectedIds','outcomes']);
 if(a.schema!=='browser-root-transfer-input-packet/v1')invalid();
 for(const k of HEADER.filter(k=>!['schema','rows','producerProfile'].includes(k)))if(a[k]!==c[k])invalid();
 if(JSON.stringify(validateProducerProfile(a.producerProfile))!==JSON.stringify(validateProducerProfile(c.producerProfile)))invalid();
 const cases=dense(c.cases,4).map(x=>record(x,['id','groupId','url','language']));if(JSON.stringify(cases.map(x=>x.id))!==JSON.stringify(BATCHES[a.batch-1]))invalid();
 const outcomes=dense(c.outcomes,4).map(outcome);if(JSON.stringify(outcomes.map(x=>x.id))!==JSON.stringify(BATCHES[a.batch-1])||JSON.stringify(outcomes.filter(x=>x.status==='collected').map(x=>x.id))!==JSON.stringify(dense(c.collectedIds,4)))invalid();
 const rows=dense(a.rows,4).map(raw=>{
  const r=record(raw,[...RAW,'titleSha256','bodySha256','envelopeHash','sourceInputHash']),expected=cases.find(x=>x.id===r.id);
  if(!expected||expected.url!==r.url||expected.groupId!==r.groupId)invalid();
  const {titleSha256,bodySha256,envelopeHash,sourceInputHash,...base}=r,e=inputEnvelope(base,a.producerProfile);
  if(titleSha256!==e.envelope.titleSha256||bodySha256!==e.envelope.bodySha256||envelopeHash!==e.envelopeHash||sourceInputHash!==e.sourceInputHash||r.sourceVersion!==a.freezeHash+'|browser-only|'+a.batch)invalid();
  const outcome=outcomes.find(x=>x.id===r.id);if(outcome.status!=='collected'||outcome.sourceInputHash!==sourceInputHash||
   outcome.capture.titleSha256!==titleSha256||outcome.capture.bodySha256!==bodySha256||outcome.capture.titleCharacters!==r.title.length||outcome.capture.bodyCharacters!==r.body.length||
   outcome.capture.extractorVersion!==r.extractorVersion||JSON.stringify(validateFullDocumentWitness(outcome.documentWitness))!==JSON.stringify(e.envelope.documentWitness))invalid();return base;
 });if(JSON.stringify(rows.map(x=>x.id))!==JSON.stringify(dense(c.collectedIds,4)))invalid();
 const {schema,...base}=a;return buildInputPacket({...base,rows});
}
/** Validate full envelope before returning ONLY the old scorer's declared DTO.
 * No vectors, classification or claim of native/CDP NetworkID authority. */
export function projectScorerInputWitness(row,profile){
 const r=record(row,[...RAW,'titleSha256','bodySha256','envelopeHash','sourceInputHash']);
 const {titleSha256,bodySha256,envelopeHash,sourceInputHash,...base}=r,e=inputEnvelope(base,profile);
 if(titleSha256!==e.envelope.titleSha256||bodySha256!==e.envelope.bodySha256||envelopeHash!==e.envelopeHash||sourceInputHash!==e.sourceInputHash)invalid();
 const p=validateProducerProfile(profile),d=e.envelope.documentWitness;
 return freeze({sourceId:r.id,sourceVersion:r.sourceVersion,sourceIncarnation:r.sourceIncarnation,producerId:p.producerId,producerProfileHash:p.producerProfileHash,
  inputConstructionHash:p.inputConstructionHash,extractorVersion:r.extractorVersion,inputHash:sourceInputHash,
  documentWitness:{kind:'browser-document',finalUrlHash:d.finalUrlHash,frameId:d.frameId,loaderId:d.loaderId,navigationId:d.navigationId,documentId:d.documentId}});
}
export function validatePriorBatch(value){
 const a=record(value,['batch','freezeHash','freezeSha256','sourceHashes','result','supervisor','packetSha256','resultSha256']);
 if(!Number.isInteger(a.batch)||a.batch<1||a.batch>8)invalid();const r=a.result,s=a.supervisor;
 for(const k of ['freezeHash','freezeSha256','packetSha256','resultSha256'])hash(a[k]);
 for(const [k,v]of Object.entries({schema:'browser-root-transfer-result/v1',phase:'browser-only',batch:a.batch,status:'complete',denominator:4,fullProducerDenominator:32,
  freezeHash:a.freezeHash,freezeSha256:a.freezeSha256,packetSha256:a.packetSha256,sourceHashesRechecked:true,protocolCallbacksDrained:true}))if(field(r,k)!==v)invalid();
 const supervisor=record(s,['schema','phase','batch','denominator','fullProducerDenominator','reason','freezeSha256','childPid','exitCode','sourceHashes','elapsedSeconds',
  'sampledPeakTreeRssBytes','sampledPeakTreePrivateBytes','sampledPeakTreeProcesses','jobMemoryLimitBytes','ownTreeCleanupConfirmed','cleanupReason','emergencyOwnJobTermination',
  'sampledPeakOwnedOutputBytes','sampledPeakOwnedOutputEntries','ownedOutputByteLimit','ownedOutputEntryLimit','sourceHashesRechecked','noNativeAttestation','noModelCalls',
  'productionValidated','purpose','resultSha256','packetSha256']);
 for(const [k,v]of Object.entries({schema:'browser-root-transfer-supervisor/v1',phase:'browser-only',batch:a.batch,denominator:4,fullProducerDenominator:32,reason:null,exitCode:0,cleanupReason:null,
  emergencyOwnJobTermination:false,ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:a.freezeSha256,resultSha256:a.resultSha256,packetSha256:a.packetSha256,
  jobMemoryLimitBytes:1536*1048576,ownedOutputByteLimit:512*1048576,ownedOutputEntryLimit:8192,noNativeAttestation:true,noModelCalls:true,productionValidated:false,
  purpose:'ADR148-browser-root-only-reobservation-not-independent-cohort'}))if(supervisor[k]!==v)invalid();
 for(const [k,max]of Object.entries({elapsedSeconds:180,sampledPeakTreeRssBytes:1536*1048576,sampledPeakTreePrivateBytes:1536*1048576,
  sampledPeakTreeProcesses:128,sampledPeakOwnedOutputBytes:512*1048576,sampledPeakOwnedOutputEntries:8192})){
  const n=supervisor[k];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>max||k!=='elapsedSeconds'&&!Number.isSafeInteger(n))invalid();
 }
 if(!Number.isInteger(supervisor.childPid)||supervisor.childPid<1||supervisor.childPid>4294967295)invalid();
 if(JSON.stringify(hashes(field(r,'sourceHashes')))!==JSON.stringify(hashes(a.sourceHashes))||JSON.stringify(hashes(field(s,'sourceHashes')))!==JSON.stringify(hashes(a.sourceHashes)))invalid();
 const cases=dense(field(r,'cases'),4);if(JSON.stringify(cases.map(x=>field(x,'id')))!==JSON.stringify(BATCHES[a.batch-1])||cases.some(x=>!['collected','unavailable'].includes(field(x,'status'))))invalid();return true;
}
