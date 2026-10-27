// One fixed parser diagnosis, not a collection/quality retry. Import is inert.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {open,mkdir,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHierarchyChildDiagnosisCapture,HIERARCHY_CHILD_DIAGNOSIS_REASONS} from './hierarchy-public-capture.js';

const OUTPUT=new URL('../data/hierarchy-child-parser-diagnosis-20261027/',import.meta.url);
const PLAN=Object.freeze([
 Object.freeze({id:'child-train-01',url:'https://savethekoala.com/about-koalas/koalas-diet-digestion/'}),
 Object.freeze({id:'child-cal-01',url:'https://www.qld.gov.au/environment/plants-animals/animals/living-with/koalas/koala-information/koala-facts'}),
]);
const SOURCES=Object.freeze(['./run-hierarchy-child-diagnosis.js','./hierarchy-public-capture.js','../src/crawler/static-capture.js',
 '../src/crawler/public-fetch.js','../src/crawler/robots.js','../src/crawler/url-policy.js','./hierarchy-public-probes.js',
 './hierarchy-recipe-corpus.js','./hierarchy-gta-corpus.js','../../../spikes/topic-resolution/browser/core/page-content-policy.js',
 '../test/hierarchy-child-diagnosis.test.js','../test/hierarchy-public-capture.test.js','../test/crawler-static-capture.test.js']);
const LIMITS=Object.freeze({inputCharacters:2097153,tokens:100001,tags:100000,skipTags:100000,chromeTags:100000,hiddenTags:100000,preferredTags:100000,
 maximumStackDepth:256,maximumAttributeCount:129,maximumInterpretedAttributeSurface:16385,skippedTextCharacters:67108864,chromeTextCharacters:67108864,hiddenTextCharacters:67108864,
 titleBufferLength:600,preferredBufferLength:12288,fallbackBufferLength:12288,titleLength:200,extractedLength:4096});
const FAILURES=new Set(['document-input','unterminated-comment','unterminated-tag','attribute-count-limit','attribute-surface-limit','token-limit','stack-depth-limit']);
const reasons=new Set(HIERARCHY_CHILD_DIAGNOSIS_REASONS),sha=value=>createHash('sha256').update(value).digest('hex');
const refuse=()=>{throw new Error('Fixed child diagnosis unavailable');};
const need=value=>{if(!value)refuse();};
function record(value,keys){need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 need(Reflect.ownKeys(value).length===keys.length);const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'));result[key]=d.value;}return result;}
export function projectHierarchyChildDiagnosisRow(value,id){
 need(PLAN.some(row=>row.id===id));const row=record(value,['id','status','reason','parserDiagnostic']);
 need(row.id===id&&['diagnosed','unavailable'].includes(row.status)&&reasons.has(row.reason));let parserDiagnostic=null;
 if(row.parserDiagnostic!==null){
  const diagnostic=record(row.parserDiagnostic,['status','summary','failure']),summary=record(diagnostic.summary,[...Object.keys(LIMITS),'preferredSelected']);
  need(['eligible','insufficient-text','document-invalid'].includes(diagnostic.status)&&diagnostic.status===row.reason&&row.status==='diagnosed');
  need(diagnostic.status==='document-invalid'?FAILURES.has(diagnostic.failure):diagnostic.failure===null);
  for(const [key,limit]of Object.entries(LIMITS))need(Number.isSafeInteger(summary[key])&&summary[key]>=0&&summary[key]<=limit);
  if(diagnostic.status!=='document-invalid')need(diagnostic.status==='eligible'?summary.extractedLength>=160:summary.extractedLength<160);
  need(typeof summary.preferredSelected==='boolean');parserDiagnostic={status:diagnostic.status,summary,failure:diagnostic.failure};
 }else need(row.status==='unavailable'&&row.reason!=='eligible');
 return {id,status:row.status,reason:row.reason,parserDiagnostic};
}
async function boundedRead(url){const stat=await lstat(url);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=1048576);const fd=await open(url,'r');
 try{const initial=await fd.stat();need(initial.dev===stat.dev&&initial.ino===stat.ino&&initial.size===stat.size);const bytes=Buffer.alloc(stat.size+1);let used=0;
  while(used<bytes.length){const {bytesRead}=await fd.read(bytes,used,bytes.length-used,null);if(!bytesRead)break;used+=bytesRead;}
  const after=await fd.stat();need(used===stat.size&&after.size===initial.size&&after.mtimeMs===initial.mtimeMs&&after.ctimeMs===initial.ctimeMs);return bytes.subarray(0,used);
 }finally{await fd.close();}}
