// Invented numerical artifacts only. No text/vector encoder attestation, encoder,
// protected registry, SQL, provider or runtime activation is exercised here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildCachedSemanticTopicBank as build,compileCachedSemanticTopicIndex as compile,
 MEMBERSHIP_TOPIC_FALLBACK_POLICY_HASH} from './cached-semantic-topic-index-v5.js';
import {compileCachedSemanticTopicIndex as compileV3} from './cached-semantic-topic-index-v3.js';
import {parseSubjectKinds} from './semantic-subject-kinds.js';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,describePairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {trainBinaryHierarchyDetail} from '../../src/domain/hierarchy-binary-detail.js';
import {fitPooledRootRankPolicy} from '../topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=key=>sha(key),axis=n=>Array.from({length:384},(_,i)=>i===n?1:0);
const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)};
const representation=describePairedE5Input(compilePairedE5Input(inputDefinition));
function bankFixture({arbitrary=false,sibling=false,extraRoot=false,rootVector=axis(0)}={}){
 const keys=arbitrary?['technology','acme','tool-x']:['games','rockstar','gta-vi'];
 const labels=arbitrary?['Technology','Acme','Tool X']:['Games','Rockstar','GTA VI'];
 const rows=[[keys[0],labels[0],null],[keys[1],labels[1],keys[0]],[keys[2],labels[2],keys[1]],
  ['nature','Nature',null],['animals','Animals','nature'],['reptiles','Reptiles','animals'],['koalas','Koalas','animals'],
  ...(sibling?[['publisher-two','Another publisher',keys[0]]]:[]),...(extraRoot?[['science','Science',null]]:[])];
 const bank=build(JSON.stringify({teacherHash:'b'.repeat(64),nodes:rows.map(([key,label,parent])=>({key:id(key),label,parentKey:parent===null?null:id(parent)})),
  cards:[{id:'G',title:labels[2],excerpt:'An invented named subject document.',url:'https://example.org/game'},
   {id:'K',title:'Koalas',excerpt:'An invented class document.',url:'https://example.org/koala'}],
  selections:[{id:'G',leafKey:id(keys[2])},{id:'K',leafKey:id('koalas')}]}));
 const byId=new Map(bank.nodes.map(node=>[node.id,node]));
 const subjectRows=bank.nodes.filter(node=>node.kind==='subject').map(node=>({nodeId:node.id,label:node.label,path:node.path.map(key=>byId.get(key).label)}));
 const kinds=parseSubjectKinds(subjectRows,JSON.stringify(Object.fromEntries(subjectRows.map((node,i)=>['M'+i,node.nodeId===id('koalas')?'common-class':'named-entity']))));
 const encoded=bank.nodes.map(node=>({id:node.id,values:node.rootId===id(keys[0])?rootVector:axis(1)}));
 return {bank,kinds,encoded,keys,labels};
}
function detail(path,positiveAxis){
 const negative=positiveAxis===0?1:0;
 return trainBinaryHierarchyDetail({nodeId:path.at(-1),canonicalPath:path,representation:representation.representation,
  representationHash:representation.representationHash,trainingVersion:'invented-membership-detail',
  trainingRows:[true,true,false,false].map((label,i)=>({id:'t-'+i,groupId:'tg-'+i,label,vector:axis(label?positiveAxis:negative)})),
  calibrationRows:[true,true,true,false,false,false].map((label,i)=>({id:'c-'+i,groupId:'cg-'+i,label,language:'en',vector:axis(label?positiveAxis:negative)}))});
}
function matcher(f,{owner='supported',child='supported',classDetails=false,sibling=false,swapRoots=false,rootsOnly=false,
 nodesOverride=null}={}){
 const roots=[{id:id(f.keys[0]),parentId:null},{id:id('nature'),parentId:null}];
 const model=trainHierarchyLinearHeads({nodes:roots,representation:representation.representation,representationHash:representation.representationHash,
  trainingVersion:'invented-membership-roots',lambda:.1,rows:Array.from({length:4},(_,i)=>({id:'rt-'+i,groupId:'rtg-'+i,split:'training',
   expectedTopicId:roots[i<2?0:1].id,vector:axis((i<2?0:1)^(swapRoots?1:0))}))});
 const core=compileHierarchyLinearHeads(model);
 const policy=fitPooledRootRankPolicy({modelHash:sha(model),representationHash:representation.representationHash,inputConstructionHash:'c'.repeat(64),
  nodeIds:roots.map(node=>node.id),rows:Array.from({length:20},(_,i)=>({id:'rc-'+i,groupId:'rcg-'+i,expectedRootId:roots[i%2].id,
   scores:scoreHierarchyLinearHeads(core,{sourceId:'rc-'+i,sourceVersion:'invented',representation:representation.representation,
    representationHash:representation.representationHash,vector:axis((i%2)^(swapRoots?1:0))}).scores.map(({nodeId,score})=>({nodeId,score}))}))});
 let nodes=roots,details=[];
 if(!rootsOnly){
  const selected=new Set(roots.map(node=>node.id));
  if(owner!=='absent')selected.add(id(f.keys[1]));
  if(owner!=='absent'&&child!=='absent')selected.add(id(f.keys[2]));
  if(classDetails)for(const key of ['animals','reptiles'])selected.add(id(key));
  if(sibling)selected.add(id('publisher-two'));
  nodes=f.bank.nodes.filter(node=>selected.has(node.id)).map(({id,parentId})=>({id,parentId}));
  if(owner!=='absent')details.push(detail(f.keys.slice(0,2).map(id),owner==='supported'?0:2));
  if(owner!=='absent'&&child!=='absent')details.push(detail(f.keys.map(id),child==='supported'?0:2));
  if(classDetails)details.push(detail(['nature','animals'].map(id),1),detail(['nature','animals','reptiles'].map(id),1));
  if(sibling)details.push(detail([f.keys[0],'publisher-two'].map(id),0));
 }
 return compileRootedHierarchyMatcher({rootModel:model,rootPolicy:policy,inputDefinition,nodes:nodesOverride??nodes,detailArtifacts:details});
}
const query=(n=0,patch={})=>({title:'Unseen release',body:'An invented public document with enough neutral body context.',
 bodyVector:axis(n),titleVector:axis(n),ownerGrouping:{defaultMaxDepth:8,overrides:[]},...patch});
