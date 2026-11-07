// Offline acceptance over actual numeric preparation and public projection.
// Invented vectors/heads prove composition, never SQL, model quality or live use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {trainBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {fitPooledRootRankPolicy} from '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {createHierarchyIngestionPreparation} from '../src/application/hierarchy-ingestion-preparation.js';
import {projectSemanticSourceContext} from '../src/domain/semantic-topic-directory.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';

const axis=n=>Array.from({length:384},(_,i)=>i===n?1:0);
const sha=value=>createHash('sha256').update(value).digest('hex');
const modelId='e5-small-q8-browser-main-prefix-v1';
const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)};
const paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
const rootNodes=[{id:'games',parentId:null},{id:'nature',parentId:null}];
const rootModel=trainHierarchyLinearHeads({nodes:rootNodes,rows:Array.from({length:4},(_,i)=>({id:'train-'+i,groupId:'training-'+i,
 split:'training',expectedTopicId:i<2?'games':'nature',vector:axis(i<2?0:1)})),representation:paired.representation,
 representationHash:paired.representationHash,trainingVersion:'invented-ancestor-acceptance/v1',lambda:.1});
const core=compileHierarchyLinearHeads(rootModel);
const rootPolicy=fitPooledRootRankPolicy({modelHash:sha(JSON.stringify(rootModel)),representationHash:paired.representationHash,
 inputConstructionHash:'b'.repeat(64),nodeIds:['games','nature'],rows:Array.from({length:20},(_,i)=>({id:'cal-'+i,groupId:'calibration-'+i,
 expectedRootId:i%2?'nature':'games',scores:scoreHierarchyLinearHeads(core,{sourceId:'cal-'+i,sourceVersion:'invented',
 representation:paired.representation,representationHash:paired.representationHash,vector:axis(i%2?1:0)}).scores.map(({nodeId,score})=>({nodeId,score}))}))});
