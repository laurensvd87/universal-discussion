// Same 120 metadata rows: DEVELOPMENT only, never an independent test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createNliRuntime} from './runtime.js';
import {ROOT_SUBJECTS} from './hypotheses.js';
import {NODES} from '../hierarchical-e5-paired-v1/taxonomy.js';
import {validateMetadataGold,assessMetadataRankings} from '../hierarchical-e5-paired-v1/metadata-assessment.js';

const data=new URL('../../../data/',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const lexical=(a,b)=>a<b?-1:a>b?1:0;
async function bounded(url,max=2*1024*1024){const stat=await lstat(url);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max);
  const bytes=await readFile(url);assert.equal(bytes.length,stat.size);return bytes;}
function rank(scores){
  const sorted=[...scores].sort((a,b)=>b.score-a.score||lexical(a.nodeId,b.nodeId));
  return {topRoots:sorted.slice(0,3).map(({nodeId,score})=>({nodeId,score})),
    rootMargin:sorted[0].score-sorted[1].score,forcedRankingPathNotAssignment:[sorted[0].nodeId]};
}
async function main(){
  assert.equal(process.env.MURMINGLE_NLI_SUPERVISED,'development');
  const protocolBytes=await bounded(new URL('development-protocol.json',import.meta.url)),protocol=JSON.parse(protocolBytes);
  const inventoryBytes=await bounded(new URL('hierarchy-public-inventory-adr133.json',data)),inventory=JSON.parse(inventoryBytes);
  const goldBytes=await bounded(new URL('hierarchy-metadata-gold-adr133.json',data)),gold=JSON.parse(goldBytes);
  const e5Bytes=await bounded(new URL('hierarchy-paired-development-v2-adr133.json',data)),e5=JSON.parse(e5Bytes);
  assert.equal(hash(e5Bytes),'9a5014cb42a464912a454b4d90d258f7af7223f60faa16f2b1ea6513ca62b085');
  assert.equal(hash(goldBytes),protocol.goldSha256);assert.equal(inventory.sampleHash,protocol.inventorySampleHash);
  assert.equal(hash(JSON.stringify(inventory.sample)),protocol.inventorySampleHash);
  validateMetadataGold(gold,{inventory,taxonomySha256:hash(await bounded(new URL('../hierarchical-e5-paired-v1/taxonomy.js',import.meta.url))),nodes:NODES});
  assert.equal(inventory.sample.length,protocol.sampleCount);assert.equal(ROOT_SUBJECTS.length,protocol.hypothesisCount);
  assert.deepEqual(ROOT_SUBJECTS.map(r=>r.nodeId).sort(),NODES.filter(n=>n.parentId===null).map(n=>n.id).sort());
  assert.equal(new Set(ROOT_SUBJECTS.map(r=>r.nodeId)).size,16);assert.equal(protocol.maxPairs,1920);
  const e5Ranks=new Map(e5.outcomes.filter(row=>row.bodyWeight===.75).map(row=>[row.id,row.rankers['descendant-union']]));
  assert.equal(e5Ranks.size,120);assert.ok(inventory.sample.every(row=>e5Ranks.has(row.id)));
  const files=['development.js','development-protocol.json','hypotheses.js','runtime.js','assets.json','supervise.py',
    '../hierarchical-e5-paired-v1/taxonomy.js','../hierarchical-e5-paired-v1/metadata-assessment.js'],sourceHashes={};
  for(const file of files)sourceHashes[file]=hash(await bounded(new URL(file,import.meta.url)));
  await writeFile(new URL('hierarchy-nli-development-adr133.started.json',data),JSON.stringify({
    schema:protocol.schema,startedAt:new Date().toISOString(),sourceHashes,goldSha256:hash(goldBytes),
    inventorySha256:hash(inventoryBytes),e5ResultSha256:hash(e5Bytes),independentHoldout:false})+'\n',{flag:'wx'});
  const begin=performance.now(),runtime=await createNliRuntime({
    assetRoot:fileURLToPath(new URL('hierarchy-nli-assets-adr133-v1',data)),
    manifest:JSON.parse(await bounded(new URL('assets.json',import.meta.url)))});
  const initMs=performance.now()-begin,outcomes=[],pairTimes=[],sourceTimes=[],top3PairTimes=[];let pairs=0;
  try{
    for(const source of inventory.sample){
      assert.ok(typeof source.title==='string'&&source.title.length<=512);
      const sourceBegin=performance.now(),scores=[];
      for(const root of ROOT_SUBJECTS){
        assert.ok(++pairs<=protocol.maxPairs);
        const result=await runtime.classifyPair({premise:source.title,hypothesis:root.hypothesis});
        pairTimes.push(result.elapsedMs);
        scores.push({nodeId:root.nodeId,score:result.logits[0]-result.logits[2],
          logits:result.logits,elapsedMs:result.elapsedMs,tokenCount:result.tokenCount});
      }
      const candidateIds=e5Ranks.get(source.id).topRoots.map(r=>r.nodeId);
      assert.equal(candidateIds.length,3);assert.equal(new Set(candidateIds).size,3);
      const subset=scores.filter(row=>candidateIds.includes(row.nodeId));assert.equal(subset.length,3);
      sourceTimes.push(performance.now()-sourceBegin);top3PairTimes.push(subset.reduce((s,r)=>s+r.elapsedMs,0));
      outcomes.push({id:source.id,bodyWeight:0,status:'ranked-not-assigned',scores,
        rankers:{'all-16-roots':rank(scores),'existing-e5-body75-descendant-union-top3':rank(subset)}});
    }
  }finally{await runtime.close();}
  assert.equal(pairs,1920);
  const percentile=(rows,p)=>[...rows].sort((a,b)=>a-b)[Math.floor((rows.length-1)*p)];
  const result={schema:protocol.schema,status:'complete',sourceHashes,inventorySampleHash:inventory.sampleHash,
    inventorySha256:hash(inventoryBytes),goldSha256:hash(goldBytes),e5ResultSha256:hash(e5Bytes),
    independentHoldout:false,calibrated:false,assignmentAuthority:false,productionReady:false,
    modelConversion:'third-party-q8-not-author-signed',input:'retained-title-only',providerCalls:0,
    canonicalWrites:0,pageFetches:0,initMs,elapsedMs:performance.now()-begin,pairs,outcomes,
    timing:{pairP50Ms:percentile(pairTimes,.5),pairP95Ms:percentile(pairTimes,.95),
      all16SourceP50Ms:percentile(sourceTimes,.5),all16SourceP95Ms:percentile(sourceTimes,.95),
      selected3ObservedPairSumP50Ms:percentile(top3PairTimes,.5),selected3ObservedPairSumP95Ms:percentile(top3PairTimes,.95),
      selected3TimingScope:'sum-of-these-pairs-in-all16-run-not-measured-end-to-end-top3-pipeline'}};
  result.metadataAssessment=assessMetadataRankings({gold,result,weights:[0],
    rankers:protocol.candidatePolicies,marginBands:protocol.rootMargins});
  const bytes=Buffer.from(JSON.stringify(result)+'\n');assert.ok(bytes.length<=2*1024*1024);
  await writeFile(new URL('hierarchy-nli-development-adr133.json',data),bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({status:'complete',resultSha256:hash(bytes),pairs,initMs,
    elapsedMs:result.elapsedMs,timing:result.timing,independentHoldout:false,productionReady:false})+'\n');
}
const args=process.argv.slice(2);
if(!args.length)process.stdout.write('No action. Explicit supervised --development only.\n');
else if(args.length!==1||args[0]!=='--development')process.exitCode=1;
else main().catch(error=>{process.stderr.write(JSON.stringify({status:'nli-development-failed',
  code:typeof error?.code==='string'?error.code:'validation-or-runtime',
  stackLocations:typeof error?.stack==='string'?error.stack.split('\n').slice(1,5).map(s=>s.trim()):[]})+'\n');process.exitCode=1;});
