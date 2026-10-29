// Re-score the retained DEV observations; no new E5 session or fresh validation.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {compilePairedE5Input,applyPairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {publicTopicEncoderInput,comparePublishedTopicRecovery,PUBLIC_RECOVERY_POLICY_HASH} from './recovery.js';
const root=new URL('../../../../',import.meta.url),data=new URL('apps/local-service/data/',root),pins=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function bytes(url,expected=null){const s=await lstat(url);if(!s.isFile()||s.isSymbolicLink()||s.size>2097152||s.size<1)throw Error('Read bounds');
 const b=await readFile(url),h=sha(b);if(b.length!==s.size||expected!==null&&h!==expected)throw Error('Input integrity');
 pins.push({file:fileURLToPath(url).slice(fileURLToPath(root).length).replaceAll('\\','/'),bytes:b.length,sha256:h});return b;}
const json=async(url,expected)=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bytes(url,expected)));
if(process.argv.length!==2||JSON.stringify(process.execArgv)!==JSON.stringify(['--max-old-space-size=64']))throw Error('Fixed offline scorer runtime');
for(const name of ['recovery.js','rescore-dev-comparison.mjs','public-examples.json'])await bytes(new URL(name,import.meta.url));
await bytes(new URL('apps/local-service/src/domain/hierarchical-e5-paired-input.js',root));
const original=await json(new URL('public-topic-recovery-packaged-runtime-20261029/result.json',data),'7cab34493d043c090be3b6d1aa1dda26cb4316944faa6dcace61c16cf0cc876b');
if(original.status!=='completed'||!original.encoderClosed||!original.endPinsChecked||original.comparisons.length!==6)throw Error('Original incomplete');
const publicExamples=await json(new URL('public-examples.json',import.meta.url),'8cbc7cd06245047f43b79da32dfd1a4b2e2595f5bb93aaa039dfadab30254aad');
const candidates=[];
for(const p of publicExamples.examples){
 if(!/^[a-z0-9-]+$/u.test(p.rootId))throw Error('Closed public root');
 const c=await json(new URL('public-topic-recovery-packaged-runtime-20261029/'+p.rootId+'.json',data));
 const input=publicTopicEncoderInput(JSON.stringify(p));
 if(!['rootId','topicId','caption','body'].every(k=>c[k]===p[k])||c.publicDigest!==input.publicDigest)throw Error('Public text differs');candidates.push(c);
}
const features=new Map();for(const pin of original.pins){
 if(!/^apps\/local-service\/data\/general-web-subject-(screen-features|variants)-20261029\/[a-z0-9-]+\.json$/u.test(pin.file))continue;
 const f=await json(new URL(pin.file,root),pin.sha256);features.set(f.id,f.pairedVector);
}
const ownerPin=original.pins.find(p=>p.file==='apps/local-service/data/general-topic-owner-examples-20261029.json');if(!ownerPin)throw Error('Owner pin absent');
const owner=await json(new URL(ownerPin.file,root),ownerPin.sha256),definition=await json(new URL('apps/local-service/assets/hierarchy/input-definition.json',root));
const fusion=compilePairedE5Input(definition);for(const r of owner.rows)features.set(r.id,applyPairedE5Input(fusion,{sourceId:r.id,sourceVersion:r.source_version,bodyVector:r.body_vector,titleVector:r.title_vector}).vector);
const inputs=[],comparisons=[];
for(const q of original.comparisons){
 const memberVectors=q.members.map(id=>features.get(id));
 if(memberVectors.some(v=>!v))throw Error('Member missing');
 for(const c of candidates){
  const score=Math.min(...memberVectors.map(v=>v.reduce((s,n,i)=>s+n*c.vector[i],0))),old=q.scores.find(s=>s.topicId===c.topicId);
  if(!old||Math.abs(old.minimum-score)>1e-14)throw Error('Retained candidate scores differ');
 }
 const input=JSON.stringify({representationHash:candidates[0].representationHash,label:q.label,memberVectors,candidates});inputs.push(input);
 comparisons.push({label:q.label,expected:q.expected,result:comparePublishedTopicRecovery(input)});
}
const timings=[];for(let i=0;i<100;i++){const at=performance.now();for(const input of inputs)comparePublishedTopicRecovery(input);timings.push((performance.now()-at)/inputs.length);}timings.sort((a,b)=>a-b);
// Repeated numerical vectors are only a maximum-size scorer workload, never
// distinct materials, public roots or additional semantic evaluation cases.
const syntheticCandidates=Array.from({length:64},(_,i)=>{
 const c={...candidates[i%candidates.length],rootId:'load-root-'+i,topicId:'load-topic-'+i};
 c.publicDigest=publicTopicEncoderInput(JSON.stringify({rootId:c.rootId,topicId:c.topicId,caption:c.caption,body:c.body})).publicDigest;return c;
});
const vectors=JSON.parse(inputs[0]).memberVectors,loadInput=JSON.stringify({representationHash:candidates[0].representationHash,label:'Kapsalon',memberVectors:Array.from({length:64},(_,i)=>vectors[i%vectors.length]),candidates:syntheticCandidates});
const loadTimings=[];for(let i=0;i<30;i++){const at=performance.now();comparePublishedTopicRecovery(loadInput);loadTimings.push(performance.now()-at);}loadTimings.sort((a,b)=>a-b);
for(const pin of pins){const b=await readFile(new URL(pin.file,root));if(b.length!==pin.bytes||sha(b)!==pin.sha256)throw Error('Changed end pin');}
const counts=Object.fromEntries(['literal-name','public-semantic','literal-and-public-semantic'].map(strategy=>{
 const d=comparisons.map(q=>({expected:q.expected,...q.result.decisions.find(d=>d.strategy===strategy)}));
 return [strategy,{correct:d.filter(r=>r.topicId===r.expected).length,wrong:d.filter(r=>r.topicId!==null&&r.topicId!==r.expected).length,ambiguous:d.filter(r=>r.status==='ambiguous').length,unresolved:d.filter(r=>r.status==='unresolved').length}];
}));
const output=new URL('public-topic-recovery-margin-review-20261029/',data);await mkdir(output);
const result={schema:'public-topic-recovery-dev-rescore/v1',policyHash:PUBLIC_RECOVERY_POLICY_HASH,comparisons,counts,pins,endPinsChecked:true,
 retainedScoresRecomputed:true,casePinsFirstRecordedHere:true,
 scoringMs:{averageSixQueriesP50:timings[49],averageSixQueriesP95:timings[94],synthetic64x64P50:loadTimings[14],synthetic64x64P95:loadTimings[28]},
 freshValidation:false,encoderOpened:false,sqlExecuted:false,liveChanged:false,assignmentAuthority:false,representativeQuality:false};
await writeFile(new URL('result.json',output),JSON.stringify(result)+'\n',{flag:'wx'});console.log(JSON.stringify({counts,scoringMs:result.scoringMs,endPinsChecked:true,encoderOpened:false}));
