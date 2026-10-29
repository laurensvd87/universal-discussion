// Closed DEV comparison only. Fixed local inputs and an exclusive output path.
// No network, SQL, capture, actual user post or live application composition.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {createPackagedCrawlerEmbedder} from '../../src/crawler/packaged-e5.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {publicTopicEncoderInput,comparePublishedTopicRecovery,PUBLIC_RECOVERY_POLICY_HASH} from './recovery.js';
const root=new URL('../../../../',import.meta.url),data=new URL('apps/local-service/data/',root),out=new URL('public-topic-recovery-packaged-runtime-20261029/',data);
const hash=b=>createHash('sha256').update(b).digest('hex'),pins=[];
async function file(url,max=2097152,expected=null){const before=await lstat(url);if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>max)throw Error('Input bounds');
 const bytes=await readFile(url);const h=hash(bytes);if(bytes.length!==before.size||expected!==null&&h!==expected)throw Error('Input integrity');
 pins.push({file:fileURLToPath(url).slice(fileURLToPath(root).length).replaceAll('\\','/'),bytes:bytes.length,sha256:h});return bytes;}
const json=async(url,max,expected)=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await file(url,max,expected)));
const save=async(name,value)=>writeFile(new URL(name,out),JSON.stringify(value)+'\n',{flag:'wx'});
if(process.argv.length!==2||JSON.stringify(process.execArgv)!==JSON.stringify(['--max-old-space-size=512']))throw Error('Existing packaged-model runtime required');
for(const name of ['recovery.js','public-examples.json','run-dev-comparison.mjs'])await file(new URL(name,import.meta.url));
for(const name of ['apps/local-service/src/crawler/packaged-e5.js','apps/local-service/src/domain/hierarchical-e5-paired-input.js','spikes/topic-resolution/browser/embedding/embedding-contract.js'])await file(new URL(name,root));
const manifest=await file(new URL('spikes/topic-resolution/browser/embedding/.assets/manifest.json',root),16384);
for(const asset of JSON.parse(manifest).assets){
 if(!/^[a-z0-9_.-]+$/u.test(asset.filename))throw Error('Fixed asset name');
 await file(new URL('spikes/topic-resolution/browser/embedding/.assets/'+asset.filename,root),120*1024*1024,asset.sha256);
}
const definition=await json(new URL('apps/local-service/assets/hierarchy/input-definition.json',root));
const paired=compilePairedE5Input(definition),representationHash=describePairedE5Input(paired).representationHash;
const refinement=await json(new URL('general-web-subject-refinement-20261029/result.json',data),undefined,'d6d80b2904bd8e83a32c2e4f935b348bab5814e36901ac0a96b46376400b08b2');
const features=new Map();
for(const pin of refinement.inputPins.filter(p=>p.file.endsWith('.json')&&!p.file.endsWith('result.json')&&!p.file.endsWith('focus-policy.json'))){
 if(!/^apps\/local-service\/data\/general-web-subject-(screen-features|variants)-20261029\/[a-z0-9-]+\.json$/u.test(pin.file))throw Error('Unexpected feature path');
 const value=await json(new URL(pin.file,root),undefined,pin.sha256);if(value.representationHash!==representationHash||features.has(value.id))throw Error('Feature identity');features.set(value.id,value.pairedVector);
}
if(features.size!==9)throw Error('Incomplete fixed feature set');
const owner=await json(new URL('general-topic-owner-examples-20261029.json',data),undefined,'752cecd836bb5ed0d66cb08430104a056eb6fc181d9ee858cad4f818786e3e2b');
for(const row of owner.rows){
 const value=applyPairedE5Input(paired,{sourceId:row.id,sourceVersion:row.source_version,bodyVector:row.body_vector,titleVector:row.title_vector});
 if(value.status!=='available')throw Error('Owner vector unavailable');features.set(row.id,value.vector);
}
const examples=await json(new URL('public-examples.json',import.meta.url));if(examples.examples.length!==13)throw Error('Closed public examples changed');
const queries=[{label:'Kapsalon',members:owner.rows.map(r=>r.id),expected:'kapsalon-recipe'},
 ...refinement.output.proposals.map(p=>({label:p.label,members:p.members.map(m=>m.sourceId),expected:({'Giant panda':'giant-panda','Red panda':'red-panda','Nintendo Switch':'switch-family','Steam Deck':'deck-family'})[p.label]})),
 {label:'Roter Panda',members:['general-red-panda-03','general-red-panda-01'],expected:'red-panda'}];
