// Availability-only TEST support extension, declared before first predictions.
// No original outcome, model, acceptance minimum or TRAIN/CAL role is changed.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat} from 'node:fs/promises';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {ADDITIONAL_CHILD_TEST_PROBES as PROBES} from './hierarchy-child-additional-test-corpus.js';
import {createHierarchyChildAdditionalBoardTestCapture} from './hierarchy-public-capture.js';
import {checkFrozenChildDiversityCandidate,CHILD_DIVERSITY_SOURCE_FILES as SOURCES} from './run-hierarchy-child-diversity.js';
const D='apps/local-service/data/',OUTPUT=D+'hierarchy-child-additional-test-capture-20261029';
const CANDIDATE='51910413dfc66f93e802502483aa1597744cdf29a28adaa54f8a5098596fe54b',ORIGINAL='a85804ae9546e28a65828b32f177b810904040fd725255a67438ff61f6f3ce20';
const flags={encoderUsed:false,fittingExecuted:false,liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false,representativePopulation:false};
async function inputs(){
 const check=await checkFrozenChildDiversityCandidate(CANDIDATE),ledger=[...check.inputPins],base=await json(D+'hierarchy-child-diversity-test-20261029/result.json',{sha256:ORIGINAL},ledger);
 need(base.status==='completed'&&base.endPinsChecked&&base.fitSha===CANDIDATE&&base.counts.declared===11&&base.counts.available===10&&base.counts.unavailable===1);
 // This is an observed local lifecycle guard, not a claim about arbitrary
 // external processes. Root's tool record also has no candidate TEST inference.
 let absent=false;try{await lstat(new URL('../data/hierarchy-child-diversity-evaluation-20261029/',import.meta.url));}catch(e){need(e.code==='ENOENT');absent=true;}need(absent);
 return {ledger};
}
export async function checkAdditionalChildTestSource(){const data=await inputs();return {inputPins:data.ledger,sourcePins:await pins(SOURCES),probes:PROBES,
 reason:'Original Dixit observation unavailable; minimum2 insideGames negatives unchanged. Additional subjects declared before first predictions, original11 preserved.',evaluationDirectoryAbsent:true,...flags};}
let used=false;
export async function captureAdditionalChildTest(){
 need(!used);used=true;const data=await inputs(),sources=await pins(SOURCES);await directory(OUTPUT);const rows=[],casePins=[],started=performance.now();let capture=null,endPinsChecked=false,failure=null;
 try{
  await save(OUTPUT,'inputs.json',{candidateSha256:CANDIDATE,originalTestCaptureSha256:ORIGINAL,probes:PROBES,inputPins:data.ledger,sourcePins:sources,
   review:'Root-only primary publisher subject review; no independent reviewer acceptance',declaredBeforeFirstPredictions:true,maximumRequests:4,...flags});
  capture=createHierarchyChildAdditionalBoardTestCapture();for(const p of PROBES){const r=await capture.capture(p.id);need(r.id===p.id&&r.url===p.url);let row;
   if(r.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(r.reason));row={...p,status:'unavailable',reason:r.reason};}
   else{need(r.status==='available'&&r.text.length>=160&&r.text.length<=4096&&r.title.length<=200&&r.assignmentAuthority===false);
    row={...p,status:'available',title:r.title,text:r.text,extractorVersion:r.extractorVersion};
    for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(r[k]));row[k]=r[k];}
    need(sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256);
   }rows.push(row);casePins.push(await save(OUTPUT,p.id+'.json',row));
  }
 }catch{failure={stage:'capture-or-persistence',completed:rows.length};}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'child-additional-test-capture/v1',status:failure?'failed':'completed',failure,candidateSha256:CANDIDATE,originalTestCaptureSha256:ORIGINAL,rows,casePins,
  counts:{declared:2,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:2-rows.length},
  inputPins:data.ledger,sourcePins:sources,endPinsChecked,capture:capture?.snapshot()??null,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,counts:result.counts,result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);try{need(a.length===1&&['--source-check','--capture'].includes(a[0]));const result=await(a[0]==='--source-check'?checkAdditionalChildTestSource():captureAdditionalChildTest());
  process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;
 }catch{process.stderr.write('Additional child TEST refused; original observations retained.\n');process.exitCode=1;}
}
