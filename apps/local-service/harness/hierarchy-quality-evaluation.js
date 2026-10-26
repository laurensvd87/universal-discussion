// Pure orchestration over explicit dependencies. No acquisition or encoder load.
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const MODEL='e5-small-q8-browser-main-prefix-v1';
const CAPTURE_REASONS=new Set(['already-attempted','deadline','aborted','clock-invalid','request-limit','robots-denied','policy-unavailable',
 'page-unavailable','redirect-refused','response-invalid','header-restricted','tdm-ambiguous','tdm-reserved','document-invalid','document-restricted','insufficient-text','pace-unavailable',
 'origin-paused','rate-limited','access-denied','upstream-unavailable','fetch-unavailable']);
const fail=()=>{throw new TypeError('Invalid numeric evaluation dependency result');};
const sha=text=>createHash('sha256').update(text).digest('hex');
function embedding(value){
 if(!value||typeof value!=='object'||types.isProxy(value))fail();
 const model=Object.getOwnPropertyDescriptor(value,'modelId'),array=Object.getOwnPropertyDescriptor(value,'values');
 if(!model||!Object.hasOwn(model,'value')||model.value!==MODEL||!array||!Object.hasOwn(array,'value'))fail();
 const vector=array.value;if(!Array.isArray(vector)||types.isProxy(vector)||Object.getPrototypeOf(vector)!==Array.prototype||vector.length!==384||Reflect.ownKeys(vector).length!==385)fail();
 const copy=[];let norm=0;
 for(let i=0;i<384;i++){const field=Object.getOwnPropertyDescriptor(vector,String(i));if(!field?.enumerable||!Object.hasOwn(field,'value')||typeof field.value!=='number'||!Number.isFinite(field.value)||Math.abs(field.value)>1)fail();copy.push(field.value);norm+=field.value*field.value;}
 if(Math.abs(norm-1)>1e-5)fail();return Object.freeze(copy);
}

/** The caller persists this row before stopping on fatal, then marks only later
 * probes not-attempted. This helper neither owns the cohort nor retries a stage.
 */
export async function evaluateHierarchyPublicProbe({probe,capture,getEmbedder,methods,now=()=>performance.now()}){
 const row={id:probe.id,groupId:probe.groupId,url:probe.url,expectedRootId:probe.rootId,labelScope:probe.labelScope,
  attempted:true,captureStatus:'attempted',evaluationStatus:'attempted'};
 let stage='capture',lastTime=null;
 function time(){const value=now();if(typeof value!=='number'||!Number.isFinite(value)||value<0||lastTime!==null&&value<lastTime)fail();lastTime=value;return value;}
 async function measured(key,operation){const start=time();try{return await operation();}finally{row[key]=time()-start;}}
 try{
  const page=await measured('captureMilliseconds',()=>capture.capture(probe.id));
  if(!page||page.id!==probe.id||page.url!==probe.url)fail();
  if(page.status==='unavailable'){
   row.captureStatus='unavailable';row.captureReason=CAPTURE_REASONS.has(page.reason)?page.reason:'unavailable';row.evaluationStatus='capture-unavailable';return {row,fatal:false};
  }
  if(page.status!=='available')fail();row.captureStatus='available';
  if(typeof page.title!=='string'||page.title.length<1||page.title.length>200||typeof page.text!=='string'||page.text.length<160||page.text.length>4096)fail();
  // Establish the captured observation BEFORE any encoder initialization/await.
  row.title=page.title;row.titleCharacters=page.title.length;row.bodyCharacters=page.text.length;
  row.bodyHash=sha(page.text);row.titleHash=sha(page.title);
  row.observation={extractorVersion:page.extractorVersion,responseSha256:page.responseSha256,htmlTextSha256:page.htmlTextSha256,
   rightsEvidenceHash:page.rightsEvidenceHash,sourceInputHash:page.sourceInputHash,provenance:page.provenance,nativeObservation:false};
  row.sourceVersion=page.sourceInputHash;
  if(typeof page.sourceInputHash!=='string'||!/^[a-f0-9]{64}$/u.test(page.sourceInputHash))fail();
  stage='encoder-initialization';
  const encoder=await measured('initializationMilliseconds',getEmbedder);
  if(!encoder||typeof encoder.embed!=='function')fail();
  stage='body-encoding';
  const body=await measured('bodyMilliseconds',()=>encoder.embed(page.text));row.bodyVector=embedding(body);row.modelId=MODEL;
  stage='title-encoding';
  const title=await measured('titleMilliseconds',()=>encoder.embed(page.title));row.titleVector=embedding(title);
  stage='scoring';
  const start=time();try{row.methods=methods.classify({sourceId:probe.id,sourceVersion:page.sourceInputHash,bodyVector:row.bodyVector,titleVector:row.titleVector});}
  finally{row.matchingMilliseconds=time()-start;}
  row.evaluationStatus='scored';return {row,fatal:false};
 }catch{
  row.evaluationStatus='failed';row.failureStage=stage;return {row,fatal:true};
 }
}
