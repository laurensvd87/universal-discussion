// New authored graph smoke cases, NOT a topic quality benchmark or calibration.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createNliRuntime} from './runtime.js';

const cases=Object.freeze([
  {premise:'A doctor checks the temperature of a patient with a fever.',positive:'This text is about human medicine.',negative:'This text is about video games.'},
  {premise:'Les joueurs se passent le ballon et marquent des paniers pendant le match.',positive:'This text is about a physical team sport.',negative:'This text is about botanical research.'},
  {premise:'Ein Koala frisst Blaetter und ruht in einem Eukalyptusbaum.',positive:'This text is about an animal.',negative:'This text is about computer software.'},
  {premise:'El programa procesa datos en un ordenador mediante instrucciones de software.',positive:'This text is about computing.',negative:'This text is about food preparation.'},
]);
const data=new URL('../../../data/',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bounded(url,max=1024*1024){const s=await lstat(url);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max);
  const b=await readFile(url);assert.equal(b.length,s.size);return b;}
async function main(){
  assert.equal(process.env.MURMINGLE_NLI_SUPERVISED,'smoke');
  const files=['smoke.js','runtime.js','assets.json','supervise.py'],sourceHashes={};
  for(const file of files)sourceHashes[file]=hash(await bounded(new URL(file,import.meta.url)));
  await writeFile(new URL('hierarchy-nli-smoke-adr133.started.json',data),JSON.stringify({
    schema:'hierarchy-nli-graph-smoke/v1',startedAt:new Date().toISOString(),sourceHashes,
    casesSha256:hash(JSON.stringify(cases)),synthetic:true,independentQualityBenchmark:false})+'\n',{flag:'wx'});
  const start=performance.now();
  const runtime=await createNliRuntime({assetRoot:fileURLToPath(new URL('hierarchy-nli-assets-adr133-v1',data)),
    manifest:JSON.parse(await bounded(new URL('assets.json',import.meta.url)))});
  const initMs=performance.now()-start,outcomes=[];
  try{
    for(let i=0;i<cases.length;i++){
      const row=cases[i],positive=await runtime.classifyPair({premise:row.premise,hypothesis:row.positive}),
        negative=await runtime.classifyPair({premise:row.premise,hypothesis:row.negative});
      outcomes.push({caseId:`authored-graph-smoke-${i}`,positive,negative,
        intendedContrastObserved:positive.logits[0]-positive.logits[2]>negative.logits[0]-negative.logits[2]});
    }
  }finally{await runtime.close();}
  const result={schema:'hierarchy-nli-graph-smoke/v1',status:'complete',sourceHashes,initMs,
    elapsedMs:performance.now()-start,outcomes,synthetic:true,independentQualityBenchmark:false,
    productionReady:false,assignmentAuthority:false,providerCalls:0,canonicalWrites:0};
  const bytes=Buffer.from(JSON.stringify(result)+'\n');assert.ok(bytes.length<=32*1024);
  await writeFile(new URL('hierarchy-nli-smoke-adr133.json',data),bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({status:'complete',resultSha256:hash(bytes),initMs,
    elapsedMs:result.elapsedMs,pairs:8,intendedContrasts:outcomes.filter(r=>r.intendedContrastObserved).length,
    productionReady:false})+'\n');
}
const args=process.argv.slice(2);
if(!args.length)process.stdout.write('No action. Explicit supervised --smoke only.\n');
else if(args.length!==1||args[0]!=='--smoke')process.exitCode=1;
else main().catch(error=>{process.stderr.write(JSON.stringify({status:'nli-smoke-failed',
  code:typeof error?.code==='string'?error.code:'validation-or-runtime',
  stackLocations:typeof error?.stack==='string'?error.stack.split('\n').slice(1,5).map(s=>s.trim()):[]})+'\n');process.exitCode=1;});