const index=(f,m)=>compile(f.bank,f.encoded,f.kinds,m);

test('no membership matcher keeps cosine-only descendants at the prior root',()=>{
 const f=bankFixture(),out=index(f,null).lookup(query());
 assert.deepEqual(out.supportedPath,[id('games')]);assert.deepEqual(out.membership,{evaluated:false,reason:'not-configured'});
 assert.equal(out.scope.assignmentAuthority,false);assert.equal(out.scope.providerUsed,false);assert.equal(out.membershipScope.encoderBindingVerified,false);
 const prior=compileV3(f.bank,f.encoded,f.kinds).lookup(query());
 for(const key of ['supportedPath','selectedPath','labels','reason','aliasMatches','groupingHash','scope'])assert.deepEqual(out[key],prior[key]);
});
test('actual membership heads select named GTA VI or independently supported Rockstar with one general gate',()=>{
 const f=bankFixture();
 for(const row of [
  {options:{},expected:['games','rockstar','gta-vi']},
  {options:{child:'absent'},expected:['games','rockstar']},
  {options:{child:'rejected'},expected:['games','rockstar']},
  {options:{owner:'absent'},expected:['games']},
  {options:{owner:'rejected',child:'rejected'},expected:['games']},
 ]){
  const out=index(f,matcher(f,row.options)).lookup(query());assert.equal(out.aliasMatches,0);
  assert.deepEqual(out.supportedPath,row.expected.map(id));assert.deepEqual(out.selectedPath,out.supportedPath);assert.equal(out.membership.evaluated,true);
 }
});
test('membership supports ordinary class ancestors without a named versus class exception',()=>{
 const f=bankFixture(),out=index(f,matcher(f,{classDetails:true})).lookup(query(1,{title:'Unknown species'}));
 assert.deepEqual(out.selectedPath,['nature','animals','reptiles'].map(id));assert.equal(out.aliasMatches,0);
});
test('independent supported sibling memberships coarsen to their declared common ancestor',()=>{
 const f=bankFixture({sibling:true}),out=index(f,matcher(f,{sibling:true})).lookup(query());
 assert.deepEqual(out.supportedPath,[id('games')]);assert.equal(out.membership.reason,'detail-conflict-root-only');
});
test('membership cannot rescue absent cached roots or refine when independent roots disagree or abstain',()=>{
 const f=bankFixture();
 const disagreed=index(f,matcher(f,{swapRoots:true})).lookup(query());assert.deepEqual(disagreed.supportedPath,[id('games')]);assert.equal(disagreed.membership.reason,'root-disagreed');
 const noCached=index(f,matcher(f)).lookup(query(3));assert.deepEqual(noCached.supportedPath,[]);assert.equal(noCached.membership.evaluated,false);
 const cachedOnly=bankFixture({rootVector:axis(3)}),abstained=index(cachedOnly,matcher(cachedOnly)).lookup(query(3));
 assert.deepEqual(abstained.supportedPath,[id('games')]);assert.equal(abstained.membership.reason,'root-abstained');
});
test('accepted named and class lexical results preserve every prior selection field without membership evaluation',()=>{
 const f=bankFixture(),prior=compileV3(f.bank,f.encoded,f.kinds),current=index(f,matcher(f,{owner:'rejected',child:'rejected'}));
 for(const input of [query(0,{title:'GTA VI'}),query(1,{title:'Koalas'})]){
  const old=prior.lookup(input),out=current.lookup(input);assert(old.aliasMatches>0);
  for(const key of ['supportedPath','selectedPath','labels','reason','aliasMatches','groupingHash','scope'])assert.deepEqual(out[key],old[key]);
  assert.equal(out.membership.evaluated,false);
 }
});