async function sourcePins(){const pins={};for(const name of SOURCES){const raw=await boundedRead(new URL(name,import.meta.url));pins[name]={bytes:raw.length,sha256:sha(raw)};}return pins;}
async function createOutput(){const directory=fileURLToPath(OUTPUT),parent=path.dirname(directory);
 for(let name=parent;;name=path.dirname(name)){const stat=await lstat(name);need(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(name)===name);if(path.dirname(name)===name)break;}
 await mkdir(OUTPUT);const stat=await lstat(OUTPUT);need(stat.isDirectory()&&!stat.isSymbolicLink());}
async function save(name,value){need(/^(?:inputs|end-pins|result|child-train-01|child-cal-01)\.json$/u.test(name));const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=65536);
 const fd=await open(new URL(name,OUTPUT),'wx');try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}return {file:name,bytes:raw.length,sha256:sha(raw)};}
const REAL={sourcePins,createOutput,save,createCapture:()=>createHierarchyChildDiagnosisCapture(),now:()=>performance.now()};
async function run(ports,testComposition){
 const pins=await ports.sourcePins();await ports.createOutput();const started=ports.now(),rows=[],casePins={};let capture=null,stage='inputs',currentId=null,failure=null,endPinsChecked=false,endPins=null,attempted=0;
 const remember=()=>{failure??={stage,currentId};};
 try{
  await ports.save('inputs.json',{schema:'hierarchy-child-diagnosis-inputs/v1',sourcePins:pins,sourcePinScope:'listed-thirteen-files-not-full-transitive-closure',plan:PLAN,
   limits:{requests:6,deadlineMs:240000,minimumSpacingMs:5000},testPermitted:false,availabilityAdoption:false});
  stage='capture-initialization';capture=ports.createCapture();
  for(const probe of PLAN){currentId=probe.id;stage='capture';attempted++;let row;
   try{row=projectHierarchyChildDiagnosisRow(await capture.capture(probe.id),probe.id);}catch{row={id:probe.id,status:'failed',reason:'capture-failed',parserDiagnostic:null};remember();}
   rows.push(row);stage='case-output';try{casePins[row.id]=await ports.save(row.id+'.json',row);}catch{remember();}if(failure)break;
  }
 }catch{remember();}
 for(const probe of PLAN.slice(rows.length))rows.push({id:probe.id,status:'not-attempted',reason:'prior-failure',parserDiagnostic:null});
 for(const row of rows)if(row.status==='not-attempted'){stage='suffix-output';currentId=row.id;try{casePins[row.id]=await ports.save(row.id+'.json',row);}catch{remember();}}
 stage='end-pins';currentId=null;try{endPins=await ports.sourcePins();need(JSON.stringify(endPins)===JSON.stringify(pins));endPinsChecked=true;}catch{remember();}
 try{await ports.save('end-pins.json',{sourcePins:endPins,endPinsChecked});}catch{remember();}
 let snapshot=null;stage='capture-snapshot';try{snapshot=capture?.snapshot()??null;}catch{remember();}
 const result={schema:'hierarchy-child-parser-diagnosis/v1',status:failure?'failed':'completed',failure,rows,casePins,sourcePins:pins,endPinsChecked,capture:snapshot,
  counts:{declared:2,attempted,diagnosed:rows.filter(row=>row.status==='diagnosed').length,unavailable:rows.filter(row=>row.status==='unavailable').length,
   failed:rows.filter(row=>row.status==='failed').length,notAttempted:rows.filter(row=>row.status==='not-attempted').length},elapsedMs:Math.max(0,ports.now()-started),
  scope:{publicStatic:!testComposition,testComposition,diagnosticOnly:true,availabilityAdoption:false,encoderUsed:false,fittingExecuted:false,testCaptured:false,
   ingestionExecuted:false,nativeObservation:false,productionValidated:false,assignmentAuthority:false,fullTransitivePins:false}};
 const output=await ports.save('result.json',result);return {status:result.status,counts:result.counts,result:output};
}
export async function runHierarchyChildDiagnosis(){need(arguments.length===0);return run(REAL,false);}
export async function runHierarchyChildDiagnosisForTest(value){const ports=record(value,Object.keys(REAL));need(Object.values(ports).every(value=>typeof value==='function'));return run(ports,true);}
export async function checkHierarchyChildDiagnosisSource(){const pins=await sourcePins();return {sourceFiles:Object.keys(pins).length,declared:2,maxRequests:6,testPermitted:false,outputCreated:false};}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||!['--source-check','--run'].includes(args[0]))return 2;
 try{const result=await(args[0]==='--source-check'?checkHierarchyChildDiagnosisSource():runHierarchyChildDiagnosis());process.stdout.write(JSON.stringify(result)+'\n');return result.status==='failed'?1:0;}
 catch{process.stderr.write('Fixed child diagnosis unavailable.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
