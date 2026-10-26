// New metadata loader deliberately NEVER opens the old32 final gold or vectors.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {TAXONOMY} from '../hierarchical-e5-paired-v1/taxonomy.js';
import {compileHierarchyHeadAssignment} from '../../../src/domain/hierarchical-e5-observed-head-policy.js';
const here=new URL('./',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
const C='../hierarchical-e5-broad-heads-v1/',D='../hierarchical-e5-observed-cuts-v1/';
export const GOLD_FILES=Object.freeze({
 '../../../data/hierarchy-real-root-training-gold-adr136.json':'62ff96d3b98d197c4c90ea2db7f5a9adb7615bf8e18fce7f66c3c1681b1f53e8',
 '../../../data/hierarchy-real-root-calibration-gold-adr136.json':'8b755d8ae214de78f51005f547cb074655382cd2fb0fc0cf99b8f2e9bba76cfc',
 '../../../data/hierarchy-root-expansion-candidates-adr141.json':'4c74ade125605bb41f3073803279ff9f96eb143d88b97f4ea373677b3b30aeca'
});
export const LABEL_SEAL='../../../data/hierarchy-root-expansion-label-seal-adr141.json';
export const LABEL_SEAL_SHA256='dc4e1a222ea62ca36b5a8eff6ff2af047f7c133af83157ddf8c75a75cc8c8faf';
const snapshot=new Map();
async function bytes(name,maximum=8*1024*1024){
 if(snapshot.has(name)){const b=snapshot.get(name);assert.ok(b.length<=maximum);return b;}
 const stat=await lstat(new URL(name,here));assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum);
 const b=await readFile(new URL(name,here));assert.equal(b.length,stat.size);snapshot.set(name,b);return b;
}
const json=async name=>JSON.parse(await bytes(name));
const freeze=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;};
export function normalizeCases(training,calibration,expansion,nodes){
 const all=[...training.map(c=>({...c,supportedPathPrefix:[c.expectedRootId],maximumSpecificityKnown:false})),
 ...calibration.map(c=>({...c,supportedPathPrefix:[c.expectedRootId],maximumSpecificityKnown:false})),...expansion];
 const byNode=new Map(nodes.map(n=>[n.id,n])),ids=new Set(),groups=new Set(),urls=new Set();
 assert.equal(nodes.filter(n=>n.parentId===null).length,16);
 const rows=all.map(r=>{
  for(const k of ['id','entityGroup','language','publicUrl','articleTitle'])assert.ok(typeof r[k]==='string'&&r[k].length>0&&r[k].length<=512);
  assert.ok(!ids.has(r.id)&&!groups.has(r.entityGroup)&&!urls.has(r.publicUrl));ids.add(r.id);groups.add(r.entityGroup);urls.add(r.publicUrl);
  assert.ok(['en','de','nl','fr','es'].includes(r.language));assert.equal(byNode.get(r.expectedRootId)?.parentId,null);
  const u=new URL(r.publicUrl);assert.equal(u.href,r.publicUrl);assert.equal(u.origin,'https://'+r.language+'.wikipedia.org');
  assert.ok(u.pathname.startsWith('/wiki/')&&!u.search&&!u.hash&&!u.username&&!u.password&&!u.port);
  assert.ok(Array.isArray(r.supportedPathPrefix)&&r.supportedPathPrefix.length>0&&r.supportedPathPrefix.length<=8);
  let parent=null;for(const id of r.supportedPathPrefix){assert.equal(byNode.get(id)?.parentId,parent);parent=id;}
  assert.equal(r.supportedPathPrefix[0],r.expectedRootId);assert.equal(typeof r.maximumSpecificityKnown,'boolean');
  return {id:r.id,entityGroup:r.entityGroup,language:r.language,publicUrl:r.publicUrl,articleTitle:r.articleTitle,
   expectedRootId:r.expectedRootId,split:r.split,supportedPathPrefix:[...r.supportedPathPrefix],
   maximumSpecificityKnown:r.maximumSpecificityKnown,specificityPath:r.maximumSpecificityKnown?[...r.supportedPathPrefix]:null};
 });
 for(const [split,count]of [['training',128],['calibration',48],['test',32]])assert.equal(rows.filter(r=>r.split===split).length,count);
 for(const n of nodes.filter(n=>n.parentId===null)){
  assert.equal(rows.filter(r=>r.split==='training'&&r.expectedRootId===n.id).length,8);
  assert.equal(rows.filter(r=>r.split==='calibration'&&r.expectedRootId===n.id).length,3);
  assert.equal(rows.filter(r=>r.split==='test'&&r.expectedRootId===n.id).length,2);
 }
 assert.equal(rows.filter(r=>r.split==='test'&&r.maximumSpecificityKnown).length,4);
 return freeze(rows);
}
export async function loadGoldManifest(){
 const documents=[];for(const [name,hash]of Object.entries(GOLD_FILES)){const b=await bytes(name);assert.equal(sha(b),hash);documents.push(JSON.parse(b));}
 const [training,calibration,expansion]=documents;
 assert.equal(training.cases.length,48);assert.equal(calibration.cases.length,48);assert.equal(expansion.status,'proposed');assert.equal(expansion.cases.length,112);
 const sealBytes=await bytes(LABEL_SEAL,65536),seal=JSON.parse(sealBytes);
 assert.equal(sha(sealBytes),LABEL_SEAL_SHA256,'Approved label seal changed');
 assert.equal(seal.schema,'hierarchy-root-expansion-label-seal/v1');assert.equal(seal.approved,true);
 assert.equal(seal.candidateSha256,GOLD_FILES['../../../data/hierarchy-root-expansion-candidates-adr141.json']);
 assert.equal(seal.noScoredFinal,true);
 const taxonomyNodes=TAXONOMY.nodes.map(({id,parentId})=>({id,parentId}));
 const cases=normalizeCases(training.cases,calibration.cases,expansion.cases,taxonomyNodes);
 return freeze({cases,goldSourceHashes:{...GOLD_FILES,[LABEL_SEAL]:sha(sealBytes)},taxonomyNodes,rootNodes:taxonomyNodes.filter(n=>n.parentId===null)});
}
export async function loadManifest(){
  const gold=await loadGoldManifest(),sourceHashes={...gold.goldSourceHashes};
  const cFreeze=await json(C+'freeze.json'),{freezeHash:cHash,...cBody}=cFreeze;
  assert.equal(cHash,'7bf0ee5450ed3cf9768f08c678589767fa7277542a88aa8652f7bd6324ab91fb');assert.equal(digest(cBody),cHash);
  for(const name of ['output/model.json','output/input-definition.json','output/policy.json']){
    const b=await bytes(C+name);sourceHashes[C+name]=sha(b);
  }
  assert.equal(sourceHashes[C+'output/model.json'],'105de0a2c6b8df0aa769df8d6688f94b797845c43bc859aad76f5b5908980b72');
  assert.equal(sourceHashes[C+'output/input-definition.json'],'75d443c8186a375b8e68cdefe383e77a31ef746ae3f725d92f84ae9341b46db2');
  assert.equal(sourceHashes[C+'output/policy.json'],'4472586e5f05a8f54e09d8c707e97f578dc5d29e9c8569772c6603f309f7c631');
  const detailModel=await json(C+'output/model.json'),inputDefinition=await json(C+'output/input-definition.json'),
    baselineDetailPolicy=await json(C+'output/policy.json');
  const dFreeze=await json(D+'freeze.json'),{freezeHash:dHash,...dBody}=dFreeze;
  assert.equal(digest(dBody),dHash);assert.equal(dFreeze.protocol.baseline.modelSha256,sourceHashes[C+'output/model.json']);
  assert.equal(dFreeze.protocol.baseline.freezeHash,cHash);
  // Recheck actual policy-generating code, not just its self-reported receipt.
  for(const [name,expected]of Object.entries(dFreeze.sourceHashes)){
    const actual=sha(await bytes(D+name));assert.equal(actual,expected,'Observed detail source changed');sourceHashes[D+name]=actual;
  }
  const record=await json(D+'output/calibration.json'),p=await bytes(D+'output/policy.json'),test=await json(D+'measured-results.json');
  assert.equal(record.freezeHash,dHash);assert.equal(record.observedPolicySha256,sha(p));assert.equal(record.finalTestEvaluated,false);
  assert.equal(test.freezeHash,dHash);assert.equal(test.observedPolicySha256,sha(p));assert.equal(test.observed.rowCount,142);
  const detailPolicy=JSON.parse(p);compileHierarchyHeadAssignment({model:detailModel,policy:detailPolicy});
  assert.equal(detailPolicy.calibrationIdHashes.length,205);assert.equal(detailPolicy.minimumAcceptedGroups,3);
  for(const name of ['freeze.json','output/calibration.json','output/policy.json','measured-results.json'])sourceHashes[D+name]=sha(await bytes(D+name));
  return freeze({...gold,detailModel,detailPolicy,baselineDetailPolicy,inputDefinition,
    detailArtifacts:{modelSha256:sourceHashes[C+'output/model.json'],policySha256:sha(p),baselinePolicySha256:sourceHashes[C+'output/policy.json'],
      inputDefinitionSha256:sourceHashes[C+'output/input-definition.json'],observedFreezeHash:dHash},sourceHashes});
}
