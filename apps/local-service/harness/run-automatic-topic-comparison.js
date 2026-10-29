// Offline local E5 DEV comparison. No network, provider, SQL, Source ingestion or
// registry publication. Imported comparison code never receives gold annotations.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {AUTOMATIC_TOPIC_DEVELOPMENT,AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT} from './automatic-topic-development-corpus.js';
import {AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT as PROBES,AUTOMATIC_TOPIC_COMPARISON_PROTOCOL as PROTOCOL} from './automatic-topic-comparison-corpus.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compilePairedE5Input,applyPairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {compareDiscoveryStrategies} from '../experiments/automatic-topic-discovery-v1/strategies.js';

const D='apps/local-service/data/',OUTPUT=D+'automatic-topic-comparison-features-20261029';
const MORE=[
 'apps/local-service/harness/run-automatic-topic-comparison.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/strategies.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/strategies.test.js',
];
const flags={developmentOnly:true,liveChanged:false,assignmentAuthority:false,independentValidation:false,
 representativePopulation:false,productionValidated:false,goldEventDatesUsedAsInputs:false};
const metric=(groups,gold)=>{
 const memberships=new Map(groups.flatMap((g,i)=>g.members.map(id=>[id,i]))),ids=[...memberships.keys()];
 const result={trueSameEventPairs:0,wrongMergedPairs:0,missedSameEventPairs:0,trueSeparatedPairs:0,wrongPairs:[],missedPairs:[]};
 for(let i=0;i<ids.length;i++)for(let j=0;j<i;j++){
  const a=ids[i],b=ids[j],same=gold.get(a)?.eventId!=null&&gold.get(a).eventId===gold.get(b)?.eventId,predicted=memberships.get(a)===memberships.get(b);
  if(predicted&&same)result.trueSameEventPairs++;else if(predicted){result.wrongMergedPairs++;result.wrongPairs.push([a,b]);}
  else if(same){result.missedSameEventPairs++;result.missedPairs.push([a,b]);}else result.trueSeparatedPairs++;
 }
 return result;
};
let used=false;
export async function encodeAndCompareAutomaticTopicDevelopment(expectedCaptureSha256){
 need(arguments.length===1&&!used&&typeof expectedCaptureSha256==='string'&&/^[a-f0-9]{64}$/u.test(expectedCaptureSha256));used=true;
 const ledger=[],capture=await json(D+'automatic-topic-comparison-development-capture-20261029/result.json',{sha256:expectedCaptureSha256},ledger),
  first=await json(D+'automatic-topic-development-capture-20261029/result.json',{sha256:'b979b37197ba0cb231e04862e601ab174c09a9b1358139aa1afe499601297de0'},ledger),
  extra=await json(D+'automatic-topic-development-additional-capture-20261029/result.json',{sha256:'e3972b02513a973362d5ba92cc99ce7c5e83e0f5062d623c8d8a1e856cddd2f9'},ledger);
 need(capture.schema==='automatic-topic-comparison-development-capture/v1'&&capture.status==='completed'&&capture.endPinsChecked&&capture.rows.length===12&&capture.profileRemoved&&capture.browser.ownedExited&&capture.assignmentAuthority===false);
 need(first.status==='completed'&&extra.status==='completed'&&first.endPinsChecked&&extra.endPinsChecked);
 for(let i=0;i<PROBES.length;i++)need(capture.rows[i].id===PROBES[i].id&&capture.rows[i].url===PROBES[i].url);
 const all=[...first.rows,...extra.rows,...capture.rows],gold=new Map([...AUTOMATIC_TOPIC_DEVELOPMENT,...AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT,...PROBES].map(p=>[p.id,p]));
 need(all.length===22&&new Set(all.map(r=>r.id)).size===22);
 const base=await checkAutomaticTopicDevelopmentSource(),sources=[...base.sourcePins,...await pins(MORE)],files=sources.map(p=>p.file);
 need(new Set(files).size===files.length);
 const definition=await json('apps/local-service/assets/hierarchy/input-definition.json',null,ledger),fusion=compilePairedE5Input(definition),representation=describePairedE5Input(fusion);
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{captureSha256:expectedCaptureSha256,sourcePins:sources,inputPins:ledger,protocol:PROTOCOL,representation,...flags});
 const started=performance.now(),features=[],casePins=[],outcomes=[];let encoder=null,encoderClosed=false,failure=null,endPinsChecked=false;
 try{
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'});
  for(const row of all){
   if(row.status==='unavailable'){outcomes.push({id:row.id,status:row.status,reason:row.reason});continue;}
   need(row.status==='available'&&typeof row.text==='string'&&row.text.length>=160&&row.text.length<=4096&&typeof row.title==='string'&&row.title.length<=200&&sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256);
   const at=performance.now(),body=await encoder.embed(row.text),title=await encoder.embed(row.title);need(body.modelId===title.modelId);
   const fused=applyPairedE5Input(fusion,{sourceId:row.id,sourceVersion:row.sourceInputHash,bodyVector:body.values,titleVector:title.values});
   const feature={id:row.id,sourceInputHash:row.sourceInputHash,bodySha256:row.bodySha256,titleSha256:row.titleSha256,
    representationHash:representation.representationHash,bodyVector:body.values,titleVector:title.values,pairedVector:fused.vector,
    // Only the current capture's metadata is retained. No joining later metadata
    // onto old Source witnesses, and no use of visit/gold time as publication.
    publication:row.publication??null,observedAt:row.observedAt,encoderElapsedMs:performance.now()-at};
   features.push(feature);outcomes.push({id:row.id,status:'encoded',encoderElapsedMs:feature.encoderElapsedMs});
   casePins.push(await save(OUTPUT,row.id+'.json',feature));
  }
 }catch{failure={stage:'encoding-or-persistence',completed:features.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 const comparisons=[];
 if(!failure)try{
  for(const view of ['pairedVector','bodyVector','titleVector']){
   const observations=features.map(f=>({sourceId:f.id,vector:f[view]})),raw=JSON.stringify({observations,minimumSimilarity:PROTOCOL.threshold,minimumMargin:PROTOCOL.margin}),timings=[];
   const comparison=compareDiscoveryStrategies(raw);
   for(let i=0;i<100;i++){const at=performance.now();compareDiscoveryStrategies(raw);timings.push(performance.now()-at);}timings.sort((a,b)=>a-b);
   comparisons.push({view,comparison,metrics:comparison.results.map(r=>({method:r.method,...metric(r.groups,gold)})),
    timing:{repetitions:100,threeMethodsPerRepetition:true,p50Ms:timings[49],p95Ms:timings[94],maximumMs:timings[99]}});
  }
 }catch{failure??={stage:'strategy-comparison'};}
 try{await endPins(ledger,files,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'automatic-topic-discovery-method-development-comparison/v1',status:failure?'failed':'completed',failure,
  counts:{declared:all.length,encoded:features.length,unavailable:outcomes.filter(r=>r.status==='unavailable').length,notCompleted:all.length-outcomes.length},
  outcomes,casePins,comparisons,representation,sourcePins:sources,inputPins:ledger,encoderClosed,endPinsChecked,elapsedMs:performance.now()-started,
  note:'Three clustering strategies over three views on DEV only. Temporal evidence is retained, not yet a matching input. Roundups/profiles have no single event gold; ceremony is distinct from announcement. No votes/publication/ancestry authority.',...flags};
 return {status:result.status,counts:result.counts,encoderClosed,endPinsChecked,
  comparisons:comparisons.map(v=>({view:v.view,metrics:v.metrics.map(({wrongPairs,missedPairs,...m})=>m),timing:v.timing})),result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=='--encode-captured'){process.stderr.write('Explicit closed captured-input comparison required; no action.\n');process.exitCode=2;}
 else try{const r=await encodeAndCompareAutomaticTopicDevelopment(process.argv[3]);process.stdout.write(JSON.stringify(r)+'\n');if(r.status!=='completed')process.exitCode=1;}
 catch{process.stderr.write('Automatic topic comparison refused; no live state changed.\n');process.exitCode=1;}
}
