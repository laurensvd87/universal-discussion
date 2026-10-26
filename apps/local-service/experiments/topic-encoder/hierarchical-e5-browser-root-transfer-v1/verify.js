// Stored audit only. No encoder, model compiler or classifier import/call.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {record,dense,hash,digest,validateCandidateStructure} from '../../../../../spikes/topic-resolution/harness/browser-root-transfer-v1/manifest.js';
import {sha,makeEncodingPlan,validateAllEncodingMetadata,assessEvidenceLinkedOutcomes,parseBoundedJson,summarizeDecisionWork,captureAdmissionReceipt,validateCaptureAdmissionProof} from './contracts.js';
import {createFixedReadLedger,readReviewedEvaluationContext,admitCompletedCaptureMetadata,admitSavedCaptureAdmission,describeCaptureAdmission,describeCaptureAdmissionProof,
 admitCompletedEncodingMetadata,describeEncodingAdmission,readAdmittedInputPacket,readAdmittedVectorPackets,describeEncodingProofBuffers,INPUT_KEYS} from './manifest.js';
export function verifyStoredBundle(input){
 const a=record(input,['cases','completion','admissionProof','inputPacketBytes','encodingBatches','vectorPacketBytes','freezeHash','freezeFileSha256','sourceHashes','encoderHash','transferHash','resultBytes']);
 hash(a.freezeHash);hash(a.encoderHash);hash(a.transferHash);
 validateCaptureAdmissionProof({expectedReceipt:captureAdmissionReceipt({freezeHash:a.freezeHash,freezeFileSha256:a.freezeFileSha256,sourceHashes:a.sourceHashes,completion:a.completion}),
  ...record(a.admissionProof,['receiptBytes','supervisorBytes'])});
 const packets=dense(a.inputPacketBytes,8);assert.equal(packets.length,8);
 const plans=packets.map((inputPacketBytes,i)=>makeEncodingPlan({completion:a.completion,batch:i+1,inputPacketBytes}));
 const encoding=validateAllEncodingMetadata({freezeHash:a.freezeHash,freezeFileSha256:a.freezeFileSha256,sourceHashes:a.sourceHashes,encoderHash:a.encoderHash,plans,batches:a.encodingBatches});
 const result=record(parseBoundedJson(a.resultBytes,262144),['schema','freezeHash','captureCompletionHash','encodingCompletionHash','encoderHash','transferHash','transferIdentity','encoderCalls',
  'outcomes','assessment','work','timings','artifactReuseReceiptSha256','artifactReuseReceiptHash','oldSelectionReceiptSha256','reobservation','untouchedIndependentCohort','noOldInputSplice',
  'evaluatedProducers','unexercisedProducers','ordinaryDynamicBrowserProducerValidated','productionValidated','assignmentAuthority']);
 for(const [k,v]of Object.entries({schema:'browser-root-transfer-evaluation-result/v1',freezeHash:a.freezeHash,captureCompletionHash:digest(a.completion),encodingCompletionHash:digest(encoding),
  encoderHash:a.encoderHash,transferHash:a.transferHash,encoderCalls:encoding.encoderCalls,reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false}))assert.equal(result[k],v);
 assert.equal(a.completion.transferHash,a.transferHash);
 for(const k of ['artifactReuseReceiptSha256','artifactReuseReceiptHash','oldSelectionReceiptSha256'])assert.equal(result[k],a.completion[k]);
 assert.deepEqual(result.evaluatedProducers,['browser-current']);assert.deepEqual(result.unexercisedProducers,['current-static']);
 assert.equal(result.transferIdentity.transferHash,a.transferHash);
 const assessment=assessEvidenceLinkedOutcomes({cases:a.cases,plans,outcomes:result.outcomes,transferIdentity:result.transferIdentity,encodingCompletion:encoding,vectorPacketBytes:a.vectorPacketBytes});
 assert.deepEqual(result.assessment,assessment);assert.deepEqual(result.work,summarizeDecisionWork(result.outcomes));
 const timings=record(result.timings,['compileMs','classificationMs','totalChildMs','scope']);
 for(const k of ['compileMs','classificationMs','totalChildMs'])assert.ok(Number.isFinite(timings[k])&&timings[k]>=0&&timings[k]<=180000);
 assert.equal(timings.classificationMs,result.outcomes.reduce((n,r)=>n+(r.classificationMs??0),0));assert.equal(timings.scope,'classifier-wrapper-only-not-capture-E5-queue-or-DB');
 return Object.freeze({schema:'browser-root-transfer-evaluation-stored-audit/v1',checked:true,encoderCalls:encoding.encoderCalls,distinctArticleGroups:32,
  statisticalIndependenceClaim:false,classificationReexecuted:false,reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  evaluatedProducers:['browser-current'],staticAssessed:false,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export async function runVerifier(args){
 const items=dense(args,1);if(!items.length)return 'inert';assert.deepEqual(items,['--verify-stored']);
 const context=await readReviewedEvaluationContext(createFixedReadLedger()),candidate=parseBoundedJson(await context.ledger.read(INPUT_KEYS.candidate)),captureCases=validateCandidateStructure(candidate);
 const cases=candidate.cases.map(c=>({id:c.id,groupId:c.entityGroup,rootId:c.expectedRootId,language:c.language,host:new URL(c.publicUrl).hostname}));
 const metadata=await admitCompletedCaptureMetadata(context,captureCases),captureHandle=await admitSavedCaptureAdmission(context,metadata),encodingHandle=await admitCompletedEncodingMetadata(context,captureHandle);
 const completion=describeCaptureAdmission(captureHandle),{encoding}=describeEncodingAdmission(encodingHandle),vectorPacketBytes=await readAdmittedVectorPackets(encodingHandle),inputPacketBytes=[];
 for(let batch=1;batch<=8;batch++)inputPacketBytes.push(await readAdmittedInputPacket(captureHandle,batch));
 const base='apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/output-evaluation/';
 const resultBytes=await context.ledger.read(base+'result.json',262144),supervisor=parseBoundedJson(await context.ledger.read(base+'supervisor.json',65536));
 for(const [k,v]of Object.entries({schema:'browser-root-transfer-evaluation-supervisor/v1',phase:'evaluate',batch:null,reason:null,exitCode:0,cleanupReason:null,emergencyOwnJobTermination:false,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:context.freezeSha256,resultSha256:sha(resultBytes),jobMemoryLimitBytes:1536*1048576}))assert.equal(supervisor[k],v);
 assert.deepEqual(supervisor.sourceHashes,context.sources);assert.ok(Number.isFinite(supervisor.elapsedSeconds)&&supervisor.elapsedSeconds>=0&&supervisor.elapsedSeconds<=180);
 for(const k of ['sampledPeakTreeRssBytes','sampledPeakTreePrivateBytes'])assert.ok(Number.isSafeInteger(supervisor[k])&&supervisor[k]>=0&&supervisor[k]<=1536*1048576);
 const result=verifyStoredBundle({cases,completion,admissionProof:describeCaptureAdmissionProof(captureHandle),inputPacketBytes,encodingBatches:describeEncodingProofBuffers(encodingHandle),vectorPacketBytes,
  freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeSha256,sourceHashes:context.sources,encoderHash:encoding.encoderHash,transferHash:context.reuse.transferHash,resultBytes});
 await context.ledger.recheck();console.log(JSON.stringify(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await runVerifier(process.argv.slice(2));}catch{console.error('browser-evaluation-verifier-not-enabled');process.exitCode=1;}
}
