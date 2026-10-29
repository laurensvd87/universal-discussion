// One fixed PUBLIC metadata API request. No local inventory, Source content,
// account/token, provider AI, page fetch, ontology import or live DB mutation.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,readBenchmarkJson as json,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {WIKI_ENTITY_PILOT as CASES} from './wiki-entity-subject-pilot.js';
import {createWikipediaEntitySubjectIndex} from '../experiments/automatic-topic-discovery-v1/wiki-entity-subjects.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),OUTPUT='apps/local-service/data/wiki-entity-subject-pilot-20261029';
const SOURCES=['apps/local-service/harness/run-wiki-entity-subject-pilot.js','apps/local-service/harness/wiki-entity-subject-pilot.js',
 'apps/local-service/harness/hierarchy-benchmark-files.js','apps/local-service/experiments/automatic-topic-discovery-v1/wiki-entity-subjects.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/wiki-entity-subjects.test.js'];
const flags={liveChanged:false,assignmentAuthority:false,registryChanged:false,ownerInventorySent:false,sourceContentSent:false,
 sourceCaptureProven:false,ontologyImported:false,encoderOpened:false,independentReview:false,developmentOnly:true};
let used=false;
export async function runWikiEntitySubjectPilot(){
 need(arguments.length===0&&!used);used=true;const sourcePins=await pins(SOURCES),ledger=[];
 const policy=await json('apps/local-service/experiments/automatic-topic-discovery-v1/focus-policy.json',null,ledger);
 const algorithm=await pins([policy.algorithm.file]);need(algorithm[0].sha256===policy.algorithm.sha256&&algorithm[0].bytes===policy.algorithm.bytes&&policy.liveApproved===false);
 const url=new URL('https://www.wikidata.org/w/api.php');
 for(const [key,value]of Object.entries({action:'wbgetentities',format:'json',formatversion:'2',ids:CASES.map(c=>c.id).join('|'),
  props:'info|labels|descriptions|sitelinks',languages:'en|de|nl|mul',sitefilter:'enwiki|dewiki|nlwiki',maxlag:'5'}))url.searchParams.set(key,value);
 const protocol={maximumRequests:1,timeoutMs:15000,maximumResponseBytes:1048576,redirects:false,cookies:false,
  endpoint:url.href,cases:CASES,languages:['en','de','nl'],
  review:'Public primary descriptions/snippets were reviewed before declaration. Exact Wikipedia URLs were declared before this API response, not generated as gold from the returned sitelinks.',
  scope:'Provider-metadata/URL identity screen. No Wikipedia article content, actual Source witness, general-page linking, taxonomy or public registry acceptance.',
  literalPolicy:'Frozen and unchanged. Its independent-publisher requirement cannot supply shared proposals for Wikipedia-only evidence; no E5 comparison was fabricated using title metadata.'};
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,protocol,...flags});
 const started=performance.now(),rows=[];let requests=0,failure=null,responsePin=null,index=null,endPinsChecked=false,lookupTiming=null,httpStatus=null;
 try{
  requests++;const response=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(protocol.timeoutMs),
   headers:{'Accept':'application/json','User-Agent':'MurmingleDevelopment/0.1 (https://github.com/laurensvd87/universal-discussion)'}});
  httpStatus=response.status;if(response.status!==200||!response.body||!(response.headers.get('content-type')??'').toLowerCase().includes('application/json')){await response.body?.cancel();throw Error('public-metadata-unavailable');}
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.byteLength;need(bytes<=protocol.maximumResponseBytes);chunks.push(chunk);}
  const raw=Buffer.concat(chunks,bytes),text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  await fs.writeFile(path.join(ROOT,OUTPUT,'response.json'),raw,{flag:'wx'});responsePin={file:'response.json',bytes:raw.length,sha256:sha(raw)};
  index=createWikipediaEntitySubjectIndex(text);const metadata=index.describe();
  need(metadata.entities.length+metadata.unavailable.length===CASES.length&&metadata.entities.every(e=>CASES.some(c=>c.id===e.id)));
  for(const c of CASES)for(const p of c.pages){const r=index.resolve(p.url,p.language);rows.push({id:c.id,language:p.language,url:p.url,status:r.status,
   observedEntityKey:r.entityKey,expectedEntityKey:'wikidata:'+c.id,passed:r.status==='resolved'&&r.entityKey==='wikidata:'+c.id,
   label:r.label??null,description:r.description??null,labelLanguage:r.labelLanguage??null,descriptionLanguage:r.descriptionLanguage??null});}
  const samples=[];for(let i=0;i<100;i++){const at=performance.now();for(const c of CASES)for(const p of c.pages)index.resolve(p.url,p.language);samples.push(performance.now()-at);}samples.sort((a,b)=>a-b);
  lookupTiming={repetitions:100,lookupsPerRepetition:24,p50BatchMs:samples[49],p95BatchMs:samples[94],maximumBatchMs:samples[99]};
 }catch{failure={stage:'metadata-or-evaluation',httpStatus};}
 try{await endPins(ledger,SOURCES,sourcePins);const current=await pins([policy.algorithm.file]);need(current[0].sha256===policy.algorithm.sha256);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'public-wiki-entity-subject-pilot/v1',status:failure?'failed':'completed',failure,protocol,requests,httpStatus,responsePin,metadata:index?.describe()??null,rows,
  counts:{declared:24,completed:rows.length,correct:rows.filter(r=>r.passed).length,unresolved:rows.filter(r=>r.status==='unresolved').length,wrongIdentity:rows.filter(r=>r.status==='resolved'&&!r.passed).length},
  lookupTiming,elapsedMs:performance.now()-started,sourcePins,inputPins:ledger,endPinsChecked,...flags};
 return {status:result.status,counts:result.counts,requests,responsePin,lookupTiming,endPinsChecked,result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--run-public-pilot'){process.stderr.write('Explicit fixed public metadata pilot required; no action.\n');process.exitCode=2;}
 else try{const r=await runWikiEntitySubjectPilot();process.stdout.write(JSON.stringify(r)+'\n');if(r.status!=='completed')process.exitCode=1;}
 catch{process.stderr.write('Public entity pilot refused; no live state changed.\n');process.exitCode=1;}
}
