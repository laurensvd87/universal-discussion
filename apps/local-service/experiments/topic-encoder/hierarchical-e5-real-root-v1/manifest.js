// Read-only, pinned experiment inputs. No predictions, capture or owner DB.
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
  '../../../data/hierarchy-curated-web-gold-adr134.json':'4119a66986e9d73fd564eb83637ba92f7c5305c316037b7c609b27ca78488933',
  '../../../data/hierarchy-real-root-test-supplement-adr136.json':'76cd1484c84e6305e1b2cd283d389eb6d1f8c9fdfbb86e72d31cb04d8067bd86'
});
async function bytes(name,maximum=8*1024*1024){
  const url=new URL(name,here),stat=await lstat(url);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum);
  const b=await readFile(url);assert.equal(b.length,stat.size);return b;
}
const json=async name=>JSON.parse(await bytes(name));
const freeze=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;};

export async function loadGoldManifest(){
  const documents=[];for(const [name,expected]of Object.entries(GOLD_FILES)){
    const b=await bytes(name,1024*1024);assert.equal(sha(b),expected,'Real gold bytes changed');documents.push(JSON.parse(b));
  }
  const [training,calibration,oldTest,supplement]=documents;
  assert.equal(training.status,'sealed');assert.equal(calibration.status,'curation-complete-awaiting-execution-protocol-approval');assert.equal(supplement.status,'sealed');
  assert.equal(training.cases.length,48);assert.equal(calibration.cases.length,48);assert.equal(oldTest.cases.length,32);assert.equal(supplement.cases.length,4);
  const taxonomySha=sha(await bytes('../hierarchical-e5-paired-v1/taxonomy.js'));
  for(const d of documents)assert.equal(d.taxonomySha256,taxonomySha);
  const taxonomyNodes=TAXONOMY.nodes.map(({id,parentId})=>({id,parentId})),rootNodes=taxonomyNodes.filter(n=>n.parentId===null);
  assert.equal(rootNodes.length,16);const roots=new Set(rootNodes.map(n=>n.id)),nodes=new Map(taxonomyNodes.map(n=>[n.id,n]));
  const cases=[...training.cases,...calibration.cases].map(row=>{
    assert.equal(row.labelScope,'root-only');assert.ok(!Object.hasOwn(row,'expectedTopicId'),'Do not fabricate child negatives');
    return {...row,specificityPath:null};
  });
  // Four input-development pages are excluded; their entity-independent replacements
  // restore two root cases each without replaying consumed diagnostic inputs.
  const excluded=new Set(['web-01','web-02','web-03','web-04']);
  cases.push(...oldTest.cases.filter(r=>!excluded.has(r.id)).map(r=>({...r,split:'test',expectedRootId:r.centralRootId,specificityPath:null})),
    ...supplement.cases.map(r=>({...r,specificityPath:[...r.supportedPath]})));
  const ids=new Set(),groups=new Set(),urls=new Set(),titles=new Set(),languages=new Set(['en','de','nl','fr','es']);
  const normalized=[];
  for(const row of cases){
    for(const key of ['id','entityGroup','language','publicUrl','articleTitle'])assert.ok(typeof row[key]==='string'&&row[key].length>0&&row[key].length<=512);
    assert.ok(!ids.has(row.id)&&!groups.has(row.entityGroup)&&!urls.has(row.publicUrl));ids.add(row.id);groups.add(row.entityGroup);urls.add(row.publicUrl);
    const title=row.articleTitle.normalize('NFKC').toLocaleLowerCase('en-US');assert.ok(!titles.has(title));titles.add(title);
    assert.ok(languages.has(row.language)&&roots.has(row.expectedRootId));assert.ok(['training','calibration','test'].includes(row.split));
    const u=new URL(row.publicUrl);assert.equal(u.origin,`https://${row.language}.wikipedia.org`);
    assert.ok(u.pathname.startsWith('/wiki/')&&!u.search&&!u.hash&&!u.username&&!u.password&&!u.port);
    assert.ok(!excluded.has(row.id));
    if(row.specificityPath!==null){
      assert.ok(row.specificityPath.length>0&&row.specificityPath.length<=8&&row.specificityPath[0]===row.expectedRootId);
      let parent=null;for(const id of row.specificityPath){assert.equal(nodes.get(id)?.parentId,parent);parent=id;}
      assert.ok(!taxonomyNodes.some(n=>n.parentId===parent),'Only four verified terminal anchors receive specificity scoring');
    }
    normalized.push({id:row.id,entityGroup:row.entityGroup,language:row.language,publicUrl:row.publicUrl,articleTitle:row.articleTitle,
      expectedRootId:row.expectedRootId,split:row.split,specificityPath:row.specificityPath});
  }
  for(const [split,count]of [['training',48],['calibration',48],['test',32]]){
    const part=normalized.filter(r=>r.split===split);assert.equal(part.length,count);
    for(const root of roots)assert.equal(part.filter(r=>r.expectedRootId===root).length,split==='test'?2:3);
  }
  assert.equal(normalized.filter(r=>r.specificityPath!==null).length,4);
  return freeze({cases:normalized,goldSourceHashes:{...GOLD_FILES},taxonomyNodes,rootNodes});
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
