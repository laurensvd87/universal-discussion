// Explicit DEVELOPMENT ONLY. All diagnostic cohorts were previously consumed.
// Reuses saved vectors: no encoder, network, provider, DB, runtime or crawler.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,mkdir,statfs} from 'node:fs/promises';
import {freemem} from 'node:os';
import {pathToFileURL} from 'node:url';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence,scoreHierarchyLocalEvidence,
  classifyHierarchyLocalEvidence} from '../../../src/domain/hierarchical-e5-local-evidence.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {fitDevelopmentNodeCuts,DEVELOPMENT_GRID} from './development-fit.js';

const here=new URL('./',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
const C='../hierarchical-e5-broad-heads-v1/',V='../hierarchical-e5-real-root-v3/';
const checkedBytes=new Map();
const PINS={
  [C+'output/vectors.json']:'e48c28998521f283e2217b76e3100de5b37b9339f039e2390d10bc839ec64bd4',
  [V+'output/traincal.current-static.vectors.json']:'bcdf5c846acdc469b1e4de05ad4d9069612ec50b5c81c79500d90470aa833c6a',
  [V+'output/test.current-static.vectors.json']:'dcf0a35689fd447bae6efb251563352a630a5cae7a2b0b10c12bfb2ad615f51c',
  [C+'output/input-definition.json']:'75d443c8186a375b8e68cdefe383e77a31ef746ae3f725d92f84ae9341b46db2',
  [V+'measured-results.json']:'0280c5397f417b0582a0f6040bd8c516575595214f143b79539df304e8ecdf29',
};
async function freshBytes(name,max=8*1024*1024){
  const url=new URL(name,here),s=await lstat(url);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max);
  const b=await readFile(url);assert.equal(b.length,s.size);return b;
}
async function bytes(name,max=8*1024*1024){
  if(!checkedBytes.has(name))checkedBytes.set(name,await freshBytes(name,max));
  const b=checkedBytes.get(name);assert.ok(b.length<=max);return b;
}
const json=async name=>JSON.parse(await bytes(name));
const write=(name,v)=>writeFile(new URL(name,here),JSON.stringify(v)+'\n',{flag:'wx'});
async function verifyOldFreeze(folder,expected,sourceHashes){
  const raw=await bytes(folder+'freeze.json'),f=JSON.parse(raw),{freezeHash,...body}=f;
  assert.equal(freezeHash,expected);assert.equal(digest(body),freezeHash);sourceHashes[folder+'freeze.json']=sha(raw);
  for(const [name,pin]of Object.entries(f.sourceHashes)){
    assert.equal(sha(await bytes(folder+name)),pin,'Closed experiment source changed');sourceHashes[folder+name]=pin;}
  return f;
}
function availabilityGuard(started){
  assert.ok(performance.now()-started<90000,'Development wall capacity');
  assert.ok(process.memoryUsage().rss<384*1024*1024,'Development RSS capacity');
  assert.ok(freemem()>1024*1024*1024,'Host physical memory reserve');
}
function pathTo(nodes,id){const byId=new Map(nodes.map(n=>[n.id,n])),path=[];let cursor=byId.get(id);
  while(cursor){assert.ok(path.length<8&&!path.includes(cursor.id));path.unshift(cursor.id);cursor=byId.get(cursor.parentId);}return path;}
