// No network, provider, subprocess, SQLite read/write, or private artifact write.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { splitTrainEvents, omitConflictingInputs, fitDiagonal, transform, normalizeVectors } from '../real-diagonal-adapter-v1/core.js';
import { selectFreshEvents } from '../real-diagonal-fresh-v1/core.js';
import { selectBodyTransferEvents } from '../real-diagonal-body-transfer-v1/core.js';
import { prepareGraph, calibrate, admit, evaluate, denominators } from '../local-contrast-gate-v1/core.js';
import { coverageForGraph } from '../real-diagonal-adapter-v1/coverage.js';
import { embedDocuments } from '../e5-infer.js';
import { covarianceFit, cosine, makeMetric, sha, selectDevelopment, selectFreshRethink, transformMetric } from './core.js';

const HERE=path.dirname(fileURLToPath(import.meta.url)), ROOT=path.resolve(HERE,'../../../../..');
const PRIVATE=path.join(os.tmpdir(),'udl-globesumm-research-20261008','news_only.json');
const CORPUS_SHA='8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d';
const MODEL_SHA='f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const NAMES=['centered','global-shrink-50','global-shrink-90','within-shrink-50','within-shrink-90'];
const SOURCES=['README.md','core.js','core.test.js','run.js'].map(n=>path.join(HERE,n)).concat([
  '../e5-infer.js','../real-diagonal-adapter-v1/core.js','../real-diagonal-adapter-v1/coverage.js',
  '../local-contrast-gate-v1/core.js','../real-event-eval/core.js','../real-diagonal-fresh-v1/core.js',
  '../real-diagonal-body-transfer-v1/core.js','../topic-coverage-metrics/core.js',
].map(n=>path.resolve(HERE,n)));
const progress=(stage,articles)=>process.stderr.write(`${JSON.stringify({progress:stage,articles})}\n`);
async function embedding(rows,mode,stage) {
  const vectors=new Map(); let assets;
  for(let i=0;i<rows.length;i+=64) {
    const chunk=rows.slice(i,i+64).map(r=>({id:r.id,title:r.title,body:r.body??r.lead}));
    const result=await embedDocuments(chunk,mode);
    if(result.assets.modelSha256!==MODEL_SHA) throw new Error('MODEL_SHA');
    assets=result.assets; for(const [id,v] of result.vectors) vectors.set(id,v);
    progress(stage,Math.min(i+64,rows.length));
  }
  return {vectors,assets};
}
const labeled=rows=>rows.map(r=>({...r,categories:[r.category??r.family]}));
function assessment(rows,vectors,setting) {
  const graph=prepareGraph(labeled(rows),vectors,cosine), edges=admit(graph,'double-support',setting), admission=evaluate(graph,edges);
  const coverage=coverageForGraph(graph,edges,admission);
  let opposingTotal=0,opposingJoined=0;
  const parents=rows.map((_,i)=>i),root=i=>{while(parents[i]!==i)i=parents[i];return i;};
  for(const edge of edges)parents[root(edge.j)]=root(edge.i);
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(rows[i].eventKey===rows[j].eventKey&&rows[i].viewpoint&&rows[j].viewpoint&&rows[i].viewpoint!==rows[j].viewpoint){opposingTotal++;if(root(i)===root(j))opposingJoined++;}
  return {calibration:setting,denominators:denominators(graph),admission,coverage,opposingViewpointPairs:{total:opposingTotal,joined:opposingJoined}};
}
async function sourceHashes(){const result={};for(const filename of SOURCES)result[path.relative(ROOT,filename).replaceAll('\\','/')]=sha(await readFile(filename));return result;}
async function main() {
  const args=process.argv.slice(2), test=args.includes('--test'), development=args.includes('--development');
  if(test===development||args.some((arg,i)=>!['--test','--development','--synthetic','--selected','--freeze-hash'].includes(arg)&&!['--selected','--freeze-hash'].includes(args[i-1])))throw new Error('ARGUMENTS');
  const selectedArg=args.includes('--selected')?args[args.indexOf('--selected')+1]:null;
  const hashArg=args.includes('--freeze-hash')?args[args.indexOf('--freeze-hash')+1]:null;
  if(test&&(!NAMES.includes(selectedArg)||!/^[a-f0-9]{64}$/u.test(hashArg??'')))throw new Error('FREEZE_ARGUMENTS');
  const sourceSha256=await sourceHashes(), info=await lstat(PRIVATE);
  if(!info.isFile()||info.isSymbolicLink()||info.size!==14972999)throw new Error('PRIVATE_FILE');
  const bytes=await readFile(PRIVATE);if(sha(bytes)!==CORPUS_SHA)throw new Error('CORPUS_SHA');
  const short=parseCorpus(bytes).documents,body=parseCorpus(bytes,{leadCharacters:4096}).documents;
  const byId=new Map(body.map(r=>[r.id,r])),previous=selectEventDisjoint(short),preliminary=selectEventDisjoint(short,300);
  const oldTrain=previous.documents.filter(r=>r.split==='train'),dev=previous.documents.filter(r=>r.split==='validation');
  if(previous.documents.length!==1192||oldTrain.length!==749||dev.length!==150)throw new Error('OLD_SPLIT');
  const {fit,calibration}=splitTrainEvents(oldTrain),clean=new Set(omitConflictingInputs(oldTrain).rows.map(r=>r.id)),fitting=fit.filter(r=>clean.has(r.id));
  if(fitting.length!==475||calibration.length!==274)throw new Error('FIT_SPLIT');
  const fitShort=await embedding(fitting,'title-lead','fit-title-lead');
  const diagonal=fitDiagonal(fitting,fitShort.vectors);
  const fitBodyRows=fitting.map(r=>byId.get(r.id)),calBodyRows=calibration.map(r=>byId.get(r.id)),devBodyRows=dev.map(r=>byId.get(r.id));
  const fitBody=await embedding(fitBodyRows,'body','fit-body');
  const covariance=covarianceFit(fitting,fitBody.vectors);
  const metrics=new Map(NAMES.map(name=>[name,makeMetric(covariance,name)]));
  const calBody=await embedding(calBodyRows,'body','calibration-body'),devBody=await embedding(devBodyRows,'body','reused-development-body');
  const representations=(rows,vectors)=>new Map([
    ['raw-body-E5',normalizeVectors(rows,vectors)],['diagonal-body-E5',transform(rows,vectors,diagonal.parameters)],
    ...[...metrics].map(([name,metric])=>[name,transformMetric(rows,vectors,metric)]),
  ]);
  const settings={};for(const[name,vectors]of representations(calibration,calBody.vectors))settings[name]=calibrate(prepareGraph(labeled(calibration),vectors,cosine))['double-support'];
  const methods={};for(const[name,vectors]of representations(dev,devBody.vectors))methods[name]=assessment(dev,vectors,settings[name]);
  const selected=selectDevelopment(methods);
  const freeze={sourceSha256,corpusSha256:CORPUS_SHA,modelSha256:MODEL_SHA,selected,settings,fitArticles:475,calibrationArticles:274,developmentArticles:150};
  const freezeHash=sha(JSON.stringify(freeze));
  const result={mode:'topic-metric-rethink-v1',researchOnly:true,phase:test?'frozen-fresh-test':'reused-development',freeze,freezeHash,
    development:{reuse:true,methods},weightsSaved:false,vectorsSaved:false,activated:false};
  const compactMethods=Object.fromEntries(Object.entries(methods).map(([name,m])=>[name,{
    truePairs:m.coverage.grouped.truePairs,falsePairs:m.coverage.grouped.falsePairs,
    purePages:m.coverage.grouped.articlesInPureNonSingletonGroups,mixedPages:m.coverage.grouped.articlesInMixedGroups,
  }]));
  process.stdout.write(`${JSON.stringify({checkpoint:'development',selected,freezeHash,methods:compactMethods})}\n`);
  if(test) {
    if(selected!==selectedArg||freezeHash!==hashArg)throw new Error('DEVELOPMENT_FREEZE_MISMATCH');
    const fresh=selectFreshEvents(short,previous.documents,preliminary.documents);
    const bodyPrior=selectBodyTransferEvents(short,previous.documents,preliminary.documents,fresh.documents);
    const cohort=selectFreshRethink(short,[previous.documents,preliminary.documents,fresh.documents,bodyPrior.documents]);
    const testRows=cohort.documents,testBodyRows=testRows.map(r=>byId.get(r.id));
    const testBody=await embedding(testBodyRows,'body','fresh-test-body');
    const testMethods={};for(const[name,vectors]of representations(testRows,testBody.vectors))if(['raw-body-E5','diagonal-body-E5',selected].includes(name))testMethods[name]=assessment(testRows,vectors,settings[name]);
    result.test={freshWholeEvents:true,sameCorpus:true,selectedEvents:cohort.events,availableArticles:cohort.availableArticles,availableEvents:cohort.availableEvents,excludedEvents:cohort.excludedEvents,methods:testMethods};
    // Input-mismatch check: unchanged metrics; independently calibrated title/lead
    // on the same calibration records, then the same fresh events.
    const calShort=await embedding(calibration,'title-lead','calibration-title-lead'),testShort=await embedding(testRows,'title-lead','fresh-test-title-lead');
    const titleSettings={};for(const[name,vectors]of representations(calibration,calShort.vectors))if(['raw-body-E5','diagonal-body-E5',selected].includes(name))titleSettings[name]=calibrate(prepareGraph(labeled(calibration),vectors,cosine))['double-support'];
    const titleMethods={};for(const[name,vectors]of representations(testRows,testShort.vectors))if(titleSettings[name])titleMethods[name]=assessment(testRows,vectors,titleSettings[name]);
    result.titleLeadTransfer={sameFreshEvents:true,metricFittedOnBody:true,methods:titleMethods};
    if(args.includes('--synthetic')) {
      result.synthetic=[];
      const files=['chunk-a','chunk-b','chunk-c1','chunk-c2','chunk-c3'].map(n=>`../multilingual-authored-v2/${n}/records.jsonl`);
      const records=[];for(const file of files)records.push(...(await readFile(path.resolve(HERE,file),'utf8')).trim().split(/\r?\n/u).map(line=>JSON.parse(line)));
      const devSynthetic=records.filter(r=>r.id.startsWith('C')).map(r=>({...r,category:r.family,duplicateKey:sha(`${r.title}\0${r.body.slice(0,384)}`)}));
      const v6=(await readFile(path.resolve(HERE,'../multilingual-holdout-v6/holdout.jsonl'),'utf8')).trim().split(/\r?\n/u).map(line=>JSON.parse(line)).map(r=>({...r,eventKey:r.topicLabel,lang:r.id.split('-').at(-1),category:r.family,duplicateKey:sha(`${r.title}\0${r.body.slice(0,384)}`)}));
      for(const[label,rows]of[['authored-C-reused',devSynthetic],['synthetic-v6-spent',v6]]) {
        const embedded=await embedding(rows,'body',label),syntheticMethods={};
        for(const[name,vectors]of representations(rows,embedded.vectors))if(['raw-body-E5','diagonal-body-E5',selected].includes(name))syntheticMethods[name]=assessment(rows,vectors,settings[name]);
        result.synthetic.push({label,reused:true,calibratedOnRealBody:true,methods:syntheticMethods});
      }
    }
  }
  result.caveats=['same-corpus-not-independent-publisher','no-real-viewpoint-gold','body-prefix-not-Chrome-capture','reused-development-selected-method','grouping-policy-differs-from-live-alternate-planner','not-a-release-or-rights-gate'];
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
main().catch(()=>{process.stderr.write('{"error":"RETHINK_RUN_FAILED"}\n');process.exitCode=1;});
