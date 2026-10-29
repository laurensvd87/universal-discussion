// Separate local sentence-similarity encoder DEV. No live E5 replacement,
// provider requests, new public captures, old TEST reuse or registry writes.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {AUTOMATIC_TOPIC_DEVELOPMENT as FIRST,AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT as EXTRA} from './automatic-topic-development-corpus.js';
import {AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT as PROBES} from './automatic-topic-comparison-corpus.js';
import {developmentEventPairMetrics} from './run-automatic-topic-comparison.js';
import {createParaphraseDevelopmentEncoder,PARAPHRASE_REVISION} from '../experiments/automatic-topic-discovery-v1/paraphrase.js';
import {compareDiscoveryStrategies} from '../experiments/automatic-topic-discovery-v1/strategies.js';

const D='apps/local-service/data/',OUTPUT=D+'automatic-topic-paraphrase-development-20261029';
const MORE=[
 'apps/local-service/harness/run-automatic-topic-paraphrase.js','apps/local-service/harness/run-automatic-topic-comparison.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/strategies.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/strategies.test.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/paraphrase.js',
 'apps/local-service/experiments/topic-encoder/e5-infer.js',
];
const flags={developmentOnly:true,liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false,ownerContentSent:false};
let used=false;
export async function compareAutomaticTopicParaphrase(){
 need(arguments.length===0&&!used);used=true;
 const ledger=[],first=await json(D+'automatic-topic-development-capture-20261029/result.json',{sha256:'b979b37197ba0cb231e04862e601ab174c09a9b1358139aa1afe499601297de0'},ledger),
  extra=await json(D+'automatic-topic-development-additional-capture-20261029/result.json',{sha256:'e3972b02513a973362d5ba92cc99ce7c5e83e0f5062d623c8d8a1e856cddd2f9'},ledger),
  hard=await json(D+'automatic-topic-comparison-development-capture-20261029/result.json',{sha256:'26b065a8dfdb384cccb078862f348291523b41c18bc9be556609307911f5999e'},ledger),
  baseline=await json(D+'automatic-topic-comparison-features-20261029/result.json',{sha256:'104491a7a48afb7979cceefa2dec95ce15e92e8332f3cd3f251457241c78c39c'},ledger),
  assets=await json(D+'automatic-topic-paraphrase-assets-20261029/result.json',null,ledger);
 need([first,extra,hard,baseline].every(r=>r.status==='completed'&&r.endPinsChecked)&&baseline.encoderClosed&&assets.status==='verified'&&assets.revision===PARAPHRASE_REVISION);
 const all=[...first.rows,...extra.rows,...hard.rows],available=all.filter(r=>r.status==='available'),gold=new Map([...FIRST,...EXTRA,...PROBES].map(p=>[p.id,p]));
 need(all.length===22&&available.length===12&&baseline.casePins.length===12);
 for(let i=0;i<hard.rows.length;i++)need(hard.rows[i].id===PROBES[i].id&&hard.rows[i].url===PROBES[i].url);
 for(const row of available){need(gold.get(row.id)?.url===row.url&&sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256);}
 const base=await checkAutomaticTopicDevelopmentSource(),sources=[...base.sourcePins,...await pins(MORE)],files=sources.map(p=>p.file);need(new Set(files).size===files.length);
 const protocol={encoder:'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',revision:PARAPHRASE_REVISION,
  maximumTokens:128,prefix:'',pooling:'attention-masked mean, L2 normalized',views:['title','title-and-512-character-lead'],
  diagnosticThresholds:[.5,.6,.7,.8,.9],margin:.01,methods:['incremental-complete-link','incremental-centroid','threshold-connected-components'],
  dates:'No gold, visit or publication dates used by this numeric screen. All declared failures retained.',
  thresholds:'Fixed grid declared before inference; not a selected production policy or a reused E5/Related cutoff.'};
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{protocol,sourcePins:sources,inputPins:ledger,assetInventory:assets.inventory,...flags});
 const started=performance.now(),features=[],casePins=[],outcomes=[];let encoder=null,encoderClosed=false,closeReceipt=null,failure=null,endPinsChecked=false;
 try{
  encoder=await createParaphraseDevelopmentEncoder();
  for(const row of all){
   if(row.status==='unavailable'){outcomes.push({id:row.id,status:row.status,reason:row.reason});continue;}
   const at=performance.now(),title=await encoder.embed(row.title),titleLead=await encoder.embed((row.title+'\n'+row.text.slice(0,512)).slice(0,4096));
   const feature={id:row.id,sourceInputHash:row.sourceInputHash,bodySha256:row.bodySha256,titleSha256:row.titleSha256,
    titleVector:title.vector,titleLeadVector:titleLead.vector,titleTokens:title.tokens,titleLeadTokens:titleLead.tokens,
    titleSampled:title.sampled,titleLeadSampled:titleLead.sampled,encoderElapsedMs:performance.now()-at};
   features.push(feature);casePins.push(await save(OUTPUT,row.id+'.json',feature));outcomes.push({id:row.id,status:'encoded',elapsedMs:feature.encoderElapsedMs});
  }
 }catch{failure={stage:'encoding-or-persistence',completed:features.length};}
 finally{if(encoder)try{closeReceipt=await encoder.close();encoderClosed=closeReceipt.closed;}catch{failure??={stage:'encoder-close'};}}
 const comparisons=[];
 if(!failure)try{
  for(const view of ['titleVector','titleLeadVector'])for(const threshold of protocol.diagnosticThresholds){
   const at=performance.now(),comparison=compareDiscoveryStrategies(JSON.stringify({observations:features.map(f=>({sourceId:f.id,vector:f[view]})),minimumSimilarity:threshold,minimumMargin:protocol.margin}));
   comparisons.push({view,threshold,elapsedMs:performance.now()-at,comparison,metrics:comparison.results.map(r=>({method:r.method,...developmentEventPairMetrics(r.groups,gold)}))});
  }
 }catch{failure??={stage:'strategy-comparison'};}
 try{await endPins(ledger,files,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'automatic-topic-paraphrase-development/v1',status:failure?'failed':'completed',failure,protocol,
  counts:{declared:all.length,encoded:features.length,unavailable:outcomes.filter(r=>r.status==='unavailable').length,notCompleted:all.length-outcomes.length},
  outcomes,casePins,comparisons,encoderClosed,closeReceipt,endPinsChecked,sourcePins:sources,inputPins:ledger,elapsedMs:performance.now()-started,
  note:'Same retained real DEV12 as E5. Model and title/lead representation differ. Dates/labels excluded from inference; all22 original outcomes retained. Not held-out quality, release, index or UI latency evidence.',...flags};
 return {status:result.status,counts:result.counts,encoderClosed,endPinsChecked,elapsedMs:result.elapsedMs,
  comparisons:comparisons.map(v=>({view:v.view,threshold:v.threshold,completeLink:v.metrics[0]})),result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--compare-development'){process.stderr.write('Explicit closed DEV comparison required; no action.\n');process.exitCode=2;}
 else try{const r=await compareAutomaticTopicParaphrase();process.stdout.write(JSON.stringify(r)+'\n');if(r.status!=='completed')process.exitCode=1;}
 catch{process.stderr.write('Paraphrase DEV comparison refused; no live state changed.\n');process.exitCode=1;}
}