export function summarizeDevelopmentOutcomes(rows,outcomes){
  assert.equal(rows.length,outcomes.length);let assigned=0,correctRoot=0,wrongRoot=0;
  const specificity={annotated:0,unscored:0,exact:0,safeBroader:0,wrong:0,unresolved:0};
  for(let i=0;i<rows.length;i++){
    const row=rows[i],out=outcomes[i];assert.equal(row.id,out.id);const p=out.path;
    if(p.length){assigned++;if(p[0]===row.expectedRootId)correctRoot++;else wrongRoot++;}
    if(row.completePath===null){specificity.unscored++;continue;}specificity.annotated++;
    if(!p.length)specificity.unresolved++;
    else if(p.every((x,j)=>x===row.completePath[j])){
      if(p.length===row.completePath.length)specificity.exact++;else specificity.safeBroader++;
    }else specificity.wrong++;
  }
  return {rows:rows.length,assigned,correctRoot,wrongRoot,unresolved:rows.length-assigned,specificity,
    developmentOnly:true,independentValidation:false};
}
export async function runDevelopmentScreen(){
  assert.equal(process.platform,'win32');assert.match(here.pathname,/^\/D:/iu);
  assert.ok(process.execArgv.includes('--max-old-space-size=256'),'Use the fixed 256MiB heap launch');
  const started=performance.now();availabilityGuard(started);
  for(const [drive,reserve]of [['C:',768],['D:',512]]){
    const s=await statfs(drive+'/');assert.ok(s.bavail*s.bsize>=reserve*1024*1024,'Disk reserve');}
  const sourceHashes={};
  for(const [name,pin]of Object.entries(PINS)){const b=await bytes(name);assert.equal(sha(b),pin);sourceHashes[name]=pin;}
  await verifyOldFreeze(C,'7bf0ee5450ed3cf9768f08c678589767fa7277542a88aa8652f7bd6324ab91fb',sourceHashes);
  await verifyOldFreeze(V,'6892118af0326115f1bc40d19db30956b319157efde7991e6128d9823b4fb92a',sourceHashes);
  for(const name of ['run-development.mjs','run-development.test.js','development-fit.js','development-fit.test.js',
    '../../../src/domain/hierarchical-e5-local-evidence.js','../../../src/domain/hierarchical-e5-paired-input.js',
    '../../../test/hierarchical-e5-local-evidence.test.js','../hierarchical-e5-real-root-v1/manifest.js',
    '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js',
    '../../../../../decisions/ADR-139-local-exemplar-and-reviewed-subject-evidence.md'])sourceHashes[name]=sha(await bytes(name));
  const [{CORPUS},{TAXONOMY},{loadGoldManifest}]=await Promise.all([
    import(C+'corpus.js'),import(C+'taxonomy.js'),import('../hierarchical-e5-real-root-v3/manifest.js')]);
  const gold=await loadGoldManifest();Object.assign(sourceHashes,gold.goldSourceHashes);
  const definition=await json(C+'output/input-definition.json'),adapter=compilePairedE5Input(definition),paired=describePairedE5Input(adapter);
  const constructionHash=digest({schema:'local-evidence-development-mixed-input/v1',
    view:'current-static',realAndSyntheticInputPins:PINS,representationHash:paired.representationHash,
    originalRealInputConstructionHash:(await json(V+'measured-results.json')).selectionReceipt.inputConstructionHash,
    attestation:false,developmentOnly:true});
  const descriptor={schema:'hierarchy-local-evidence-development-screen/v1',sourceHashes,
    grid:DEVELOPMENT_GRID,minimumAcceptedGroups:3,candidates:['real-root-only','real-plus-synthetic-detail'],
    reusedConsumedDiagnosticRows:32,newHoldout:false,aliasEvidenceUsed:false,inputConstructionHash:constructionHash,
    resourceChecks:'cooperative-90s-RSS384MiB-physical1GiB-heap256MiB-not-external-hard-termination',
    productionValidated:false,assignmentAuthority:false};
  const descriptorHash=digest(descriptor);
  // No repeated execution or output replacement, even after a partial failure.
  await mkdir(new URL('output/',here));assert.ok(!(await lstat(new URL('output/',here))).isSymbolicLink());
  await write('output/started.json',{descriptorHash,noAutomaticRepeat:true});await write('output/descriptor.json',descriptor);
  const syntheticPacket=await json(C+'output/vectors.json'),realPacket=await json(V+'output/traincal.current-static.vectors.json'),
    diagnosticPacket=await json(V+'output/test.current-static.vectors.json');
  assert.equal(syntheticPacket.vectors.length,457);assert.equal(realPacket.vectors.length,96);assert.equal(diagnosticPacket.vectors.length,32);
  const fuse=p=>new Map(p.vectors.map(r=>{
    const v=applyPairedE5Input(adapter,{sourceId:r.id,sourceVersion:descriptorHash,bodyVector:r.bodyVector,titleVector:r.titleVector});
    assert.equal(v.status,'available');return [r.id,v.vector];}));
  const syntheticVectors=fuse(syntheticPacket),realVectors=fuse(realPacket),diagnosticVectors=fuse(diagnosticPacket);
  const nodes=TAXONOMY.nodes.map(({id,parentId})=>({id,parentId})),roots=nodes.filter(n=>n.parentId===null);
  assert.equal(nodes.length,63);assert.equal(roots.length,16);
  const realRows=gold.cases.map(r=>({id:r.id,groupId:r.entityGroup,expectedRootId:r.expectedRootId,
    completePath:r.specificityPath,split:r.split,vector:(r.split==='test'?diagnosticVectors:realVectors).get(r.id)}));
  assert.ok(realRows.every(r=>r.vector));
  const syntheticRows=CORPUS.map(r=>({id:r.id,groupId:r.groupId,completePath:r.expectedTopicId===null?[]:pathTo(nodes,r.expectedTopicId),
    expectedRootId:r.expectedTopicId===null?null:pathTo(nodes,r.expectedTopicId)[0],split:r.split,vector:syntheticVectors.get(r.id)}));
  const witness=row=>({sourceId:row.id,sourceVersion:descriptorHash,representation:paired.representation,
    representationHash:paired.representationHash,inputConstructionHash:constructionHash,vector:row.vector});
  const results=[],pendingArtifacts=[];
  for(const augmented of [false,true]){
    availabilityGuard(started);const name=augmented?'real-plus-synthetic-detail':'real-root-only',topology=augmented?nodes:roots,examples=[];
    for(const row of realRows.filter(r=>r.split==='training'))examples.push({id:row.id,groupId:row.groupId,nodeId:row.expectedRootId,kind:'member',vector:row.vector});
    if(augmented)for(const row of syntheticRows.filter(r=>r.split==='training')){
      if(row.completePath.length)examples.push({id:row.id,groupId:row.groupId,nodeId:row.completePath.at(-1),kind:'stop',vector:row.vector});
      else for(const root of roots)examples.push({id:`${row.id}:${root.id}`,groupId:`${row.groupId}:${root.id}`,nodeId:root.id,kind:'outside',vector:row.vector});
    }
    const template={schema:'hierarchical-e5-local-evidence/v1',representation:paired.representation,representationHash:paired.representationHash,
      inputConstructionHash:constructionHash,taxonomyVersion:'experimental-house-63/v1',evidenceVersion:`adr139-${name}`,
      calibrationVersion:'adr139-reused-development/v1',calibrationStatus:'experimental',nodes:topology,examples,
      nodePolicies:topology.map(n=>({nodeId:n.id,enabled:false,minSupport:1,minSimilarity:1,minNegativeMargin:0,minRivalMargin:0}))};
    const raw=compileHierarchyLocalEvidence(template),calRows=[...realRows.filter(r=>r.split==='calibration'),
      ...(augmented?syntheticRows.filter(r=>r.split==='calibration'):[])];
    assert.equal(calRows.length,augmented?241:48);
    const scored=calRows.map(row=>{availabilityGuard(started);return {...row,features:scoreHierarchyLocalEvidence(raw,witness(row)).nodes};});
    const fit=fitDevelopmentNodeCuts({nodes:topology,rows:scored}),artifact={...template,nodePolicies:fit.policies};
    const compiled=compileHierarchyLocalEvidence(artifact),identity=describeHierarchyLocalEvidence(compiled);
    const diagnosticRows=realRows.filter(r=>r.split==='test'),outcomes=[],times=[];
    for(const row of diagnosticRows){availabilityGuard(started);const start=performance.now(),decision=classifyHierarchyLocalEvidence(compiled,witness(row));
      times.push(performance.now()-start);outcomes.push({id:row.id,path:decision.selectedPath,reason:decision.reason,work:decision.work,
        plausiblePaths:decision.plausiblePaths});}
    times.sort((a,b)=>a-b);
    pendingArtifacts.push([`output/${name}.artifact.json`,artifact],[`output/${name}.fit.json`,fit]);
    results.push({name,identity,summary:summarizeDevelopmentOutcomes(diagnosticRows,outcomes),outcomes,
      enabledCuts:fit.policies.filter(r=>r.enabled).length,calibrationRows:calRows.length,
      classifierTiming:{medianMs:times[15],p95Ms:times[30],maxMs:times[31],
        scope:'classification-only-excludes-capture-encoding-fusion-compilation-queue-database',controlledComparison:false}});
  }
  availabilityGuard(started);
  // Parse pinned vectors from the same initial bytes, then detect ordinary input
  // or source drift before publishing complete evidence. This is not an
  // adversarial filesystem-ABA or loaded-module attestation claim.
  for(const [name,expected]of Object.entries(sourceHashes))assert.equal(sha(await freshBytes(name)),expected,'Development input/source changed during run');
  for(const [name,expected]of Object.entries(PINS))assert.equal(sha(await freshBytes(name)),expected,'Pinned development input changed');
  availabilityGuard(started);
  const result={descriptorHash,results,elapsedMs:performance.now()-started,finalRssBytes:process.memoryUsage().rss,
    developmentOnly:true,newHoldout:false,productionValidated:false,assignmentAuthority:false,
    modelCalls:0,pageFetches:0,ownerDataRead:false,canonicalWrites:false,crawlerActions:0};
  for(const [name,value]of pendingArtifacts)await write(name,value);
  await write('output/results.json',result);
  return {descriptorHash,resultHash:digest(result),results:results.map(r=>({name:r.name,...r.summary,enabledCuts:r.enabledCuts})),developmentOnly:true};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.length===3&&process.argv[2]==='--development-screen')console.log(JSON.stringify(await runDevelopmentScreen()));
  else if(process.argv.length===2)console.log('No action. Explicit --development-screen required; all reused cohorts are DEVELOPMENT ONLY.');
  else throw Error('Unknown development operation');
}
