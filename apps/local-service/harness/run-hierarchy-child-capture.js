// Fixed public TRAIN/CAL collection only. Import is inert; no model or state ports.
import {createHash} from 'node:crypto';
import {readFile,mkdir,open,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHierarchyChildTrainCalCapture} from './hierarchy-public-capture.js';

const OUTPUT=new URL('../data/hierarchy-child-traincal-capture-20261027/',import.meta.url);
const CORPUS=new URL('./hierarchy-child-corpus.json',import.meta.url);
const SOURCES=Object.freeze([
 './run-hierarchy-child-capture.js','./hierarchy-child-corpus.json','./hierarchy-public-capture.js',
 '../src/crawler/public-fetch.js','../src/crawler/robots.js','../src/crawler/static-capture.js','../src/crawler/url-policy.js',
 './hierarchy-public-probes.js','./hierarchy-recipe-corpus.js','./hierarchy-gta-corpus.js',
 '../../../spikes/topic-resolution/browser/core/page-content-policy.js','../test/hierarchy-child-capture.test.js',
]);
const IDS=Object.freeze(['child-train-01','child-train-02',...Array.from({length:9},(_,i)=>'child-cal-'+String(i+1).padStart(2,'0'))]);
const HASH=/^[a-f0-9]{64}$/u,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const refuse=()=>{throw new Error('Fixed child capture refused');};
async function boundedRead(url,maximum=1048576){const handle=await open(url,'r');try{const buffer=Buffer.alloc(maximum+1);let used=0;while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,null);if(!bytesRead)break;used+=bytesRead;}if(used>maximum)refuse();return buffer.subarray(0,used);}finally{await handle.close();}}
async function sourcePins(){const result={};for(const name of SOURCES){const raw=await boundedRead(new URL(name,import.meta.url));result[name]={bytes:raw.length,sha256:sha(raw)};}return result;}
function planned(corpus){const rows=corpus.freshCandidates?.filter(r=>r.split==='training'||r.split==='calibration');if(!Array.isArray(rows)||rows.length!==11||rows.some((r,i)=>r.id!==IDS[i]||r.url!==corpus.freshCandidates.find(x=>x.id===r.id)?.url||r.collectorAttempted!==false))refuse();return rows;}
async function createOutput(){const directory=fileURLToPath(OUTPUT),parent=path.dirname(directory);for(let name=parent;;name=path.dirname(name)){const stat=await lstat(name);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(name)!==name)refuse();if(path.dirname(name)===name)break;}await mkdir(OUTPUT);const stat=await lstat(OUTPUT);if(!stat.isDirectory()||stat.isSymbolicLink())refuse();}
async function save(name,value){if(!/^(?:inputs|result|child-(?:train|cal)-\d{2})\.json$/u.test(name))refuse();const raw=Buffer.from(JSON.stringify(value)+'\n');if(raw.length>262144)refuse();const file=await open(new URL(name,OUTPUT),'wx');try{await file.writeFile(raw);await file.sync();}finally{await file.close();}return {file:name,bytes:raw.length,sha256:sha(raw)};}
function project(row,probe){
 if(!row||row.id!==probe.id||row.url!==probe.url)refuse();
 const base={id:probe.id,url:probe.url,split:probe.split,groupId:probe.groupId,labels:{...probe.labels},expectedRootId:probe.expectedRootId};
 if(row.status==='unavailable'){if(typeof row.reason!=='string'||!/^[a-z-]{1,48}$/u.test(row.reason))refuse();return {...base,status:'unavailable',reason:row.reason};}
 if(row.status!=='available'||typeof row.title!=='string'||row.title.length>200||typeof row.text!=='string'||row.text.length>4096||typeof row.extractorVersion!=='string'||row.extractorVersion.length>128)refuse();
 const result={...base,status:'available',title:row.title,text:row.text,extractorVersion:row.extractorVersion};
 for(const field of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){if(!HASH.test(row[field]))refuse();result[field]=row[field];}
 if(result.titleSha256!==sha(row.title)||result.bodySha256!==sha(row.text)||row.nativeObservation!==false||row.productionValidated!==false||row.assignmentAuthority!==false||row.provenance!=='fresh-public-crawler-static-html-paired-observation/v1')refuse();
 return {...result,provenance:row.provenance,nativeObservation:false,productionValidated:false,assignmentAuthority:false};
}
const REAL={sourcePins,readCorpus:async()=>JSON.parse(await boundedRead(CORPUS)),createOutput,save,createCapture:()=>createHierarchyChildTrainCalCapture(),now:()=>performance.now()};
async function run(ports,testComposition){
 const pins=await ports.sourcePins(),corpus=await ports.readCorpus(),probes=planned(corpus);await ports.createOutput();
 const started=ports.now(),rows=[],casePins={};let capture=null,stage='inputs',currentId=null,failure=null,attempted=0,endPinsChecked=false;
 const remember=()=>{failure??={stage,currentId};};
 try{
  await ports.save('inputs.json',{schema:'hierarchy-child-capture-inputs/v1',sourcePins:pins,sourcePinScope:'listed-twelve-files-not-full-transitive-closure',ids:IDS,probes,limits:{requests:34,deadlineMs:240000,minimumSpacingMs:5000},testPermitted:false});
  stage='capture-initialization';capture=ports.createCapture();
  for(const probe of probes){currentId=probe.id;stage='capture';attempted++;let row;
   try{row=project(await capture.capture(probe.id),probe);}catch{row={id:probe.id,url:probe.url,split:probe.split,groupId:probe.groupId,status:'failed',reason:'capture-failed'};remember();}
   rows.push(row);stage='case-output';try{casePins[probe.id]=await ports.save(probe.id+'.json',row);}catch{remember();}
   if(failure)break;
  }
 }catch{remember();}
 // Complete the roster in memory before any further fallible output operation.
 for(const probe of probes.slice(rows.length))rows.push({id:probe.id,url:probe.url,split:probe.split,groupId:probe.groupId,status:'not-attempted',reason:'prior-failure'});
 for(const row of rows)if(row.status==='not-attempted'){stage='suffix-output';currentId=row.id;try{casePins[row.id]=await ports.save(row.id+'.json',row);}catch{remember();}}
 stage='end-pins';currentId=null;try{const end=await ports.sourcePins();if(JSON.stringify(end)!==JSON.stringify(pins))refuse();endPinsChecked=true;}catch{remember();}
 let snapshot=null;stage='capture-snapshot';currentId=null;try{snapshot=capture?.snapshot()??null;}catch{remember();}
 const result={schema:'hierarchy-child-traincal-capture/v1',status:failure?'failed':'completed',failure,rows,casePins,
  counts:{declared:11,attempted,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,failed:rows.filter(r=>r.status==='failed').length,notAttempted:rows.filter(r=>r.status==='not-attempted').length},
  capture:snapshot,sourcePins:pins,endPinsChecked,elapsedMs:Math.max(0,ports.now()-started),
  scope:{publicStatic:!testComposition,testComposition,nativeObservation:false,encoderUsed:false,fittingExecuted:false,testCaptured:false,ingestionExecuted:false,productionValidated:false,assignmentAuthority:false,fullTransitivePins:false}};
 const output=await ports.save('result.json',result);return {status:result.status,counts:result.counts,result:output};
}
export async function runHierarchyChildCapture(){if(arguments.length)refuse();return run(REAL,false);}
export async function runHierarchyChildCaptureForTest(ports){if(!ports||Object.keys(REAL).some(k=>typeof ports[k]!=='function'))refuse();return run(ports,true);}
export async function checkHierarchyChildCaptureSource(){const pins=await sourcePins();const probes=planned(JSON.parse(await boundedRead(CORPUS)));return {sourceFiles:Object.keys(pins).length,declared:probes.length,testPermitted:false,outputCreated:false};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==1||!['--source-check','--run'].includes(args[0])){process.stderr.write('Use exactly --source-check or --run.\n');process.exitCode=2;}
 else try{const result=await (args[0]==='--source-check'?checkHierarchyChildCaptureSource():runHierarchyChildCapture());process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;}catch{process.stderr.write('Fixed child capture unavailable.\n');process.exitCode=1;}
}
