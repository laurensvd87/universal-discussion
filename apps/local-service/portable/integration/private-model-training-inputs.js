// Fixed retained TRAIN inputs for performance rehearsal, not a new quality set.
// No import-time IO, network, fitting, vectors or caller-selected file paths.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {open,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const PRIVATE_MODEL_INPUT_PINS=Object.freeze([
 Object.freeze({path:'apps/local-service/data/hierarchy-real-root-capture-adr138.traincal.json',bytes:838989,sha256:'6659f34a3e800bc447eb5331500c647194d1fe71164e8c7ca2b08a28d1418955'}),
 Object.freeze({path:'apps/local-service/experiments/topic-encoder/hierarchical-e5-capacity-real-root-v1/output/training-eligibility.json',bytes:27005,sha256:'ef73b44936579c39ec054031f79864abb9f15c9dfce86eca0450d724341dd6cd'}),
 Object.freeze({path:'apps/local-service/data/hierarchy-real-root-training-gold-adr136.json',bytes:39418,sha256:'62ff96d3b98d197c4c90ea2db7f5a9adb7615bf8e18fce7f66c3c1681b1f53e8'}),
]);
export const PRIVATE_MODEL_INPUT_SCOPE=Object.freeze({purpose:'performance-only',retainedPublicTraining:true,experimentallyPrunedStatic:true,freshCapture:false,nativeObservation:false,qualityValidation:false,testInputsSelected:false});
const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const FIXED=Object.freeze([
 Object.freeze({id:'real-train-01',url:'https://en.wikipedia.org/wiki/Tetris',title:'Tetris - Wikipedia',goldTitle:'Tetris',group:'tetris-game',root:'games',hash:'aba50dd9302b5448b0e5b4f14792e681810e6238d45d7b524c772a21c4fd5115'}),
 Object.freeze({id:'real-train-04',url:'https://fr.wikipedia.org/wiki/Octopoda',title:'Octopoda \u2014 Wikip\u00e9dia',goldTitle:'Octopoda',group:'octopoda-animal-order',root:'nature',hash:'4c89c4fe4490894cd7877790a4d4021c8a1babd5accf91be0212411c7952b3ff'}),
]);
const HASH=/^[a-f0-9]{64}$/u;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const digest=value=>sha(JSON.stringify(value));
const need=value=>{if(!value)throw new Error('Fixed retained training input refused');};
async function ancestors(filename){for(let p=filename;;p=path.dirname(p)){const stat=await lstat(p);need(!stat.isSymbolicLink()&&(p===filename?stat.isFile():stat.isDirectory())&&await realpath(p)===p);if(path.dirname(p)===p)break;}}
const identity=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,stat.birthtimeMs].join(':');
async function authenticated(pin){
 const filename=path.resolve(ROOT,...pin.path.split('/'));need(filename.startsWith(ROOT)&&path.relative(ROOT,filename)===pin.path.split('/').join(path.sep));
 await ancestors(filename);const before=await lstat(filename);need(before.size===pin.bytes);
 const handle=await open(filename,'r');try{
  const opened=await handle.stat();need(identity(before)===identity(opened)&&opened.isFile());
  const raw=Buffer.alloc(pin.bytes+1);let used=0;
  while(used<raw.length){const {bytesRead}=await handle.read(raw,used,raw.length-used,null);if(bytesRead===0)break;used+=bytesRead;}
  const afterHandle=await handle.stat(),afterPath=await lstat(filename);
  need(identity(opened)===identity(afterHandle)&&identity(before)===identity(afterPath)&&!afterPath.isSymbolicLink()&&used===pin.bytes&&sha(raw.subarray(0,used))===pin.sha256);
  await ancestors(filename);return raw.subarray(0,used);
 }finally{await handle.close();}
}
function unique(rows,id){need(Array.isArray(rows));const selected=rows.filter(row=>row.id===id);need(selected.length===1);return selected[0];}
function project(capture,eligibility,gold){
 need(capture.schema==='hierarchy-real-root-public-capture-result/v3'&&capture.phase==='traincal'&&capture.capture?.phase==='traincal'&&capture.rawHtmlPersisted===false&&capture.modelExecuted===false&&capture.currentOwnerDataRead===false&&capture.canonicalWrites===false&&capture.publicLicensedTextOnly===true);
 need(eligibility.schema==='hierarchy-root-capacity-training-eligibility/v1'&&eligibility.reusedInputHashes?.['../../../data/hierarchy-real-root-capture-adr138.traincal.json']===PRIVATE_MODEL_INPUT_PINS[0].sha256);
 need(gold.schema==='hierarchy-real-root-training-gold/v1');
 return Object.freeze(FIXED.map(fixed=>{
  const g=unique(gold.cases,fixed.id),e=unique(eligibility.eligibleTraining,fixed.id),c=unique(capture.cases,fixed.id),o=unique(capture.capture.outcomes,fixed.id);
  need(g.split==='training'&&g.publicUrl===fixed.url&&g.articleTitle===fixed.goldTitle&&g.entityGroup===fixed.group&&g.expectedRootId===fixed.root&&g.labelScope==='root-only');
  need(e.groupId===fixed.group&&e.expectedRootId===fixed.root&&e.sourceInputHash===fixed.hash);
  need(c.split==='training'&&c.url===fixed.url&&c.entityGroup===fixed.group&&c.expectedRootId===fixed.root&&c.labelScope==='root-only');
  need(o.url===fixed.url&&o.title===fixed.title&&o.sourceInputHash===fixed.hash&&o.current?.extractorVersion==='crawler-static-html-prefix/v1');
  need(typeof o.current.text==='string'&&o.current.text.length===4096&&o.current.characters===4096&&sha(o.current.text)===o.current.sha256);
  need(typeof o.leadCandidate?.text==='string'&&o.leadCandidate.text.length<=4096&&o.leadCandidate.characters===o.leadCandidate.text.length&&o.leadCandidate.sha256===(o.leadCandidate.text?sha(o.leadCandidate.text):null));
  need(HASH.test(o.htmlSha256)&&HASH.test(o.decodedHtmlSha256)&&o.metadataPrune?.version==='wikipedia-quoted-transport-metadata-prune/v1'&&o.metadataPrune.experimental===true&&o.metadataPrune.productionValidated===false&&o.metadataPrune.originalSha256===o.decodedHtmlSha256);
  // Exact original eight-field formula: do not substitute body hash or gold title.
  need(digest({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,currentSha256:o.current.sha256,leadSha256:o.leadCandidate.sha256,decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:digest(o.metadataPrune)})===fixed.hash);
  return Object.freeze({id:fixed.id,url:fixed.url,title:o.title,text:o.current.text,extractorVersion:o.current.extractorVersion,sourceInputHash:fixed.hash});
 }));
}
export async function loadPrivateModelTrainingInputs(){
 need(arguments.length===0);
 // Sequential originals: a refusal cannot leave another file read unobserved.
 const raw=[];for(const pin of PRIVATE_MODEL_INPUT_PINS)raw.push(await authenticated(pin));
 const values=raw.map(bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 return project(...values);
}
// Pure validation seam only: never reads a path and supplies no provenance authority.
export function projectPrivateModelTrainingInputsForTest(capture,eligibility,gold){return project(capture,eligibility,gold);}
