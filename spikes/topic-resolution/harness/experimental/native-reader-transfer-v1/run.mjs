// Default inert. Only explicit reviewed preparation or an owned-Job handshake
// can enter a phase. No browser/client/model import occurs at module load.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath,writeFile,link} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {prepareNativeStudyFiles,loadNativeStudyPreparation,recheckNativeStudyPreparation,stageNativeExtension,verifyNativeAssets,
 HERE,OUTPUT,PACKAGE_ROOT,ASSET_ROOT} from './source-ledger.js';
import {FIXED_CASES} from './native-adapter.js';
import {resolveNativeStudyDns} from './dns-resolver.js';
import {captureNativeBrowserStudy} from './browser-capture.mjs';
import {runNativeRootStudy} from './study-runner.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const parse=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const pause=ms=>new Promise(yes=>setTimeout(yes,ms));
const HASH=/^[a-f0-9]{64}$/u;
function fail(){throw new Error('native-root-study-phase-failed');}
export function phaseFor(args){
 assert.ok(Array.isArray(args));if(args.length===0)return null;
 assert.equal(args.length,1);assert.ok(['--prepare-reviewed-study','--run-study'].includes(args[0]));return args[0];
}
export async function awaitNativeStartup({input=process.stdin,supervised=process.env.MURMINGLE_NATIVE_ROOT_TRANSFER_V1_SUPERVISED,
 schedule=setTimeout,cancel=clearTimeout}={}){
 assert.equal(supervised,'1');const expected=Buffer.from('NATIVE_ROOT_STUDY_JOB_ASSIGNED_V1\n','ascii');
 await new Promise((yes,no)=>{
  let wire=Buffer.alloc(0),finished=false,timer;
  const finish=error=>{if(finished)return;finished=true;if(timer!==undefined)cancel(timer);input.off('data',data);input.off('end',end);input.pause();error?no(error):yes();};
  const data=chunk=>{try{assert.ok(Buffer.isBuffer(chunk));wire=Buffer.concat([wire,chunk]);
   if(wire.length>expected.length||!wire.equals(expected.subarray(0,wire.length)))return finish(new Error('invalid-startup-handshake'));
   if(wire.length===expected.length)finish();
  }catch{finish(new Error('invalid-startup-handshake'));}};
  const end=()=>finish(new Error('missing-startup-handshake'));
  timer=schedule(()=>finish(new Error('startup-handshake-deadline')),5000);input.on('data',data);input.on('end',end);input.resume();
 });return true;
}
function exact(v,keys){assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Object.keys(v).sort(),[...keys].sort());}
export function nativeDrainRequest(capture,context){
 exact(capture,['captureHash','accounted','available','producerProfileHash']);
 assert.match(capture.captureHash,HASH);assert.equal(capture.accounted,32);assert.ok(Number.isSafeInteger(capture.available)&&capture.available>=0&&capture.available<=32);
 assert.equal(capture.producerProfileHash,context.profile.producerProfile.producerProfileHash);assert.match(context.freezeSha256,HASH);
 return Object.freeze({schema:'native-root-browser-drain-request/v1',freezeSha256:context.freezeSha256,captureHash:capture.captureHash,
  accounted:32,available:capture.available,producerProfileHash:capture.producerProfileHash});
}
export function validateNativeDrainAck(value,{requestSha256,originalNodePid,freezeSha256}){
 exact(value,['schema','requestSha256','originalNodePid','browserDescendantsAbsent','freezeSha256']);
 assert.equal(value.schema,'native-root-browser-drain-ack/v1');assert.equal(value.requestSha256,requestSha256);
 assert.equal(value.originalNodePid,originalNodePid);assert.equal(value.browserDescendantsAbsent,true);assert.equal(value.freezeSha256,freezeSha256);
 return Object.freeze({...value});
}
async function outputBytes(name,maximum){
 const path=resolve(OUTPUT,name),before=await lstat(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=maximum);
 assert.equal((await realpath(path)).toLowerCase(),path.toLowerCase());const b=await readFile(path),after=await lstat(path);
 assert.equal(b.length,before.size);assert.deepEqual([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);return b;
}
/** Publish complete metadata atomically and without overwriting any name. The
 * tiny owned pending hardlink is retained as evidence, not removed or reused. */
export async function publishNativeDrainRequest(b,{writePending=value=>writeFile(resolve(OUTPUT,'drain.request.pending'),value,{flag:'wx'}),
 publish=()=>link(resolve(OUTPUT,'drain.request.pending'),resolve(OUTPUT,'drain.request.json'))}={}){
 assert.ok(Buffer.isBuffer(b)&&b.length>0&&b.length<=4096);await writePending(b);await publish();
}
/** IO seams are trusted testing infrastructure, never page-supplied callbacks.
 * The real default reads only the fixed owned acknowledgement file. */
export async function awaitNativeBrowserDrain({request,guard,writeRequest,readAck,pause:wait=pause,clock=()=>performance.now(),originalNodePid=process.pid}){
 const requestBytes=Buffer.from(JSON.stringify(request)),requestSha256=sha(requestBytes),until=clock()+30000;
 guard();await writeRequest(requestBytes);guard();
 while(true){
  guard();if(clock()>=until)fail();let ackBytes;
  try{ackBytes=await readAck();}catch(e){if(e?.code!=='ENOENT')throw e;}
  if(ackBytes!==undefined){
   assert.ok(Buffer.isBuffer(ackBytes)&&ackBytes.length>0&&ackBytes.length<=4096);
   const ack=validateNativeDrainAck(parse(ackBytes),{requestSha256,originalNodePid,freezeSha256:request.freezeSha256});guard();
   return Object.freeze({requestSha256,ackSha256:sha(ackBytes),ack});
  }
  await wait(Math.max(1,Math.min(25,until-clock())));
 }
}
async function executable(){
 for(const path of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']){
  let s;try{s=await lstat(path);}catch(e){if(e?.code==='ENOENT')continue;throw e;}
  assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal((await realpath(path)).toLowerCase(),resolve(path).toLowerCase());return path;
 }fail();
}
export async function runStudy(){
 assert.equal(process.platform,'win32');assert.ok(/^D:/iu.test(HERE));await awaitNativeStartup();
 const started=performance.now(),until=started+1650000,controller=new AbortController();let drain=null,stage=null;
 const guard=()=>{if(controller.signal.aborted||performance.now()>=until)fail();};
 const timeout=setTimeout(()=>controller.abort(),1650000);
 try{
  const context=await loadNativeStudyPreparation({guard});guard();
  stage=await stageNativeExtension(context,{guard});
  const executablePath=await executable();guard();
  // Both ownership and the complete source/artifact freeze precede the first
  // maintained client import or external DNS/browser action.
  const {chromium}=await import(pathToFileURL(resolve(PACKAGE_ROOT,'index.mjs')).href);guard();
  const result=await runNativeRootStudy({cases:FIXED_CASES,goldCases:context.goldCases,producerProfile:context.profile.producerProfile,
   candidateHandle:context.candidateHandle,studyId:'native-root-study-'+randomUUID(),signal:controller.signal,guard,
   resolveDns:()=>resolveNativeStudyDns({guard,signal:controller.signal}),
   capture:options=>captureNativeBrowserStudy({...options,chromium,stagedExtensionPath:stage.path,executablePath}),
   assertBrowserDrained:async capture=>{
    assert.equal(drain,null);await stage.recheck();guard();const request=nativeDrainRequest(capture,context);
    drain=await awaitNativeBrowserDrain({request,guard,writeRequest:publishNativeDrainRequest,
     readAck:()=>outputBytes('drain.ack.json',4096)});guard();return true;
   },
   createEmbedder:async()=>{
    assert.ok(drain?.ack.browserDescendantsAbsent);await verifyNativeAssets(context,{guard,hashContents:false});guard();
    const {createPackagedCrawlerEmbedder}=await import('../../../../../apps/local-service/src/crawler/packaged-e5.js');guard();
    return createPackagedCrawlerEmbedder({assetRoot:ASSET_ROOT});
   },
   recheckAssetsAndSources:async()=>{await verifyNativeAssets(context,{guard});await stage.recheck();return recheckNativeStudyPreparation(context,{guard});},
   onProgress:event=>{guard();process.stdout.write(JSON.stringify({schema:'native-root-study-progress/v1',...event})+'\n');}
  });
  guard();assert.ok(drain);assert.equal(result.captureHash,parse(await outputBytes('drain.request.json',4096)).captureHash);
  await stage.recheck();await recheckNativeStudyPreparation(context,{guard});guard();
  const evidence={...result,freezeHash:context.freeze.freezeHash,freezeSha256:context.freezeSha256,protocolSha256:context.next.protocolSha256,
   artifactReuseReceiptSha256:context.artifactReuseReceiptSha256,sourceHashes:context.sourceHashes,artifactHashes:context.artifactHashes,
   drainRequestSha256:drain.requestSha256,drainAckSha256:drain.ackSha256,browserDrainAck:drain.ack,sourceHashesRechecked:true,
   assetHashesRechecked:true,stageBytesRechecked:true,elapsedMs:performance.now()-started};
  const b=Buffer.from(JSON.stringify(evidence));assert.ok(b.length>0&&b.length<=524288);guard();
  await writeFile(resolve(OUTPUT,'result.json'),b,{flag:'wx'});guard();return {status:'complete',feasibilityPassed:result.assessment.feasibilityGate.passed};
 }finally{clearTimeout(timeout);controller.abort();}
}
async function main(){
 const phase=phaseFor(process.argv.slice(2));if(phase===null){process.stdout.write('No action. Reviewed explicit preparation or supervised --run-study required.\n');return;}
 if(phase==='--prepare-reviewed-study'){assert.equal(process.platform,'win32');process.stdout.write(JSON.stringify(await prepareNativeStudyFiles())+'\n');return;}
 await runStudy();
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 // No unbounded native/provider messages or stacks reach retained study logs.
 const unexpected=()=>{process.stderr.write('{"schema":"native-root-study-failure/v1","reason":"unexpected-process-failure"}\n');process.exit(1);};
 process.once('uncaughtException',unexpected);process.once('unhandledRejection',unexpected);
 main().catch(()=>{process.stderr.write('{"schema":"native-root-study-failure/v1","reason":"phase-failed"}\n');process.exitCode=1;});
}
