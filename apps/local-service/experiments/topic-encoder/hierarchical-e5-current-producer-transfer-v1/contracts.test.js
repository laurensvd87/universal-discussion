import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cohortContract,encodingContract} from './fit.js';
import {digest,INPUTS,inputSpec,ENCODER_HASH,CAPACITY_HASH,V3_HASH,SOURCE_NAMES} from './manifest.js';
import {currentTransferWorkPreflight} from './methods.js';
const hash='a'.repeat(64);
function invented(){
 const roots=Array.from({length:16},(_,i)=>'root-'+i);
 const old=Array.from({length:48},(_,i)=>({id:'real-train-'+i,entityGroup:'old-group-'+i,expectedRootId:roots[Math.floor(i/3)],split:'training',language:'en'}));
 const expansion=Array.from({length:80},(_,i)=>({id:'root-expansion-train-'+i,entityGroup:'added-group-'+i,expectedRootId:roots[Math.floor(i/5)],split:'training',language:'de'}));
 const cal=Array.from({length:48},(_,i)=>({id:'cal-'+i,entityGroup:'cal-group-'+i,expectedRootId:roots[Math.floor(i/3)],split:'calibration',language:'fr'}));
 const training=[...old,...expansion.slice(0,79)].map(r=>({id:r.id,groupId:r.entityGroup,expectedRootId:r.expectedRootId,language:r.language,sourceInputHash:hash}));
 const flag=r=>({id:r.id,sourceInputHash:hash,sourceInputHashScope:'captured-public-input','current-static':true,'wikipedia-prose-lead':true});
 const oldEncoding={freezeHash:V3_HASH,phase:'traincal',captureStatus:'complete',encoderCalls:288,cases:[...old,...cal].map(flag),packets:[{inputView:'current-static',rows:96,vectorPacketSha256:INPUTS.oldVectors[1]},{inputView:'wikipedia-prose-lead',rows:96,vectorPacketSha256:hash}]};
 const expansionEncoding={freezeHash:CAPACITY_HASH,phase:'training-expansion',captureStatus:'complete',encoderCalls:237,eligibilityReceiptSha256:INPUTS.eligibility[1],eligibleCohortHash:digest(training),encodedViews:['current-static','wikipedia-prose-lead'],cases:expansion.map((r,i)=>({...flag(r),'current-static':i<79})),packets:[{inputView:'current-static',rows:79,vectorPacketSha256:INPUTS.expansionVectors[1]},{inputView:'wikipedia-prose-lead',rows:79,vectorPacketSha256:hash}]};
 return {eligibility:{eligible:true,totalTrainingRows:127,eligibleTraining:training,eligibleCohortHash:digest(training)},trainingGold:{cases:old},calibrationGold:{cases:cal},expansionGold:{cases:[...expansion,...Array.from({length:32},(_,i)=>({id:'NEVER-FINAL-'+i,split:'test'}))]},oldEncoding,expansionEncoding};
}
test('exact127 TRAIN plus48 independent ROOT-only CAL, not expansion final rows',()=>{
 const x=invented(),r=cohortContract(x);assert.equal(r.training.length,127);assert.equal(r.calibration.length,48);assert.ok(!JSON.stringify(r).includes('NEVER-FINAL'));assert.equal(r.training.filter(r=>r.expectedRootId==='root-15').length,7);
});
test('cohort metadata cannot relabel reused inputs, overlap groups or invent eligibility',()=>{
 for(const change of [x=>x.eligibility.eligible=false,x=>x.eligibility.totalTrainingRows=128,x=>x.eligibility.eligibleTraining[0].expectedRootId='wrong',x=>x.trainingGold.cases[0].expectedRootId='wrong',x=>x.calibrationGold.cases[0].entityGroup=x.trainingGold.cases[0].entityGroup,x=>x.oldEncoding.cases[0]['current-static']=false,x=>x.oldEncoding.cases[0].sourceInputHash='b'.repeat(64),x=>x.expansionGold.cases[0].split='test']){const x=invented();change(x);assert.throws(()=>cohortContract(x));}
});
test('encoding only accepts fixed current packets, IDs/order, encoder and pre-encoding eligibility',()=>{
 const x=invented(),p=(e,n)=>({freezeHash:e.freezeHash,encoderHash:ENCODER_HASH,vectors:e.cases.filter(r=>r['current-static']).map(r=>({id:r.id}))});
 const input={...x,oldPacket:p(x.oldEncoding),expansionPacket:p(x.expansionEncoding)};encodingContract(input);
 for(const change of [r=>r.oldPacket.encoderHash=hash,r=>r.expansionEncoding.eligibilityReceiptSha256=hash,r=>r.expansionPacket.vectors.reverse(),r=>r.oldEncoding.packets[0].inputView='wikipedia-prose-lead',r=>r.expansionEncoding.encoderCalls=238,r=>r.oldPacket.freezeHash=CAPACITY_HASH]){const r=structuredClone(input);change(r);assert.throws(()=>encodingContract(r));}
});
test('caller proxy/accessor contracts are rejected without execution',()=>{
 let calls=0;const x=invented();Object.defineProperty(x,'eligibility',{enumerable:true,get(){calls++;throw Error('secret');}});assert.throws(()=>cohortContract(x));assert.throws(()=>cohortContract(new Proxy({},{get(){calls++;throw Error('secret');}})));assert.equal(calls,0);
});
test('fixed allowlist cannot request old final packets, bodies, outcomes, private data or arbitrary siblings',()=>{
 for(const key of ['../old/test.vectors.json','oldFinal','ownerDb','../../secret'])assert.throws(()=>inputSpec(key));
 assert.ok(Object.values(INPUTS).every(([name])=>!/(?:test\.vectors|measured-results|capture.*\.json|output\/root-model)/u.test(name)));
 assert.ok(SOURCE_NAMES.every(name=>!name.endsWith('/run.js')));
});
test('default remains inert, no encoder/network/old IO runner imports and receipt is last artifact',async()=>{
 const src=await readFile(new URL('./fit.js',import.meta.url),'utf8');const imports=[...src.matchAll(/from ['"]([^'"]+)['"]/gu)].map(m=>m[1]);
 assert.ok(imports.every(s=>!/(?:packaged-e5|public-fetch|crawler|\/run\.js|\.assets)/u.test(s)));assert.ok(src.includes("process.argv.length===2"));assert.ok(src.lastIndexOf("write('selection-receipt.json'")>src.lastIndexOf("write('selection.json'"));
 assert.ok(src.includes("import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'"));
 assert.ok(SOURCE_NAMES.includes('../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'));
 assert.equal(globalThis[Symbol.for('murmingle.offline-capability-guard')]?.version,'offline-capability-guard/1.0.0');
});
test('fixed preflight remains conservative and supervisor gates the complete own Job before fitting',async()=>{
 const work=currentTransferWorkPreflight();assert.equal(work.trainingWork,17602992);assert.equal(work.calibrationCoordinateProducts,884736);assert.ok(work.rankWork<=100000);
 const py=await readFile(new URL('./supervise.py',import.meta.url),'utf8');
 assert.ok(py.indexOf('AssignProcessToJobObject(job, process_handle)')<py.indexOf('child.stdin.write('));
 for(const required of ['IsProcessInJob(handle, job','cleanup_deadline = time.monotonic() + 5','ACTIVE_LIMIT = 170','WALL_LIMIT = 180','artifact_capacity()','parsed = json.loads(result_bytes)','target_hashes[name]','MURMINGLE_CURRENT_ROOT_FIT_V1_SUPERVISED'])assert.ok(py.includes(required),required);
 assert.ok(py.includes("sys.argv[1:] != ['--fit-current']"));
});