const animals=['nature','animals'],reptiles=[...animals,'reptiles'],mammals=[...animals,'mammals'];
function detail(path,positiveAxis=1){
 return trainBinaryHierarchyDetail({nodeId:path.at(-1),canonicalPath:path,representation:paired.representation,
  representationHash:paired.representationHash,trainingVersion:'invented-'+path.at(-1),
  trainingRows:[true,true,false,false].map((label,i)=>({id:'train-'+i,groupId:'train-group-'+i,label,vector:axis(label?positiveAxis:positiveAxis===0?1:0)})),
  calibrationRows:[true,true,true,false,false,false].map((label,i)=>({id:'cal-'+i,groupId:'cal-group-'+i,label,language:'en',vector:axis(label?positiveAxis:positiveAxis===0?1:0)}))});
}
function fixture({includeReptiles=true,animalsSupported=true,reptilesSupported=true,collision=false,isolation=false}={}){
 const nodes=[...rootNodes,{id:'animals',parentId:'nature'},...(includeReptiles?[{id:'reptiles',parentId:'animals'}]:[]),
  ...(collision?[{id:'mammals',parentId:'animals'}]:[]),...(isolation?[{id:'koalas',parentId:'animals'},{id:'named-game',parentId:'games'}]:[])];
 const detailArtifacts=[detail(animals,animalsSupported?1:2),...(includeReptiles?[detail(reptiles,reptilesSupported?1:2)]:[]),
  ...(collision?[detail(mammals)]:[]),...(isolation?[detail([...animals,'koalas'],2),detail(['games','named-game'],0)]:[])];
 return compileRootedHierarchyMatcher({rootModel,rootPolicy,inputDefinition,nodes,detailArtifacts});
}
// These links are invented test declarations, not claims that publisher
// affiliation is the canonical real-world ancestry of a particular game.
function namedFixture({rootId='games',ownerId='rockstar',childId='gta-vi',includeOwner=true,includeChild=true,
 ownerSupported=true,childSupported=true,conflict=false}={}){
 const roots=[{id:rootId,parentId:null},{id:'unrelated-root',parentId:null}];
 const model=trainHierarchyLinearHeads({nodes:roots,rows:Array.from({length:4},(_,i)=>({id:'named-train-'+i,groupId:'named-training-'+i,
  split:'training',expectedTopicId:i<2?rootId:'unrelated-root',vector:axis(i<2?0:1)})),representation:paired.representation,
  representationHash:paired.representationHash,trainingVersion:'invented-named-ancestor-acceptance/v1',lambda:.1});
 const core=compileHierarchyLinearHeads(model);
 const policy=fitPooledRootRankPolicy({modelHash:sha(JSON.stringify(model)),representationHash:paired.representationHash,
  inputConstructionHash:'c'.repeat(64),nodeIds:roots.map(node=>node.id),rows:Array.from({length:20},(_,i)=>({id:'named-cal-'+i,groupId:'named-calibration-'+i,
   expectedRootId:i%2?'unrelated-root':rootId,scores:scoreHierarchyLinearHeads(core,{sourceId:'named-cal-'+i,sourceVersion:'invented',
    representation:paired.representation,representationHash:paired.representationHash,vector:axis(i%2?1:0)}).scores.map(({nodeId,score})=>({nodeId,score}))}))});
 assert(includeOwner||!includeChild,'an absent declared parent cannot retain its child');
 const nodes=[...roots,...(includeOwner?[{id:ownerId,parentId:rootId}]:[]),
  ...(includeChild?[{id:childId,parentId:ownerId}]:[]),...(conflict?[{id:'another-publisher',parentId:rootId}]:[])];
 const detailArtifacts=[...(includeOwner?[detail([rootId,ownerId],ownerSupported?0:2)]:[]),
  ...(includeChild?[detail([rootId,ownerId,childId],childSupported?0:2)]:[]),...(conflict?[detail([rootId,'another-publisher'],0)]:[])];
 return compileRootedHierarchyMatcher({rootModel:model,rootPolicy:policy,inputDefinition,nodes,detailArtifacts});
}
function claim(title,bodyVector,operationId='unknown-species'){
 const input={expected:{generation:'offline-ancestor-generation',revision:1},operationId,url:'https://www.britannica.com/animal/snake',title,
  embedding:{modelId,values:bodyVector},extractorVersion:'crawler-static-html-prefix/v1'};
 const requestMaterial=JSON.stringify({url:input.url,title:input.title,embedding:input.embedding,extractorVersion:input.extractorVersion});
 return {operationId,operationDigest:sha(requestMaterial),requestMaterial,input};
}
async function prepareAndProject(t,matcher,{title='Snakes',bodyVector=axis(1),titleVector=bodyVector}={}){
 const identity=describeRootedHierarchyMatcher(matcher),matcherIdentityHash=sha(JSON.stringify(identity));
 assert(!identity.nodes.some(node=>node.id==='snakes'),'the specific query topic must remain absent');
 const prep=createHierarchyIngestionPreparation({matcher,embedTitle:async()=>({modelId,values:titleVector})});
 t.after(()=>prep.close());
 const prepared=await prep.prepare(claim(title,bodyVector));
 assert.equal(prepared.matcherIdentityHash,matcherIdentityHash);
 const parents=new Map(identity.nodes.map(node=>[node.id,node.parentId]));
 const nodes=identity.nodes.map(node=>{const path=[];for(let id=node.id;id!==null;id=parents.get(id))path.unshift(id);return {...node,path};});
 // Simulated database envelope, carrying the classifier's actual path verbatim.
 const topology={generation:'offline-ancestor-generation',matcherIdentityHash,nodes};
 const context={generation:topology.generation,matcherIdentityHash,sourceId:prepared.sourceId,sourceVersion:'1',
  status:'classified',supportedPath:prepared.decision.semanticPath};
 const project=policy=>projectSemanticSourceContext(topology,policy,context);
 const full=project({revision:1,defaultMaxDepth:8,overrides:[]});
 assert.deepEqual(full.supportedPath,prepared.decision.semanticPath);
 return {prepared,full,project};
}