if(queries.length!==6||queries.some(q=>!q.expected||q.members.some(id=>!features.has(id))))throw Error('Query ledger');
await mkdir(out);const start=performance.now();let encoder=null,closed=false,error=null;const evidence=[];let comparisons=[];
console.log(JSON.stringify({phase:'fixed-inputs-verified',publicExamples:13,queries:6,existingModelHeapMiB:512}));
try{
 encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:hash(manifest)});
 console.log(JSON.stringify({phase:'existing-packaged-encoder-open'}));
 for(const example of examples.examples){const input=publicTopicEncoderInput(JSON.stringify(example));
  const body=await encoder.embed(input.bodyInput),title=await encoder.embed(input.titleInput);
  const fused=applyPairedE5Input(paired,{sourceId:example.rootId,sourceVersion:input.publicDigest,bodyVector:body.values,titleVector:title.values});
  if(fused.status!=='available')throw Error('Public vector unavailable');
  const candidate={...example,publicDigest:input.publicDigest,representationHash,vector:fused.vector};evidence.push(candidate);await save(example.rootId+'.json',candidate);
  console.log(JSON.stringify({phase:'public-evidence-encoded',rootId:example.rootId}));
 }
 comparisons=queries.map(q=>{
  const vectors=q.members.map(id=>features.get(id)),result=comparePublishedTopicRecovery(JSON.stringify({representationHash,label:q.label,memberVectors:vectors,candidates:evidence}));
  const scores=evidence.map(e=>({topicId:e.topicId,minimum:Math.min(...vectors.map(v=>v.reduce((s,n,i)=>s+n*e.vector[i],0)))})).sort((a,b)=>b.minimum-a.minimum);
  return {...q,result,scores};
 });
}catch(e){error=e?.code??e?.message??'unknown';process.exitCode=1;}
finally{if(encoder){await encoder.close();closed=true;}}
let endPinsChecked=true;for(const pin of pins){const b=await readFile(new URL(pin.file,root));if(b.length!==pin.bytes||hash(b)!==pin.sha256)endPinsChecked=false;}
if(!endPinsChecked)process.exitCode=1;
const counts=Object.fromEntries(['literal-name','public-semantic','literal-and-public-semantic'].map(strategy=>{
 const decisions=comparisons.map(q=>({expected:q.expected,...q.result.decisions.find(d=>d.strategy===strategy)}));
 return [strategy,{correct:decisions.filter(d=>d.topicId===d.expected).length,wrong:decisions.filter(d=>d.topicId!==null&&d.topicId!==d.expected).length,
  ambiguous:decisions.filter(d=>d.status==='ambiguous').length,unresolved:decisions.filter(d=>d.status==='unresolved').length}];}));
await save('result.json',{schema:'public-topic-recovery-dev-comparison/v1',status:error===null&&closed&&endPinsChecked?'completed':'failed',error,policyHash:PUBLIC_RECOVERY_POLICY_HASH,
 counts,comparisons,pins,endPinsChecked,encoderClosed:closed,elapsedMs:performance.now()-start,maximumRssKiB:process.resourceUsage().maxRSS,
 publicExamples:'invented-public-discussions',freshWebCaptures:false,actualStoredNonWikipediaVectors:true,populationValidated:false,
 networkUsed:false,sqlExecuted:false,actualUserPosts:false,sourceAuthority:false,assignmentAuthority:false,registryChanged:false,liveChanged:false});
console.log(JSON.stringify({status:error===null&&closed&&endPinsChecked?'completed':'failed',error,counts,encoderClosed:closed,endPinsChecked,elapsedMs:performance.now()-start}));
