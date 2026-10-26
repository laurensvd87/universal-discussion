// Stored audit only: does not import an encoder, model compiler or classifier.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {record,dense,hash,digest} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js';
import {makeEncodingPlan,validateAllEncodingMetadata,assessEvidenceLinkedOutcomes,parseBoundedJson,summarizeDecisionWork} from './contracts.js';
import {parseVectorPacket} from './vector-packet.js';
import {createFixedReadLedger,readReviewedEvaluationContext,admitCompletedCaptureMetadata,describeCaptureAdmission,admitCompletedEncodingMetadata,
 describeEncodingAdmission,readAdmittedPairedPackets,readAdmittedVectorPackets,describeEncodingProofBuffers,INPUT_KEYS} from './manifest.js';
import {validateCandidateStructure} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js';
export function verifyStoredBundle(input){
 const a=record(input,['cases','completion','pairedPacketBytes','encodingBatches','vectorPacketBytes','freezeHash','freezeFileSha256','sourceHashes','encoderHash','transferHash','resultBytes']);
 hash(a.freezeHash);hash(a.encoderHash);hash(a.transferHash);
 const paired=dense(a.pairedPacketBytes,8),plans=paired.map((p,i)=>{
  const b=record(p,['staticPacketBytes','browserPacketBytes']);return makeEncodingPlan({completion:a.completion,batch:i+1,...b});
 });
 assert.equal(plans.length,8);
 const encoding=validateAllEncodingMetadata({freezeHash:a.freezeHash,freezeFileSha256:a.freezeFileSha256,sourceHashes:a.sourceHashes,encoderHash:a.encoderHash,plans,batches:a.encodingBatches});
 const vectorBytes=dense(a.vectorPacketBytes,8);assert.equal(vectorBytes.length,8);const vectors=[];
 vectorBytes.forEach((bytes,i)=>{
  const p=parseVectorPacket(bytes);assert.equal(p.freezeHash,a.freezeHash);assert.equal(p.encoderHash,a.encoderHash);assert.equal(p.batch,i+1);
  assert.equal(encoding.receipts[i].vectorPacketSha256,digestBytes(bytes));assert.deepEqual(p.inputPacketHashes,plans[i].inputPacketHashes);
  const expected=plans[i].rows.filter(r=>r.encodingAvailable);assert.equal(p.rows.length,expected.length);
  p.rows.forEach((r,j)=>{for(const k of ['id','producerId','sourceInputHash','bodySha256','titleSha256'])assert.equal(r[k],expected[j][k]);vectors.push(r);});
 });
 const result=record(parseBoundedJson(a.resultBytes,262144),['schema','freezeHash','captureCompletionHash','encodingCompletionHash','encoderHash',
  'transferHash','transferIdentity','encoderCalls','outcomes','assessment','work','timings','ordinaryDynamicBrowserProducerValidated','productionValidated','assignmentAuthority']);
 assert.equal(result.schema,'current-producer-transfer-root-evaluation/v1');assert.equal(result.freezeHash,a.freezeHash);
 assert.equal(result.captureCompletionHash,digest(a.completion));assert.equal(result.encodingCompletionHash,digest(encoding));assert.equal(result.encoderHash,a.encoderHash);
 assert.equal(result.transferHash,a.transferHash);assert.equal(result.encoderCalls,encoding.encoderCalls);
 const {transferHash,...identity}=result.transferIdentity;assert.equal(transferHash,a.transferHash);assert.equal(digest(identity),transferHash);
 assert.equal(result.ordinaryDynamicBrowserProducerValidated,false);assert.equal(result.productionValidated,false);assert.equal(result.assignmentAuthority,false);
 const outcomes=dense(result.outcomes,64),byVector=new Map(vectors.map(v=>[v.id+'|'+v.producerId,v]));
 for(const r of outcomes)if(r.inputAvailable){
  const v=byVector.get(r.id+'|'+r.producerId);assert.ok(v);const d=r.decision;
  assert.equal(d.transferHash,a.transferHash);
  assert.deepEqual(d.vectorBindings,{encoding:'ieee754-binary64-little-endian/384/v1',bodyVectorHash:v.bodyVectorHash,titleVectorHash:v.titleVectorHash});
  assert.equal(d.semanticWitnessHash,digest({schema:'builder-scoped-root-rank-semantic-witness/v1',transferHash:a.transferHash,witness:d.witness,vectorBindings:d.vectorBindings}));
  const phase=r.producerId==='current-static'?'static':'browser',index=Number(r.id.slice(-3))-1,batch=Math.floor(index/4)+1;
  const profile=a.completion.batches[(phase==='static'?0:8)+batch-1].producerProfile;
  assert.equal(d.witness.producerProfileHash,profile.producerProfileHash);assert.equal(d.witness.inputConstructionHash,profile.inputConstructionHash);
  assert.ok(profile.extractorVersions.includes(d.witness.extractorVersion));
 }
 const recomputed=assessEvidenceLinkedOutcomes({cases:a.cases,plans,outcomes});
 assert.deepEqual(result.work,summarizeDecisionWork(outcomes));
 const timings=record(result.timings,['compileMs','classificationMs','totalChildMs','scope']);
 for(const key of ['compileMs','classificationMs','totalChildMs'])assert.ok(Number.isFinite(timings[key])&&timings[key]>=0&&timings[key]<=180000);
 assert.equal(timings.classificationMs,outcomes.reduce((n,r)=>n+(r.classificationMs??0),0));
 assert.equal(timings.scope,'classifier-wrapper-only-not-capture-E5-queue-or-DB');
 assert.deepEqual(result.assessment,recomputed);return Object.freeze({schema:'current-producer-transfer-stored-audit/v1',checked:true,
  encoderCalls:encoding.encoderCalls,distinctArticleGroups:32,statisticalIndependenceClaim:false,classificationReexecuted:false,
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
// Reuse the exact byte digest, never JSON serialization of vector coordinates.
import {sha as digestBytes} from './contracts.js';
export async function runVerifier(args){
 assert.ok(Array.isArray(args));if(args.length===0)return 'inert';
 assert.deepEqual(args,['--verify-stored']);
 const context=await readReviewedEvaluationContext(createFixedReadLedger());
 const candidate=parseBoundedJson(await context.ledger.read(INPUT_KEYS.candidate)),captureCases=validateCandidateStructure(candidate);
 const cases=candidate.cases.map(c=>({id:c.id,groupId:c.entityGroup,rootId:c.expectedRootId,language:c.language,host:new URL(c.publicUrl).hostname}));
 const captureHandle=await admitCompletedCaptureMetadata(context,captureCases),encodingHandle=await admitCompletedEncodingMetadata(context,captureHandle);
 const completion=describeCaptureAdmission(captureHandle),{encoding}=describeEncodingAdmission(encodingHandle),vectorPacketBytes=await readAdmittedVectorPackets(encodingHandle),pairedPacketBytes=[];
 for(let batch=1;batch<=8;batch++)pairedPacketBytes.push(await readAdmittedPairedPackets(captureHandle,batch));
 const base='apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/output-evaluation/';
 const resultBytes=await context.ledger.read(base+'result.json',262144),supervisor=parseBoundedJson(await context.ledger.read(base+'supervisor.json',65536));
 for(const [key,value]of Object.entries({schema:'current-producer-transfer-evaluation-supervisor/v1',phase:'evaluate',batch:null,reason:null,exitCode:0,
  cleanupReason:null,ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:context.freezeSha256,resultSha256:digestBytes(resultBytes),
  jobMemoryLimitBytes:1536*1048576}))assert.equal(supervisor[key],value);
 assert.deepEqual(supervisor.sourceHashes,context.sources);assert.ok(supervisor.elapsedSeconds<=180);
 const result=verifyStoredBundle({cases,completion,pairedPacketBytes,encodingBatches:describeEncodingProofBuffers(encodingHandle),vectorPacketBytes,
  freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeSha256,sourceHashes:context.sources,encoderHash:encoding.encoderHash,
  transferHash:context.fit.selection.transferHash,resultBytes});
 await context.ledger.recheck();console.log(JSON.stringify(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await runVerifier(process.argv.slice(2));}catch{console.error('evaluation-verifier-not-enabled');process.exitCode=1;}
}
