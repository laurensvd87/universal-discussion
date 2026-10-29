// Fixed six-page CAL-only recollection after a causal static-parser repair.
// No encoder, fit, database, TEST access or production registration.
import {createHash} from 'node:crypto';
import {open,lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHierarchyChildCalibrationRepairCapture} from './hierarchy-public-capture.js';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const OUTPUT='apps/local-service/data/hierarchy-child-calibration-parser-repair-20261029';
const CORPUS='apps/local-service/harness/hierarchy-child-corpus.json';
const IDS=Object.freeze(['child-cal-01','child-cal-02','child-cal-03','child-cal-04','child-cal-08','child-cal-09']);
const FILES=Object.freeze(['apps/local-service/harness/run-hierarchy-child-calibration-repair.js',CORPUS,
 'apps/local-service/harness/hierarchy-public-capture.js','apps/local-service/test/hierarchy-public-capture.test.js',
 'apps/local-service/src/crawler/public-fetch.js','apps/local-service/src/crawler/robots.js',
 'apps/local-service/src/crawler/static-capture.js','apps/local-service/src/crawler/url-policy.js',
 'apps/local-service/harness/hierarchy-public-probes.js','apps/local-service/harness/hierarchy-recipe-corpus.js',
 'apps/local-service/harness/hierarchy-gta-corpus.js','spikes/topic-resolution/browser/core/page-content-policy.js']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=v=>{if(!v)throw new Error('Fixed calibration capture refused');};
async function read(relative){
 const file=path.resolve(ROOT,relative),before=await lstat(file,{bigint:true});
 need(before.isFile()&&!before.isSymbolicLink()&&before.size>0n&&before.size<=1048576n&&(await realpath(file)).toLowerCase()===file.toLowerCase());
 const same=s=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]);
 const fd=await open(file,'r');try{
  need(same(await fd.stat({bigint:true})));const buffer=Buffer.alloc(Number(before.size)+1);let used=0;
  while(used<buffer.length){const step=await fd.read(buffer,used,buffer.length-used,used);if(!step.bytesRead)break;used+=step.bytesRead;}
  need(used===Number(before.size)&&same(await fd.stat({bigint:true}))&&same(await lstat(file,{bigint:true})));
  return buffer.subarray(0,used);
 }finally{await fd.close();}
}
async function pins(){const list=[];for(const file of FILES){const raw=await read(file);list.push({file,bytes:raw.length,sha256:sha(raw)});}return list;}
async function planned(){
 const raw=await read(CORPUS);need(raw.length===103445&&sha(raw)==='ba36c30292e56270e21d5f8f98fb01392e42dad44bdeda1ee5879f844a64a548');
 const corpus=JSON.parse(raw);return IDS.map(id=>{const rows=corpus.freshCandidates.filter(r=>r.id===id);need(rows.length===1&&rows[0].split==='calibration'&&new URL(rows[0].url).origin==='https://www.qld.gov.au');return rows[0];});
}
async function save(name,value){
 need(/^(inputs|result|child-cal-(01|02|03|04|08|09))\.json$/u.test(name));
 const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=262144);
 await writeFile(path.join(ROOT,OUTPUT,name),raw,{flag:'wx'});return {file:name,bytes:raw.length,sha256:sha(raw)};
}
function project(probe,row){
 need(row.id===probe.id&&row.url===probe.url);
 const base={id:probe.id,url:probe.url,groupId:probe.groupId,split:probe.split,labels:probe.labels,expectedRootId:probe.expectedRootId};
 if(row.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(row.reason));return {...base,status:row.status,reason:row.reason};}
 need(row.status==='available'&&typeof row.text==='string'&&row.text.length>=160&&row.text.length<=4096&&typeof row.title==='string'&&row.title.length<=200);
 need(row.nativeObservation===false&&row.productionValidated===false&&row.assignmentAuthority===false);
 const result={...base,status:row.status,title:row.title,text:row.text,extractorVersion:row.extractorVersion,provenance:row.provenance};
 for(const key of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(row[key]));result[key]=row[key];}
 need(result.titleSha256===sha(result.title)&&result.bodySha256===sha(result.text));
 return {...result,nativeObservation:false,productionValidated:false,assignmentAuthority:false};
}
export async function checkHierarchyCalibrationRepair(){return {sourcePins:await pins(),probes:await planned(),testPermitted:false,networkUsed:false};}
let used=false;
export async function runHierarchyCalibrationRepair(){
 need(arguments.length===0&&!used);used=true;const sources=await pins(),probes=await planned(),directory=path.join(ROOT,OUTPUT);
 for(let p=path.dirname(directory);;p=path.dirname(p)){const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());if(path.dirname(p)===p)break;}
 await mkdir(directory);const started=performance.now(),rows=[],casePins=[];let failure=null,capture=null,endPinsChecked=false;
 try{
  await save('inputs.json',{schema:'child-calibration-parser-repair-inputs/v1',sourcePins:sources,sourcePinScope:'twelve-listed-files-not-full-runtime-closure',probes,
   priorFailuresPreserved:true,limits:{requests:8,deadlineMs:240000,spacingMs:5000},testPermitted:false});
  capture=createHierarchyChildCalibrationRepairCapture();
  for(const probe of probes){const row=project(probe,await capture.capture(probe.id));rows.push(row);casePins.push(await save(probe.id+'.json',row));}
 }catch{failure={stage:'capture-or-persistence',completedRows:rows.length};}
 try{need(JSON.stringify(await pins())===JSON.stringify(sources));endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'child-calibration-parser-repair/v1',status:failure?'failed':'completed',failure,rows,casePins,sourcePins:sources,endPinsChecked,
  counts:{declared:6,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:6-rows.length},
  capture:capture?.snapshot()??null,elapsedMs:performance.now()-started,
  encoderUsed:false,fittingExecuted:false,testCaptured:false,liveChanged:false,assignmentAuthority:false,independentValidation:false};
 const pin=await save('result.json',result);return {status:result.status,counts:result.counts,result:pin};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv.slice(2);if(mode.length!==1||!['--source-check','--run'].includes(mode[0]))process.exitCode=2;
 else try{const result=await(mode[0]==='--run'?runHierarchyCalibrationRepair():checkHierarchyCalibrationRepair());process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;}
 catch{process.stderr.write('Fixed calibration capture unavailable.\n');process.exitCode=1;}
}
