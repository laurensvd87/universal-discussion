// Closed, pure saved-TRAIN admission. No IO, model, capture or import-time action.
import {types} from 'node:util';
import {record,dense,dataCopy,freeze,digest,sha,hash,requireTrue,validateSpecificityBatch} from './manifest.js';
import {createTrainReferenceCodec} from './reference-codec.js';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {compileNativeRootLocalDetailTransfer,describeNativeRootLocalDetailTransfer} from '../../../../../apps/local-service/src/domain/experimental/native-root-local-detail-transfer-v1/adapter.js';
import {assessCompleteHierarchyPredictions} from '../../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-complete-path-assessment-v1/assessment.js';

export const TEST_ADMISSION_LIMITS=Object.freeze({auditBytes:65536,trainFileBytes:524288,depth:24,values:200000,array:1024,properties:128,string:524288});
const yes=requireTrue,eq=(a,b)=>yes(JSON.stringify(a)===JSON.stringify(b));
const INT=(v,max=Number.MAX_SAFE_INTEGER)=>yes(Number.isSafeInteger(v)&&v>=0&&v<=max&&!Object.is(v,-0));
const number=v=>yes(typeof v==='number'&&Number.isFinite(v)&&v>=0);
const falseFlags=v=>{yes(v.productionValidated===false&&v.assignmentAuthority===false);};
const copy=v=>dataCopy(v,{values:200000,units:2097152,depth:24,array:1024,properties:128,string:524288});
const NativePromise=Promise,originalThen=Promise.prototype.then;
function safePromise(v){return !types.isProxy(v)&&types.isPromise(v)&&Object.getPrototypeOf(v)===NativePromise.prototype&&Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});}
function sync(v){if(v!==null&&(typeof v==='object'||typeof v==='function')){if(safePromise(v))Reflect.apply(originalThen,v,[()=>{},()=>{}]);yes(false);}return v;}
function file(v,max){
 yes(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Buffer.prototype&&Buffer.isBuffer(v));
 const size=Reflect.apply(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength').get,v,[]);yes(size>0&&size<=max);
 const out=Buffer.alloc(size);Reflect.apply(Uint8Array.prototype.set,out,[v]);return out;
}
/** Strict JSON, including decoded duplicate keys. Checks precede container growth.
 * Unlike a stringify-byte check this permits Python's finite numeric spellings. */
function parse(bytes){
 const s=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let i=0,values=0;
 const ws=()=>{while(i<s.length&&/[\x20\t\r\n]/u.test(s[i]))i++;};
 function string(){yes(s[i++]==='"');let out='';while(i<s.length){const ch=s[i++];if(ch==='"'){yes(out.isWellFormed());return out;}
  yes(ch.charCodeAt(0)>=32);if(ch==='\\'){yes(i<s.length);const e=s[i++],esc={'"':'"','\\':'\\','/':'/',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t'};
   if(e==='u'){const h=s.slice(i,i+4);yes(/^[a-fA-F0-9]{4}$/u.test(h));out+=String.fromCharCode(parseInt(h,16));i+=4;}else{yes(Object.hasOwn(esc,e));out+=esc[e];}
  }else out+=ch;yes(out.length<=TEST_ADMISSION_LIMITS.string);
 }yes(false);}
 function value(depth){yes(++values<=200000&&depth<=24);ws();const c=s[i];
  if(c==='"')return string();
  if(c==='{'||c==='['){i++;const obj=c==='{',out=obj?{}:[],seen=new Set();ws();if(s[i]===(obj?'}':']')){i++;return out;}let n=0;
   while(true){yes(++n<=(obj?128:1024));ws();let key;if(obj){yes(s[i]==='"');key=string();yes(key.length<=160&&!seen.has(key));seen.add(key);ws();yes(s[i++]===':');}
    const v=value(depth+1);if(obj)Object.defineProperty(out,key,{value:v,enumerable:true,writable:true,configurable:true});else out.push(v);
    ws();if(s[i]===(obj?'}':']')){i++;return out;}yes(s[i++]===',');}
  }
  for(const [token,v]of [['true',true],['false',false],['null',null]])if(s.startsWith(token,i)){i+=token.length;return v;}
  const m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(s.slice(i));yes(m!==null);i+=m[0].length;const n=Number(m[0]);yes(Number.isFinite(n));return n;
 }
 const out=value(0);ws();yes(i===s.length);return out;
}
const AUDIT=['schema','phase','freezeFileSha256','freezeHash','sourceMapHash','panelIdentity','manifestHash','producerRecipeHash','rootReuseReceiptHash','rootTransferHash','trainFiles','trainNodeIdentityHash','selectionIdentity','packetHash','artifactHash','inputLedgerHash','review','auditIdentity'];
const CONTEXT=['freezeFileSha256','freezeHash','sourceMapHash','panelIdentity','manifestHash','producerRecipeHash','rootReuseReceiptHash','rootTransferHash','manifest','rootCandidate'];
const SELECTED=['schema','panelIdentity','manifestHash','producerRecipeHash','rootReuseReceiptHash','rootTransferHash','inputLedgerHash','referenceConstruction','constructionHash','trainingCases','trainingCaseIds','trainingGroupIds','calibrationGroupIds','referencePacket','detailInputDefinition','supportedRootIds','calibrationAudit','calibrationSelections','independentCalibrationValidation','productionValidated','assignmentAuthority','selectionIdentity'];
const SUPERVISOR=['schema','phase','sourceIdentityHash','sourceIdentityKind','freezeHash','sourceMapHash','nodeIdentityHash','normalExit','exitCode','normalEmptyJob','endchecksPassed','resultSha256','selectionSha256','guardianComplete','stats','emergencyOwnJobTermination','ownCleanupPassed','failure','cleanupFailure','productionValidated','assignmentAuthority','supervisorHash'];
const RESULT=['schema','phase','freezeHash','sourceMapHash','nodeIdentityHash','readySha256','startupAckSha256','baselineHash','result','selectionSha256','fsProofCheckpoint','sourceAssetEndchecksPassed','productionValidated','assignmentAuthority'];
const PHASE=['schema','phase','panelIdentity','manifestHash','rootReuseReceiptHash','capture','encoding','receipts','inputLedger','semantic','normalEncoderClosed','sourceAssetEndchecksPassed','actualIoAndSupervisorProofRequired','productionValidated','assignmentAuthority','networkPacing'];
const COMMON=['id','groupId','split','globalOrdinal','nativeOrdinal','batchId','status','inputIdentity','assessmentGoldHash','referenceAnnotationHash'];
const AVAILABLE=['sourceVersion','producerProfileHash','inputConstructionHash','extractorVersion','fieldBindings','nativeWitnessHash','rightsEvidenceHash','bodyVectorHash','titleVectorHash'];
const REASONS=['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','document-policy-refused','reader-unavailable','foreground-changed','restricted-rendering'];
function fields(v){record(v,['bodySha256','bodyCharacters','rawTitleSha256','rawTitleCharacters','effectiveTitleSha256','effectiveTitleCharacters']);
 for(const k of ['bodySha256','rawTitleSha256','effectiveTitleSha256'])hash(v[k]);INT(v.bodyCharacters,4096);INT(v.rawTitleCharacters,200);INT(v.effectiveTitleCharacters,200);yes(v.bodyCharacters>0&&v.effectiveTitleCharacters>0);}
function pacing(v,manifest){record(v,['schema','originDelays','clockCarried']);yes(v.schema==='native-specificity-origin-pacing/v1'&&v.clockCarried===false);
 const origins=new Set(manifest.cases.map(c=>new URL(c.publicUrl).origin));let prior='';for(const r of dense(v.originDelays,168)){record(r,['origin','maximumDelayMs']);yes(typeof r.origin==='string'&&origins.has(r.origin)&&r.origin>prior);prior=r.origin;INT(r.maximumDelayMs,86400000);yes(r.maximumDelayMs>=2000);}}
function checkpoint(v){record(v,['sequence','chainHash']);INT(v.sequence,65536);yes(v.sequence>0);hash(v.chainHash);}
function enumeration(v){
 const r=record(v,['schema','logicalObservations','physicalQueries','retryQueries','firstMismatch']);yes(r.schema==='native-specificity-job-enumeration/v1');
 for(const k of ['logicalObservations','physicalQueries','retryQueries'])INT(r[k]);
 // BigInt comparisons avoid rounding a safe input's three-times bound.
 const logical=BigInt(r.logicalObservations),physical=BigInt(r.physicalQueries),retry=BigInt(r.retryQueries);
 yes(physical>=logical&&physical<=3n*logical&&retry===physical-logical);
 if(r.firstMismatch===null){yes(retry===0n);return;}
 const m=record(r.firstMismatch,['assigned','listed']);INT(m.assigned,4294967295);INT(m.listed,4294967295);yes(m.assigned!==m.listed);
 // Only NORMAL completed TRAIN is admissible. Terminal/API/boundary refusals
 // belong to failed reports, never successful TEST authority.
 yes(m.assigned<128&&m.listed<128&&retry>0n);
}
function noRaw(v){if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){yes(!['rawTitle','effectiveTitle','body','bodyVector','titleVector','nativeInput'].includes(k));noRaw(x);}}

/** Only separately reviewed owner FILE pins authenticate saved evidence. This
 * does not repeat the CAL grid or authenticate actual guardian/native truth. */
export function admitSpecificityTest(input){
 const a=record(input,['expectedAuditFileHash','bundle','context','guard']);hash(a.expectedAuditFileHash);yes(typeof a.guard==='function'&&!types.isProxy(a.guard));
 let checking=false,failed=false;function guard(){try{yes(!checking&&!failed);checking=true;const g=sync(a.guard());yes(!failed&&(g===true||g===undefined));}catch{failed=true;throw new TypeError('TEST admission refused');}finally{checking=false;}}
 guard();const b=record(a.bundle,['auditBytes','supervisorBytes','resultBytes','selectionBytes']);
 const auditBytes=file(b.auditBytes,65536);yes(sha(auditBytes)===a.expectedAuditFileHash);guard();
 const audit=record(parse(auditBytes),AUDIT);yes(audit.schema==='native-specificity-independent-selection-audit/v1'&&audit.phase==='train-cal');
 const {auditIdentity,...auditBody}=audit;hash(auditIdentity);yes(digest(auditBody)===auditIdentity);
 const c=copy(record(a.context,CONTEXT));for(const k of CONTEXT.slice(0,8)){hash(c[k]);yes(audit[k]===c[k]);}
 record(audit.review,['selectedPolicyAndBindingsChecked','fullGridReplay','omittedQueryFeaturesNotRecomputed','testPermitted','scope']);
 eq(audit.review,{selectedPolicyAndBindingsChecked:true,fullGridReplay:false,omittedQueryFeaturesNotRecomputed:true,testPermitted:true,scope:'fixed-168-specificity/v1'});
 const pins=record(audit.trainFiles,['supervisorSha256','resultSha256','selectionSha256']);for(const v of Object.values(pins))hash(v);
 const supervisorBytes=file(b.supervisorBytes,524288),resultBytes=file(b.resultBytes,524288),selectionBytes=file(b.selectionBytes,524288);
 yes(sha(supervisorBytes)===pins.supervisorSha256&&sha(resultBytes)===pins.resultSha256&&sha(selectionBytes)===pins.selectionSha256);guard();
 // NO TRAIN parser runs until every externally bound TRAIN byte hash matches.
 const supervisor=record(parse(supervisorBytes),SUPERVISOR),outer=record(parse(resultBytes),RESULT),selection=record(parse(selectionBytes),SELECTED);noRaw(supervisor);noRaw(outer);noRaw(selection);guard();
 validateSpecificityBatch({manifest:c.manifest,batch:c.manifest.batches[0],expectedPanelIdentity:c.panelIdentity,expectedManifestHash:c.manifestHash});
 const root=describeNativeRootRankCandidate(compileNativeRootRankCandidate(c.rootCandidate));yes(root.transferHash===c.rootTransferHash);guard();
 yes(supervisor.schema==='native-specificity-study-supervisor/v1'&&supervisor.phase==='train-cal'&&supervisor.sourceIdentityKind==='freeze-file');
 yes(supervisor.sourceIdentityHash===c.freezeFileSha256&&supervisor.freezeHash===c.freezeHash&&supervisor.sourceMapHash===c.sourceMapHash);
 hash(audit.trainNodeIdentityHash);yes(supervisor.nodeIdentityHash===audit.trainNodeIdentityHash);
 for(const k of ['normalExit','normalEmptyJob','endchecksPassed','ownCleanupPassed'])yes(supervisor[k]===true);
 yes(supervisor.exitCode===0&&supervisor.emergencyOwnJobTermination===false&&supervisor.failure===null&&supervisor.cleanupFailure===null);falseFlags(supervisor);
 // Python's supervisorHash uses its own JSON number formatting. External FILE
 // authentication is authoritative here; never mis-recompute it with JS.
 hash(supervisor.supervisorHash);yes(supervisor.resultSha256===pins.resultSha256&&supervisor.selectionSha256===pins.selectionSha256);
 yes(outer.schema==='native-specificity-study-result/v1'&&outer.phase==='train-cal'&&outer.freezeHash===c.freezeHash&&outer.sourceMapHash===c.sourceMapHash&&outer.nodeIdentityHash===audit.trainNodeIdentityHash&&outer.selectionSha256===pins.selectionSha256&&outer.sourceAssetEndchecksPassed===true);falseFlags(outer);
 for(const k of ['readySha256','startupAckSha256','baselineHash'])hash(outer[k]);checkpoint(outer.fsProofCheckpoint);
 const stats=record(supervisor.stats,['peakRssBytes','peakPrivateBytes','peakJobMembers','peakCpuSeconds','peakStudyBytes','peakStudyEntries','fsProofSequence','fsProofChainHash','fsProofWireBytes','fsProofMaximumFrame','fsProofCheckpoints','rawProofFramesRetained','jobEnumeration']);enumeration(stats.jobEnumeration);
 for(const k of ['peakRssBytes','peakPrivateBytes','peakJobMembers','peakStudyBytes','peakStudyEntries'])INT(stats[k]);number(stats.peakCpuSeconds);yes(stats.rawProofFramesRetained===false);
 INT(stats.fsProofSequence,65536);hash(stats.fsProofChainHash);INT(stats.fsProofWireBytes,67108864);INT(stats.fsProofMaximumFrame,16385);
 record(stats.fsProofCheckpoints,['result','finish','completion']);let prior=0;
 for(const k of ['result','finish','completion']){const p=stats.fsProofCheckpoints[k];checkpoint(p);yes(p.sequence>=prior&&p.sequence<=stats.fsProofSequence);prior=p.sequence;}
 eq(stats.fsProofCheckpoints.result,outer.fsProofCheckpoint);if(prior===stats.fsProofSequence)yes(stats.fsProofCheckpoints.completion.chainHash===stats.fsProofChainHash);
 const report=record(outer.result,PHASE);yes(report.schema==='native-specificity-phase-composition/v1'&&report.phase==='train-cal'&&report.panelIdentity===c.panelIdentity&&report.manifestHash===c.manifestHash&&report.rootReuseReceiptHash===c.rootReuseReceiptHash);
 for(const k of ['normalEncoderClosed','sourceAssetEndchecksPassed','actualIoAndSupervisorProofRequired'])yes(report[k]===true);falseFlags(report);pacing(report.networkPacing,c.manifest);
 const cap=record(report.capture,['captureHash','accounted','available','batchReceiptHashes']);hash(cap.captureHash);yes(cap.accounted===96);INT(cap.available,96);
 const enc=record(report.encoding,['captureHash','encoderCalls','available','encodingStartedAt','encodingCompletedAt','rawTextRetained','vectorBindings']);
 yes(enc.captureHash===cap.captureHash&&enc.available===cap.available&&enc.encoderCalls===cap.available*2&&enc.rawTextRetained===false);number(enc.encodingStartedAt);number(enc.encodingCompletedAt);yes(enc.encodingCompletedAt>=enc.encodingStartedAt);
 const guardian=record(supervisor.guardianComplete,['phase','captureHash','batchReceiptHashes','finalAckHash','cpuSeconds','pending']);
 yes(guardian.phase==='train-cal'&&guardian.captureHash===cap.captureHash&&guardian.pending===0);hash(guardian.finalAckHash);number(guardian.cpuSeconds);
 const batches=c.manifest.batches.filter(r=>r.phase==='train-cal'),receipts=dense(report.receipts,24),receiptHashes=dense(cap.batchReceiptHashes,24);yes(receipts.length===24&&receiptHashes.length===24);eq(guardian.batchReceiptHashes,receiptHashes);yes(new Set(receiptHashes).size===24);
 receipts.forEach((r,i)=>{record(r,['batchId','receiptHash','completedBatches']);hash(r.receiptHash);yes(r.batchId===batches[i].batchId&&r.receiptHash===receiptHashes[i]&&r.completedBatches===i+1);});
 const ledger=record(report.inputLedger,['schema','phase','manifestHash','captureHash','rows','ledgerHash']);yes(ledger.schema==='native-specificity-ordered-input-metadata/v1'&&ledger.phase==='train-cal'&&ledger.manifestHash===c.manifestHash&&ledger.captureHash===cap.captureHash);
 const {ledgerHash,...ledgerBody}=ledger;hash(ledgerHash);yes(digest(ledgerBody)===ledgerHash&&audit.inputLedgerHash===ledgerHash&&selection.inputLedgerHash===ledgerHash);
 const cases=c.manifest.cases.filter(r=>r.split!=='test'),rows=dense(ledger.rows,96),available=[],nonces=new Set();yes(rows.length===96);
 rows.forEach((r,i)=>{const pc=cases[i],bc=batches[Math.floor(i/4)].cases[i%4];yes(r.status==='available'||r.status==='unavailable');record(r,[...COMMON,...(r.status==='available'?AVAILABLE:['reason'])]);
  for(const k of ['id','groupId','split','globalOrdinal'])yes(r[k]===pc[k]);yes(r.nativeOrdinal===bc.nativeOrdinal&&r.batchId===batches[Math.floor(i/4)].batchId);hash(r.inputIdentity);
  eq(r.assessmentGoldHash,pc.assessmentGold===null?null:digest(pc.assessmentGold));eq(r.referenceAnnotationHash,pc.referenceAnnotation===null?null:digest(pc.referenceAnnotation));
  if(r.status==='unavailable'){yes(REASONS.includes(r.reason));return;}
  yes(typeof r.sourceVersion==='string'&&r.sourceVersion.length>0&&r.sourceVersion.length<=160&&r.inputConstructionHash===c.producerRecipeHash&&['main-text-prefix/v1','article-container-prefix/v1'].includes(r.extractorVersion));
  yes(!nonces.has(r.sourceVersion));nonces.add(r.sourceVersion);
  for(const k of ['producerProfileHash','nativeWitnessHash','rightsEvidenceHash','bodyVectorHash','titleVectorHash'])hash(r[k]);fields(r.fieldBindings);available.push(r);
 });
 yes(available.length===cap.available);eq(enc.vectorBindings,available.map(r=>({id:r.id,bodyVectorHash:r.bodyVectorHash,titleVectorHash:r.titleVectorHash})));guard();
 const {selectionIdentity,...selectedBody}=selection;hash(selectionIdentity);yes(digest(selectedBody)===selectionIdentity&&audit.selectionIdentity===selectionIdentity);
 yes(selection.schema==='native-specificity-selected-detail/v1');for(const k of ['panelIdentity','manifestHash','producerRecipeHash','rootReuseReceiptHash','rootTransferHash'])yes(selection[k]===c[k]);
 yes(selection.calibrationSelections===1&&selection.independentCalibrationValidation===false);falseFlags(selection);
 const train=cases.filter(r=>r.split==='training'),cal=cases.filter(r=>r.split==='calibration'),rowsById=new Map(rows.map(r=>[r.id,r]));
 eq(selection.trainingCases,train.map(r=>({id:r.id,groupId:r.groupId,referenceAnnotation:r.referenceAnnotation})));eq(selection.trainingCaseIds,train.map(r=>r.id));eq(selection.calibrationGroupIds,cal.map(r=>r.groupId));
 const construction=record(selection.referenceConstruction,['schema','panelIdentity','manifestHash','producerProfileHash','nativeInputConstructionHash','builderSourceHash','pairedLibrarySourceHash','inputDefinition','representationHash','trainingCasesHash','orderedAssociations','nativeSourceBuilderClaim','calibrationSelected','productionValidated','assignmentAuthority']);
 yes(construction.schema==='native-specificity-offline-reference-construction/v1'&&construction.panelIdentity===c.panelIdentity&&construction.manifestHash===c.manifestHash&&construction.nativeInputConstructionHash===c.producerRecipeHash);
 yes(construction.nativeSourceBuilderClaim===false&&construction.calibrationSelected===false);falseFlags(construction);
 for(const k of ['producerProfileHash','builderSourceHash','pairedLibrarySourceHash','representationHash'])hash(construction[k]);yes(construction.trainingCasesHash===digest(selection.trainingCases));
 hash(selection.constructionHash);yes(digest(construction)===selection.constructionHash);eq(selection.detailInputDefinition,c.rootCandidate.inputDefinition);eq(construction.inputDefinition,selection.detailInputDefinition);eq(selection.supportedRootIds,['games','nature','cooking']);
 const associations=dense(construction.orderedAssociations,48);yes(associations.length===48);
 const included=[];associations.forEach((r,i)=>{const pc=train[i],l=rowsById.get(pc.id);yes(r.id===pc.id&&r.groupId===pc.groupId&&r.status===l.status);eq(r.referenceAnnotation,pc.referenceAnnotation);
  if(l.status==='unavailable'){record(r,['id','groupId','status','reason','inputIdentity','referenceAnnotation','referenceIncluded']);yes(r.reason===l.reason&&r.inputIdentity===l.inputIdentity&&r.referenceIncluded===false);return;}
  record(r,['id','groupId','status','referenceAnnotation','referenceIncluded','derivationStatus','nativeInputHash','fieldBindings','nativeWitnessHash','rightsEvidenceHash','producerProfileHash','nativeInputConstructionHash','batchId','nativeOrdinal','bodyVectorHash','titleVectorHash','referenceVectorBitHash']);
  hash(r.nativeInputHash);yes(r.nativeInputHash===l.inputIdentity);eq(r.fieldBindings,l.fieldBindings);for(const k of ['nativeWitnessHash','rightsEvidenceHash','producerProfileHash','batchId','nativeOrdinal','bodyVectorHash','titleVectorHash'])yes(r[k]===l[k]);
  yes(r.producerProfileHash===construction.producerProfileHash&&r.nativeInputConstructionHash===l.inputConstructionHash&&typeof r.referenceIncluded==='boolean');
  if(r.referenceIncluded){yes(r.derivationStatus==='nonzero-reference');hash(r.referenceVectorBitHash);included.push(r);}else yes(r.derivationStatus==='zero-fusion'&&r.referenceVectorBitHash===null);
 });yes(included.length>0);eq(selection.trainingGroupIds,included.map(r=>r.groupId));for(const r of available)yes(r.producerProfileHash===construction.producerProfileHash);
 const packet=record(selection.referencePacket,['text','packetHash','artifactHash','trainingCasesHash','examples','vectorOccurrences','assignmentAuthority']);yes(packet.assignmentAuthority===false&&packet.examples===included.length&&packet.vectorOccurrences===included.length&&packet.trainingCasesHash===construction.trainingCasesHash);
 yes(packet.packetHash===audit.packetHash&&packet.artifactHash===audit.artifactHash);hash(packet.packetHash);hash(packet.artifactHash);
 guard();const codec=createTrainReferenceCodec({expectedManifestHash:c.manifestHash,expectedInputConstructionHash:selection.constructionHash,trainingCases:selection.trainingCases});const decoded=codec.decode(packet.text,packet.packetHash);
 yes(decoded.artifactHash===packet.artifactHash&&decoded.examples===included.length);eq(decoded.artifact.examples.map(r=>r.id),included.map(r=>r.id));
 // The codec's packet bit hashes have their own namespace, identical to the
 // reference builder's fused-reference hash namespace.
 const packetBody=parse(Buffer.from(packet.text));packetBody.artifact.examples.forEach((r,i)=>yes(r.vectorBitHash===included[i].referenceVectorBitHash));
 const identity=describeNativeRootLocalDetailTransfer(compileNativeRootLocalDetailTransfer({schema:'native-root-local-detail-transfer/v1',rootCandidate:c.rootCandidate,detail:{artifact:decoded.artifact,inputDefinition:selection.detailInputDefinition,supportedRootIds:selection.supportedRootIds}}));
 yes(identity.rootTransferHash===c.rootTransferHash&&identity.originalDetailArtifactHash===packet.artifactHash);guard();
 const ca=record(selection.calibrationAudit,['schema','artifactHash','transferHash','templateArtifactHash','originalInputConstructionHash','representationHash','featureCalibrationHash','gridHash','calibrationAssociationsHash','nodeAudits','goldTaxonomyScope','goldTaxonomyHash','fullHouseTaxonomyClaim','availability','rootGate','finalCalibrationAudit','work','provenanceScope','queryVectorsReturned','experimental','developmentOnly','independentValidation','productionValidated','assignmentAuthority']);yes(ca.schema==='native-local-detail-calibration-result/v1'&&ca.artifactHash===packet.artifactHash&&ca.transferHash===identity.transferHash&&ca.originalInputConstructionHash===selection.constructionHash&&ca.representationHash===construction.representationHash);
 for(const k of ['templateArtifactHash','featureCalibrationHash','gridHash','calibrationAssociationsHash','goldTaxonomyHash'])hash(ca[k]);
 yes(decoded.artifact.calibrationVersion==='native-detail-cal-'+ca.featureCalibrationHash);
 const template={...decoded.artifact,calibrationVersion:'adr179-unfitted-'+selection.constructionHash,nodePolicies:decoded.artifact.nodes.map(n=>({nodeId:n.id,enabled:false,minSupport:2,minSimilarity:1,minNegativeMargin:2,minRivalMargin:2}))};
 yes(codec.encode(template).artifactHash===ca.templateArtifactHash);
 const audits=dense(ca.nodeAudits,12);yes(audits.length===12);audits.forEach((r,i)=>{record(r,['nodeId','enabled','selectedCut','maximumZeroKnownWrongPositiveGroups','selectedPolicyAudit','directStopEndpointSupportIndependentOfNodeSupport']);const p=decoded.artifact.nodePolicies[i];yes(r.nodeId===p.nodeId&&r.enabled===p.enabled&&r.directStopEndpointSupportIndependentOfNodeSupport===true);INT(r.maximumZeroKnownWrongPositiveGroups,48);if(p.enabled)eq(r.selectedCut,{minSupport:p.minSupport,minSimilarity:p.minSimilarity,minRivalMargin:p.minRivalMargin,minNegativeMargin:p.minNegativeMargin});else yes(r.selectedCut===null);});
 yes(ca.rootGate.rootCutsRetuned===false&&ca.rootGate.rawDetailIncludesRootRejected===true&&ca.independentValidation===false&&ca.queryVectorsReturned===false&&ca.fullHouseTaxonomyClaim===false);falseFlags(ca);
 const calRows=cal.map(pc=>rowsById.get(pc.id));
 yes(ca.availability.cases===48&&ca.availability.inputAvailable===calRows.filter(r=>r.status==='available').length&&ca.availability.inputUnavailable===calRows.filter(r=>r.status==='unavailable').length);
 yes(ca.finalCalibrationAudit.phase==='calibration-resubstitution-not-independent-validation'&&ca.work.localCompileCalls===3);
 const fullNodes=root.nodeIds.map(id=>({id,parentId:null}));for(const n of decoded.artifact.nodes)if(!fullNodes.some(p=>p.id===n.id))fullNodes.push(n);
 const outcomes=dense(ca.finalCalibrationAudit.assessment.outcomes,48);yes(outcomes.length===48);
 const predictions=outcomes.map((r,i)=>{yes(r.id===cal[i].id&&(r.status==='unavailable')===(calRows[i].status==='unavailable'));return {id:r.id,status:r.status,selectedPath:r.selectedPath};});
 guard();const assessed=assessCompleteHierarchyPredictions({nodes:fullNodes,cases:cal.map(pc=>({id:pc.id,groupId:pc.groupId,language:pc.language,gold:pc.assessmentGold})),predictions,trainingGroupIds:selection.trainingGroupIds,calibrationGroupIds:[]});eq(assessed,ca.finalCalibrationAudit.assessment);
 const semantic=record(report.semantic,['status','accounted','referenceCount','calibrationSelections','selectionIdentity','packetHash','artifactHash','testAllowed']);
 eq(semantic,{status:'selected-pending-independent-audit',accounted:96,referenceCount:included.length,calibrationSelections:1,selectionIdentity,packetHash:packet.packetHash,artifactHash:packet.artifactHash,testAllowed:false});
 guard();return freeze({manifestHash:c.manifestHash,selectionIdentity,auditIdentity,selection,networkPacing:report.networkPacing,trainFiles:pins,inputLedgerHash:ledgerHash});
}
