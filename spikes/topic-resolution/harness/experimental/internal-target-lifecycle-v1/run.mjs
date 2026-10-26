// Default inert. ADR164 composes unchanged ADR151 variants only after baseline ACK.
import assert from 'node:assert/strict';
import {mkdir,open,link,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {HERE,REPO,V151,PACKAGE_ROOT,sha,digest,strict,checked,inspectSources,validateFreeze} from './source-ledger.js';
const OUTPUT=resolve(HERE,'output');
let terminalProjector=null;
const STAGE_LAYOUT=Object.freeze({'':['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js'],chromium:['page-content-reader.js'],core:['page-content-policy.js']});
export async function checkStageLayout(stage,{list=readdir,metadata=async path=>{const s=await lstat(path);return {directory:s.isDirectory(),file:s.isFile(),symbolic:s.isSymbolicLink(),resolved:await realpath(path)};}}={}){
 for(const [sub,expected]of Object.entries(STAGE_LAYOUT)){
  const path=sub?resolve(stage,sub):stage,m=await metadata(path);assert.ok(m.directory&&!m.symbolic&&m.resolved.toLowerCase()===path.toLowerCase());assert.deepEqual((await list(path)).sort(),expected);
  for(const name of expected){const p=resolve(path,name),s=await metadata(p);assert.ok(!s.symbolic&&s.resolved.toLowerCase()===p.toLowerCase());assert.equal(s.directory,sub===''&&['chromium','core'].includes(name));assert.equal(s.file,!(sub===''&&['chromium','core'].includes(name)));}
 }
}
function exact(value,keys){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value),keys);return value;}
const wire=value=>Buffer.from(JSON.stringify(value));
export function validateStartupAck(ack,start,readySha){
 exact(ack,['schema','readySha256','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime','baseline','baselineHash']);assert.equal(ack.schema,'native-console-ack/v1');assert.equal(ack.readySha256,readySha);
 for(const key of ['freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime'])assert.equal(ack[key],start[key]);
 const b=exact(ack.baseline,['schema','node','console','baselineHash']);assert.equal(b.schema,'native-console-baseline/v1');
 const encoding='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1';
 function identity(v,path){exact(v,['pid','creationFiletime','imagePathSha256','imagePathHashEncoding']);assert.ok(Number.isSafeInteger(v.pid)&&v.pid>0&&v.pid<=0xffffffff);assert.ok(typeof v.creationFiletime==='string'&&/^[1-9][0-9]{0,19}$/u.test(v.creationFiletime)&&BigInt(v.creationFiletime)<(1n<<64n));assert.equal(v.imagePathHashEncoding,encoding);assert.equal(v.imagePathSha256,sha(encoding+'\0'+path));}
 identity(b.node,'c:\\program files\\nodejs\\node.exe');assert.equal(b.node.pid,start.originalNodePid);assert.equal(b.node.creationFiletime,start.originalNodeCreationFiletime);
 if(b.console!==null){identity(b.console,'c:\\windows\\system32\\conhost.exe');assert.notEqual(b.console.pid,b.node.pid);}
 assert.equal(b.baselineHash,digest({schema:b.schema,node:b.node,console:b.console}));assert.equal(ack.baselineHash,b.baselineHash);return ack;
}
export function drainRequest(index,variant,start,readySha,startupAckSha,baselineHash){
 assert.ok(index===1||index===2);
 return {schema:'baselined-startup-drain-request/v1',variantIndex:index,variantHash:digest(variant),readySha256:readySha,startupAckSha256:startupAckSha,freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,baselineHash,originalNodePid:start.originalNodePid,originalNodeCreationFiletime:start.originalNodeCreationFiletime};
}
export function validateDrainAck(value,request,requestSha){
 const expected={schema:'baselined-startup-drain-ack/v1',requestSha256:requestSha,variantIndex:request.variantIndex,freezeSha256:request.freezeSha256,sourceHashesHash:request.sourceHashesHash,readySha256:request.readySha256,startupAckSha256:request.startupAckSha256,baselineHash:request.baselineHash,originalNodePid:request.originalNodePid,originalNodeCreationFiletime:request.originalNodeCreationFiletime,browserResidualAbsent:true};
 assert.deepEqual(value,expected);assert.deepEqual(Object.keys(value),Object.keys(expected));return value;
}
export async function awaitMetadata(read,until,{clock=()=>performance.now(),guard=()=>{},wait=pause}={}){
 while(true){guard();assert.ok(clock()<until);let bytes;
  try{bytes=await read();}catch(error){if(error.code!=='ENOENT')throw error;}
  guard();assert.ok(clock()<until);if(bytes!==undefined)return bytes;await wait(25);
 }
}
export async function admitStartup({ackBytes,start,readySha,until,action,clock=()=>performance.now()}){
 assert.ok(clock()<until);const ack=validateStartupAck(strict(ackBytes),start,readySha);assert.ok(clock()<until);
 return {ack,value:await action()};
}
async function publish(name,value){
 const bytes=wire(value);assert.ok(bytes.length<=65536);const pending=resolve(OUTPUT,name+'.pending'),final=resolve(OUTPUT,name+'.json');
 const out=await open(pending,'wx');try{await out.writeFile(bytes);await out.sync();}finally{await out.close();}await link(pending,final);return sha(bytes);
}
export const FIXED_BROWSER_PATHS=Object.freeze(['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']);
export async function resolveFixedBrowser({resolvePath=resolve,inspect=lstat,real=realpath}={}){
 for(const literal of FIXED_BROWSER_PATHS){
  const fixed=resolvePath(literal);let info;
  try{info=await inspect(fixed);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  assert.ok(info.isFile()&&!info.isSymbolicLink());
  assert.equal((await real(fixed)).toLowerCase(),fixed.toLowerCase());return fixed;
 }
 throw Error('Fixed browser unavailable');
}
const PRELUDE_STAGES=Object.freeze(['coordinator-import','staging-recheck','fixed-browser-resolver','maintained-client-import']);
export function createPrelude(onRecord=()=>{},guard=()=>{}){
 const rows=[];let next=0,busy=false,failed=false;
 function emit(stage,event){assert.ok(rows.length<8);const row=Object.freeze({schema:'baselined-startup-prelude/v1',stage,event});rows.push(row);onRecord(row);}
 return Object.freeze({async step(stage,action){
  assert.ok(!busy&&!failed&&stage===PRELUDE_STAGES[next]&&typeof action==='function');guard();busy=true;
  try{emit(stage,'before');const value=await action();guard();emit(stage,'after');next++;return value;}
  catch(error){failed=true;throw error;}finally{busy=false;}
 },snapshot:()=>Object.freeze([...rows])});
}
async function runDev(){
 assert.equal(process.platform,'win32');assert.equal(process.env.MURMINGLE_INTERNAL_TARGET_LIFECYCLE_V1_SUPERVISED,'1');const launched=performance.now(),until=launched+175000;
 const guard=()=>{assert.ok(performance.now()<until);};const timer=setTimeout(()=>{console.error('Child deadline.');process.exit(1);},175000);
 try{
  let input='';for await(const part of process.stdin){input+=part;assert.ok(Buffer.byteLength(input)<=4096);guard();}
  const lines=input.split('\n');assert.equal(lines.length,3);assert.equal(lines[0],'INTERNAL_TARGET_LIFECYCLE_JOB_ASSIGNED_V1');assert.equal(lines[2],'');
  const start=exact(strict(Buffer.from(lines[1])),['schema','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime']);assert.equal(start.schema,'native-console-start/v1');assert.equal(start.originalNodePid,process.pid);
  const freezeBytes=await checked(resolve(HERE,'freeze.json'),65536),initial=await inspectSources();guard();const f=validateFreeze(strict(freezeBytes),initial.sourceHashes);
  assert.equal(sha(freezeBytes),start.freezeSha256);assert.equal(digest(initial.sourceHashes),start.sourceHashesHash);
  const ready={schema:'native-console-ready/v1',freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baselineHash:'pending'};
  const readySha=await publish('ready',ready),ackUntil=performance.now()+5000;
  const ackBytes=await awaitMetadata(()=>checked(resolve(OUTPUT,'ack.json'),65536),ackUntil,{guard});const startupAckSha=sha(ackBytes);
  // Source/freeze authentication above precedes ALL old-module/client/stage actions.
  const prelude=createPrelude(row=>process.stdout.write(JSON.stringify(row)+'\n'),guard);
  const {ack,value:old}=await admitStartup({ackBytes,start,readySha,until:ackUntil,action:()=>prelude.step('coordinator-import',()=>import(new URL('./observed-variant.mjs',import.meta.url).href))});terminalProjector=old.projectFatal;guard();
  const stage=resolve(OUTPUT,'staged-extension');
  async function recheck(){
   await checkStageLayout(stage);guard();
   for(const [target,source]of Object.entries(old.STAGE_FILES)){assert.equal(sha(await checked(resolve(stage,target))),initial.sourceHashes[source]);assert.equal(sha(await checked(resolve(REPO,source))),initial.sourceHashes[source]);guard();}
   await checkStageLayout(stage);guard();
   assert.deepEqual((await inspectSources()).sourceHashes,initial.sourceHashes);assert.deepEqual(await checked(resolve(HERE,'freeze.json'),65536),freezeBytes);guard();
  }
  await prelude.step('staging-recheck',async()=>{
   await mkdir(stage);await mkdir(resolve(stage,'chromium'));await mkdir(resolve(stage,'core'));
   for(const [target,source]of Object.entries(old.STAGE_FILES)){const bytes=await checked(resolve(REPO,source));assert.equal(sha(bytes),initial.sourceHashes[source]);const file=await open(resolve(stage,target),'wx');try{await file.writeFile(bytes);}finally{await file.close();}guard();}
   await recheck();
  });
  const executablePath=await prelude.step('fixed-browser-resolver',()=>resolveFixedBrowser());guard();
  const {chromium}=await prelude.step('maintained-client-import',()=>import(pathToFileURL(resolve(PACKAGE_ROOT,'index.mjs')).href));guard();
  const trace=old.createStartupTrace(row=>process.stdout.write(JSON.stringify({schema:'baselined-startup-operation/v1',...row})+'\n')),variants=[],drainPairs=[];
  for(const [offset,variant]of ['block','allow'].entries()){
   const index=offset+1;await recheck();guard();await publish('variant-'+index+'.started',{schema:'baselined-startup-variant-started/v1',variantIndex:index,freezeSha256:start.freezeSha256});guard();
   const result=await old.runStartupVariant({chromium,executablePath,stagedExtensionPath:stage,variant,trace,guard,onObservation:row=>process.stdout.write(JSON.stringify(row)+'\n')});guard();
   assert.equal(result.physicalOperationsDrained,true);assert.equal(result.callbacksDrained,true);assert.equal(result.pending,0);variants.push(result);await recheck();
   await publish('variant-'+index+'.result',result);const request=drainRequest(index,result,start,readySha,startupAckSha,ack.baselineHash),requestSha=await publish('drain-'+index+'.request',request);
   const drainUntil=performance.now()+15000,drainAckBytes=await awaitMetadata(()=>checked(resolve(OUTPUT,'drain-'+index+'.ack.json'),65536),drainUntil,{guard});
   validateDrainAck(strict(drainAckBytes),request,requestSha);assert.ok(performance.now()<drainUntil);guard();drainPairs.push({requestSha256:requestSha,ackSha256:sha(drainAckBytes),variantHash:request.variantHash});
  }
  await recheck();const result={schema:'baselined-extension-startup-result/v1',status:'complete',freezeHash:f.freezeHash,freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,readySha256:readySha,startupAckSha256:startupAckSha,baselineHash:ack.baselineHash,variants,drainPairs,trace:trace.snapshot(),sourceHashesRechecked:true,stageBytesRechecked:true,publicNavigations:0,observations:0,modelCalls:0,rawInputPersisted:false,completeOsEgressIsolation:false,productionValidated:false,assignmentAuthority:false};
  await publish('result',result);await publish('completion',{schema:'baselined-startup-complete/v1',freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,readySha256:readySha,startupAckSha256:startupAckSha,baselineHash:ack.baselineHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,resultSha256:digest(result),drainPairs});guard();
 }finally{clearTimeout(timer);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('Inert. Separate review and phase permission required.');
 else if(process.argv.length===3&&process.argv[2]==='--run-dev')await runDev().catch(error=>{const fault=terminalProjector?terminalProjector(error):{errorClass:'unclassified-fatal',code:'unclassified-fatal'};process.stderr.write(JSON.stringify({schema:'observed-startup-terminal/v1',...fault})+'\n');process.exitCode=1;});
 else throw Error('Fixed CLI only');
}




