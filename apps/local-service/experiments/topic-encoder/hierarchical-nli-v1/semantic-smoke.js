// Explicit NEW semantic plumbing diagnostic after weak topic screening.
// Original smoke/development code and evidence remain unchanged, never retuned.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createNliRuntime} from './runtime.js';
const cases=[
  {id:'identity-en',premise:'A person is riding a bicycle.',hypothesis:'A person is riding a bicycle.',expected:0},
  {id:'negation-en',premise:'A person is riding a bicycle.',hypothesis:'Nobody is riding a bicycle.',expected:2},
  {id:'identity-de',premise:'Eine Katze sitzt auf einer Matte.',hypothesis:'Eine Katze sitzt auf einer Matte.',expected:0},
  {id:'identity-fr',premise:'Une personne lit un livre.',hypothesis:'Une personne lit un livre.',expected:0},
  {id:'identity-es',premise:'Una persona escribe una carta.',hypothesis:'Una persona escribe una carta.',expected:0},
  {id:'topic-sentence',premise:'This article discusses mathematics.',hypothesis:'This text is about mathematics.',expected:0},
  {id:'topic-title',premise:'Mathematics - Wikipedia',hypothesis:'This text is about mathematics.',expected:0},
  {id:'topic-wrapped-title',premise:'This article discusses Mathematics.',hypothesis:'This text is about mathematics.',expected:0},
];
const data=new URL('../../../data/',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
async function bounded(url){const s=await lstat(url);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=1024*1024);
  const b=await readFile(url);assert.equal(b.length,s.size);return b;}
async function main(){
  assert.equal(process.env.MURMINGLE_NLI_SUPERVISED,'semantic');
  const sourceHashes={};for(const name of ['semantic-smoke.js','runtime.js','assets.json','supervise-semantic.py'])
    sourceHashes[name]=hash(await bounded(new URL(name,import.meta.url)));
  await writeFile(new URL('hierarchy-nli-semantic-adr133.started.json',data),JSON.stringify({
    schema:'hierarchy-nli-semantic-plumbing/v1',startedAt:new Date().toISOString(),sourceHashes,
    casesSha256:hash(JSON.stringify(cases)),independentQualityEvidence:false,previousEvidenceUnchanged:true})+'\n',{flag:'wx'});
  const start=performance.now(),runtime=await createNliRuntime({
    assetRoot:fileURLToPath(new URL('hierarchy-nli-assets-adr133-v1',data)),
    manifest:JSON.parse(await bounded(new URL('assets.json',import.meta.url)))});
  const initMs=performance.now()-start,outcomes=[];
  try{for(const row of cases){const result=await runtime.classifyPair({premise:row.premise,hypothesis:row.hypothesis});
    const observedClass=result.logits.indexOf(Math.max(...result.logits));
    outcomes.push({id:row.id,expectedClass:row.expected,observedClass,expectedClassObserved:observedClass===row.expected,...result});
  }}finally{await runtime.close();}
  const result={schema:'hierarchy-nli-semantic-plumbing/v1',status:'complete',sourceHashes,initMs,
    elapsedMs:performance.now()-start,outcomes,independentQualityEvidence:false,productionReady:false,
    assignmentAuthority:false,previousEvidenceUnchanged:true,providerCalls:0,canonicalWrites:0};
  const bytes=Buffer.from(JSON.stringify(result)+'\n');assert.ok(bytes.length<=32*1024);
  await writeFile(new URL('hierarchy-nli-semantic-adr133.json',data),bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({status:'complete',resultSha256:hash(bytes),initMs,
    expectedClassesObserved:outcomes.filter(r=>r.expectedClassObserved).length,total:cases.length,
    independentQualityEvidence:false,productionReady:false})+'\n');
}
const args=process.argv.slice(2);
if(!args.length)process.stdout.write('No action. Explicit supervised --semantic only.\n');
else if(args.length!==1||args[0]!=='--semantic')process.exitCode=1;
else main().catch(error=>{process.stderr.write(JSON.stringify({status:'semantic-plumbing-failed',
  code:typeof error?.code==='string'?error.code:'validation-or-runtime',
  stackLocations:typeof error?.stack==='string'?error.stack.split('\n').slice(1,5).map(s=>s.trim()):[]})+'\n');process.exitCode=1;});
