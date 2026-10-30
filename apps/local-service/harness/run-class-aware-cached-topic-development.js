// Pure posthoc DEV: only cached kind metadata changes. All21 saved query vectors,
//24 descriptor vectors, names, cutoffs and grouping are unchanged. No model/SQL/HTTP.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {compileCachedSemanticTopicIndex as compileV2} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v2.js';
import {compileCachedSemanticTopicIndex as compileV3} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v3.js';
import {parseSubjectKinds} from '../experiments/automatic-topic-discovery-v4/semantic-subject-kinds.js';
import {PUBLIC_SUBJECT_KIND_NODES} from '../experiments/automatic-topic-discovery-v4/public-subject-kind-nodes.js';
import {scoreCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-gold.js';
import {scoreFreshCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-fresh-gold.js';
const DIR='apps/local-service/experiments/automatic-topic-discovery-v4/',FILES=['cached-semantic-topic-index-v3.js','cached-semantic-topic-index-v3.test.js',
 'semantic-subject-kinds.js','semantic-subject-kinds.test.js','public-subject-kind-nodes.js','cached-topic-transfer-gold.js','cached-topic-fresh-gold.js']
 .map(name=>DIR+name).concat(['apps/local-service/harness/run-class-aware-cached-topic-development.js','apps/local-service/harness/hierarchy-benchmark-files.js']);
const OUTPUT='apps/local-service/data/canonical-migration-backups/cached-topic-class-aware-development-20261030';
const distribution=values=>{const xs=[...values].sort((a,b)=>a-b);return {count:xs.length,p50:xs[Math.ceil(xs.length*.5)-1],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
const comparable=value=>Object.fromEntries(['schema','bankHash','supportedPath','selectedPath','labels','reason','aliasMatches','coordinateProducts','scope'].map(key=>[key,value[key]]));
let consumed=false;
export async function compareClassAwareCachedTopics(){
 need(arguments.length===0&&!consumed);consumed=true;const fresh=await pins(FILES),ledger=[];
 const bankResult=await json('apps/local-service/data/canonical-migration-backups/cached-topic-definitions-development-20261030/evaluation-result.json',
  {sha256:'bfdba1958be422649ed83aaa7b54bdd6b12dbee554afff3ae56949c40971e496'},ledger),
  freshResult=await json('apps/local-service/data/canonical-migration-backups/cached-topic-fresh-validation-20261030/evaluation-result.json',
  {sha256:'1ec0ff6d41e0906fba09022301d711202c480d0a98d5556a4e650583d4016ee5'},ledger),
  provider=await json('apps/local-service/data/public-topic-kinds-private-actual-20261030.json',
  {sha256:'c578c2d71969d7881465cfa9cf873fc8272dc9068d2665c2ca8f3b28dc01f6b7'},ledger);
 need(bankResult.status==='completed'&&bankResult.encoderClosed&&bankResult.endPinsPassed&&freshResult.status==='completed'&&freshResult.encoderClosed&&
  freshResult.endPinsPassed&&freshResult.bankHash===bankResult.bank.bankHash&&provider.status==='passed'&&provider.providerCompleted&&
  provider.cleanup.conversationRemoved&&provider.cleanup.sessionLoggedOut&&provider.counts.validated===8);
 const kinds=parseSubjectKinds(PUBLIC_SUBJECT_KIND_NODES,provider.providerAnswer);need(JSON.stringify(kinds)===JSON.stringify(provider.subjectKinds));
 const sourcePins=[],known=new Map();for(const pin of [...bankResult.sourcePins,...freshResult.sourcePins,...fresh]){
  if(known.has(pin.file))need(JSON.stringify(known.get(pin.file))===JSON.stringify(pin));else{known.set(pin.file,pin);sourcePins.push(pin);}}
 const files=sourcePins.map(pin=>pin.file);await endPins(ledger,files,sourcePins);await directory(OUTPUT);
 const started=performance.now(),bank=bankResult.bank,encoded=bankResult.encoded.map(({id,values})=>({id,values})),
  baseline=compileV2(bank,encoded),index=compileV3(bank,encoded,kinds),
  namedOnly=compileV3(bank,encoded,parseSubjectKinds(PUBLIC_SUBJECT_KIND_NODES,JSON.stringify(Object.fromEntries(PUBLIC_SUBJECT_KIND_NODES.map((node,i)=>['M'+i,'named-entity'])))));
 const cohorts=[{id:'original12-now-development',queries:bankResult.queries,score:scoreCachedTopicTransfer},
  {id:'fresh9-now-development',queries:freshResult.queries,score:scoreFreshCachedTopicTransfer}],rows=[],controls=[];
 for(const cohort of cohorts){need(cohort.queries.length===(cohort.id.startsWith('original')?12:9));for(const query of cohort.queries){
  const before=baseline.lookup(query.input),control=namedOnly.lookup(query.input);need(JSON.stringify(comparable(before))===JSON.stringify(comparable(control)));
  const at=performance.now(),lookup=index.lookup(query.input);rows.push({cohort:cohort.id,id:query.id,lookup,lookupMs:performance.now()-at,baselineLabels:before.labels});
  controls.push({cohort:cohort.id,id:query.id,v2EqualsV3AllNamed:true});
 }}
 const repeated=[];for(let repeat=0;repeat<32;repeat++){let i=0;for(const cohort of cohorts)for(const query of cohort.queries){
  const at=performance.now(),again=index.lookup(query.input);repeated.push(performance.now()-at);need(JSON.stringify(again)===JSON.stringify(rows[i++].lookup));}}
 const metrics=cohorts.map(cohort=>({cohort:cohort.id,...cohort.score(rows.filter(row=>row.cohort===cohort.id))})),
  timings={initialLookupMs:distribution(rows.map(row=>row.lookupMs)),repeatedLookupMs:distribution(repeated)};
 need(performance.now()-started<5000);await endPins(ledger,files,sourcePins);
 const result={schema:'cached-topic-class-aware-development-actual/v1',status:'completed',index:index.describe(),kinds,sourcePins,inputPins:ledger,
  rows,metrics,timings,controls,elapsedMs:performance.now()-started,sourceEndPinsPassed:true,
  scope:{postHocDevelopment:true,freshHoldout:false,representativeQuality:false,independentReview:false,modelUsed:false,providerUsed:false,
   queryReencoded:false,aliasesChanged:false,thresholdsChanged:false,treeChanged:false,groupingChanged:false,
   canonicalIdsAssigned:false,productionPolicySelected:false,publication:false,databaseOpened:false,liveChanged:false}};
 return{status:result.status,metrics,timings,controlsPassed:controls.length,elapsedMs:result.elapsedMs,sourceEndPinsPassed:true,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-class-aware-cached-topics')return 2;
 try{const result=await compareClassAwareCachedTopics();process.stdout.write(JSON.stringify(result)+'\n');return 0;}
 catch{process.stderr.write('Class-aware cached topic development unavailable; no live change.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