test('independently supported descendants refine lexical Games or Rockstar ancestors without name exceptions',()=>{
 const f=bankFixture(),current=index(f,matcher(f)),prior=compileV3(f.bank,f.encoded,f.kinds);
 for(const title of ['Games','Rockstar']){
  const input=query(0,{title}),before=prior.lookup(input),out=current.lookup(input);
  assert(before.aliasMatches>0);assert(before.supportedPath.length<3);
  assert.deepEqual(out.supportedPath,['games','rockstar','gta-vi'].map(id));
  assert.equal(out.membership.evaluated,true);
 }
});

test('membership cannot replace an accepted named ancestor with a conflicting sibling or erase it',()=>{
 const f=bankFixture({sibling:true}),input=query(0,{title:'Rockstar'});
 for(const options of [{owner:'rejected',child:'absent',sibling:true},{owner:'rejected',child:'rejected'}]){
  const out=index(f,matcher(f,options)).lookup(input);
  assert.deepEqual(out.supportedPath,['games','rockstar'].map(id));
  assert.equal(out.membership.reason,'path-disagreed');
 }
});

test('multiple accepted lexical branches retain their common ancestor despite a deeper numeric nomination',()=>{
 const f=bankFixture({sibling:true}),input=query(0,{title:'Rockstar and Another publisher'});
 const prior=compileV3(f.bank,f.encoded,f.kinds).lookup(input),out=index(f,matcher(f)).lookup(input);
 assert.equal(prior.aliasMatches,2);assert.deepEqual(prior.supportedPath,[id('games')]);
 assert.deepEqual(out.supportedPath,prior.supportedPath);assert.equal(out.membership.evaluated,false);
});
test('owner grouping cuts evidence only after membership and never changes chosen IDs or index identity',()=>{
 const f=bankFixture(),current=index(f,matcher(f)),full=current.lookup(query());
 const coarse=current.lookup(query(0,{ownerGrouping:{defaultMaxDepth:1,overrides:[]}}));
 const specific=current.lookup(query(0,{ownerGrouping:{defaultMaxDepth:1,overrides:[{nodeId:id('rockstar'),maxDepth:3}]}}));
 assert.deepEqual(coarse.supportedPath,full.supportedPath);assert.deepEqual(coarse.selectedPath,[id('games')]);
 assert.deepEqual(specific.selectedPath,full.selectedPath);assert.equal(coarse.indexHash,full.indexHash);assert.notEqual(coarse.groupingHash,full.groupingHash);
});
test('opaque capability and exact shared roots and parent paths reject forged or incompatible membership',()=>{
 const f=bankFixture(),valid=matcher(f);
 for(const forged of [undefined,{},describeRootedHierarchyMatcher(valid),{classify:()=>({semanticPath:['fake']})}])assert.throws(()=>index(f,forged),TypeError);
 const roots=f.bank.nodes.filter(node=>node.parentId===null).map(({id,parentId})=>({id,parentId}));
 const alien=matcher(f,{rootsOnly:true,nodesOverride:[...roots,{id:id('alien'),parentId:id('games')}]});assert.throws(()=>index(f,alien),TypeError);
 const wrongParent=matcher(f,{rootsOnly:true,nodesOverride:[...roots,{id:id('rockstar'),parentId:id('nature')}]});assert.throws(()=>index(f,wrongParent),TypeError);
 const other=bankFixture({arbitrary:true});assert.throws(()=>index(f,matcher(other)),TypeError);
 const extra=bankFixture({extraRoot:true});assert.throws(()=>index(extra,matcher(extra,{rootsOnly:true})),TypeError);
 // A smaller membership inventory is allowed if complete root/path agreement holds.
 assert.deepEqual(index(f,matcher(f,{rootsOnly:true})).lookup(query()).supportedPath,[id('games')]);
});
test('matcher identity changes index identity while prototype and query validation retain v3 boundaries',()=>{
 const f=bankFixture(),full=index(f,matcher(f)),rootOnly=index(f,matcher(f,{rootsOnly:true}));
 assert.notEqual(full.describe().indexHash,rootOnly.describe().indexHash);assert.notEqual(full.describe().indexHash,index(f,null).describe().indexHash);
 assert.equal(full.describe().policyHash,MEMBERSHIP_TOPIC_FALLBACK_POLICY_HASH);
 const changed=bankFixture();changed.encoded[0].values=axis(3);
 assert.notEqual(index(changed,null).describe().indexHash,index(f,null).describe().indexHash);
 assert.equal(compile(f.bank,[...f.encoded].reverse(),f.kinds,null).describe().indexHash,index(f,null).describe().indexHash);
 const before=full.lookup(query());f.encoded[0].values.fill(0);assert.deepEqual(full.lookup(query()),before);
 assert.throws(()=>full.lookup(query(0,{bodyVector:Array(384).fill(0)})),TypeError);
 assert.throws(()=>full.lookup(query(0,{ownerGrouping:{defaultMaxDepth:0,overrides:[]}})),TypeError);
 assert.throws(()=>compile(f.bank,f.encoded,f.kinds),TypeError);
});
test('arbitrary Technology Acme Tool X graph uses the same membership and fallback mechanism',()=>{
 const f=bankFixture({arbitrary:true});
 assert.deepEqual(index(f,matcher(f)).lookup(query()).selectedPath,['technology','acme','tool-x'].map(id));
 assert.deepEqual(index(f,matcher(f,{child:'rejected'})).lookup(query()).selectedPath,['technology','acme'].map(id));
 assert.deepEqual(index(f,null).lookup(query()).selectedPath,[id('technology')]);
});