test('unknown Snakes reaches supported existing Reptiles through real ingestion and public projection',async t=>{
 const {prepared,full}=await prepareAndProject(t,fixture());
 assert.deepEqual(prepared.decision.semanticPath,reptiles);assert.deepEqual(full.selectedPath,reptiles);assert.equal(full.topic.id,'reptiles');
 assert.equal(prepared.assignmentAuthority,false);assert.equal(prepared.numericPreparedOnly,true);
});
test('a missing or rejected Reptiles category leaves the most specific supported Animals ancestor',async t=>{
 for(const options of [{includeReptiles:false},{reptilesSupported:false}]){
  const {prepared,full}=await prepareAndProject(t,fixture(options));assert.deepEqual(prepared.decision.semanticPath,animals);
  assert.deepEqual(full.selectedPath,animals);assert.equal(full.topic.id,'animals');assert.equal(full.topic.title,'Animals');
 }
});
test('unsupported category evidence retains Nature and absent root evidence stays page-only',async t=>{
 const matcher=fixture({animalsSupported:false,reptilesSupported:false});
 const broad=await prepareAndProject(t,matcher);assert.deepEqual(broad.full.selectedPath,['nature']);assert.equal(broad.full.topic.id,'nature');
 const unknown=await prepareAndProject(t,matcher,{bodyVector:axis(3)});assert.equal(unknown.prepared.decision.status,'abstained');
 assert.deepEqual(unknown.full.supportedPath,[]);assert.deepEqual(unknown.full.selectedPath,[]);assert.equal(unknown.full.topic,null);
});
test('colliding sibling category nominations coarsen to their existing Animals ancestor',async t=>{
 const {prepared,full}=await prepareAndProject(t,fixture({collision:true}));assert.equal(prepared.decision.reason,'detail-common-ancestor');
 assert.deepEqual(prepared.decision.maximalDetailPaths,[mammals,reptiles]);assert.deepEqual(full.selectedPath,animals);assert.equal(full.topic.id,'animals');
});
test('owner depth changes selection only, retaining actual semantic evidence and stable source/node identities',async t=>{
 const {prepared,full,project}=await prepareAndProject(t,fixture());
 const coarse=project({revision:2,defaultMaxDepth:1,overrides:[]});assert.deepEqual(coarse.selectedPath,['nature']);
 const override=project({revision:3,defaultMaxDepth:1,overrides:[{nodeId:'animals',maxDepth:3}]});assert.deepEqual(override.selectedPath,reptiles);
 for(const result of [coarse,override]){assert.deepEqual(result.supportedPath,prepared.decision.semanticPath);assert.equal(result.sourceId,full.sourceId);assert.equal(result.sourceVersion,full.sourceVersion);}
 assert.equal(override.topic.id,full.topic.id);assert.deepEqual(prepared.decision.semanticPath,reptiles);
});
test('unknown species cannot become an unsupported known child or an independently supported other-root named entity',async t=>{
 const matcher=fixture({isolation:true}),snake=await prepareAndProject(t,matcher,{title:'Named Game - snakes'});
 assert.deepEqual(snake.full.selectedPath,reptiles);assert(!snake.prepared.decision.evaluatedDetailNodes.includes('named-game'));
 assert(snake.prepared.decision.evaluatedDetailNodes.includes('koalas'));
 assert(!snake.prepared.decision.acceptedDetailPaths.some(path=>path.at(-1)==='koalas'));
 const neutral=await prepareAndProject(t,matcher,{title:'Unknown wildlife report'});assert.deepEqual(neutral.full.selectedPath,snake.full.selectedPath);
 const game=await prepareAndProject(t,matcher,{title:'Named Game',bodyVector:axis(0)});assert.deepEqual(game.full.selectedPath,['games','named-game']);
 assert.deepEqual(game.prepared.decision.evaluatedDetailNodes,['named-game']);
});
test('retained real Komodo vectors traverse installed matcher, ingestion and public Animals projection as DEV regression only',async t=>{
 const base=new URL('./fixtures/hierarchy-nature-heads/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
 assert.equal(manifest.doNotUseAsTraining,true);const spec=manifest.cases.find(row=>row.file==='komodo-dragon.json');
 const raw=await readFile(new URL(spec.file,base));assert.equal(raw.length,spec.bytes);assert.equal(sha(raw),spec.sha256);
 const row=JSON.parse(raw),installed=await loadInstalledHierarchyMatcher();
 // Replay only the retained numeric pair. Transport title/URL are invented;
 // no encoder runs and this does not attest the original text/vector binding.
 const {full}=await prepareAndProject(t,installed.matcher,{title:'Retained Komodo dragon regression',bodyVector:row.bodyVector,titleVector:row.titleVector});
 assert.deepEqual(full.supportedPath,spec.expectedSemanticPath);assert.equal(full.topic.id,'animals');
});

test('declared named hierarchy chooses GTA VI, independently supported Rockstar, or Games according to available evidence',async t=>{
 const cases=[
  {name:'supported exact game',options:{},expected:['games','rockstar','gta-vi']},
  {name:'game absent',options:{includeChild:false},expected:['games','rockstar']},
  {name:'game rejected',options:{childSupported:false},expected:['games','rockstar']},
  {name:'publisher and game absent',options:{includeOwner:false,includeChild:false},expected:['games']},
  {name:'publisher rejected and game absent',options:{ownerSupported:false,includeChild:false},expected:['games']},
  {name:'publisher and game rejected',options:{ownerSupported:false,childSupported:false},expected:['games']},
 ];
 for(const row of cases){
  const matcher=namedFixture(row.options),identity=describeRootedHierarchyMatcher(matcher);
  const {prepared,full}=await prepareAndProject(t,matcher,{title:'GTA VI',bodyVector:axis(0)});
  assert.deepEqual(prepared.decision.semanticPath,row.expected,row.name);assert.deepEqual(full.selectedPath,row.expected,row.name);
  assert.equal(full.topic.id,row.expected.at(-1),row.name);
  assert(full.selectedPath.every(id=>identity.nodes.some(node=>node.id===id)),row.name+' cannot invent an ID');
 }
});
test('conflicting independently supported publishers coarsen to Games without ranking their names',async t=>{
 const {prepared,full}=await prepareAndProject(t,namedFixture({includeChild:false,conflict:true}),{title:'GTA VI',bodyVector:axis(0)});
 assert.equal(prepared.decision.reason,'detail-conflict-root-only');assert.deepEqual(full.selectedPath,['games']);
 assert.deepEqual(prepared.decision.maximalDetailPaths,[['games','another-publisher'],['games','rockstar']]);
});
test('a GTA VI title cannot manufacture an unsupported named publisher ancestor',async t=>{
 const matcher=namedFixture({includeChild:false,ownerSupported:false});
 const named=await prepareAndProject(t,matcher,{title:'GTA VI by Rockstar',bodyVector:axis(0)});
 const unrelated=await prepareAndProject(t,matcher,{title:'An unrelated game',bodyVector:axis(0)});
 assert.deepEqual(named.full.selectedPath,['games']);assert.deepEqual(unrelated.full.selectedPath,named.full.selectedPath);
 assert.deepEqual(named.prepared.decision.acceptedDetailPaths,[]);assert.deepEqual(named.prepared.decision.evaluatedDetailNodes,['rockstar']);
});
test('the same mechanism follows arbitrary Technology Acme Tool X IDs rather than animal or game labels',async t=>{
 const base={rootId:'technology',ownerId:'acme',childId:'tool-x'};
 for(const row of [
  {options:base,expected:['technology','acme','tool-x']},
  {options:{...base,childSupported:false},expected:['technology','acme']},
  {options:{...base,childSupported:false,ownerSupported:false},expected:['technology']},
 ]){
  const {prepared,full}=await prepareAndProject(t,namedFixture(row.options),{title:'Tool X',bodyVector:axis(0)});
  assert.deepEqual(prepared.decision.semanticPath,row.expected);assert.deepEqual(full.selectedPath,row.expected);assert.equal(full.topic.id,row.expected.at(-1));
 }
});
