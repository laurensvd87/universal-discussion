import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildCachedSemanticTopicBank as build,compileCachedSemanticTopicIndex as compile,
 SEMANTIC_CATEGORY_FALLBACK_POLICY_HASH} from './cached-semantic-topic-index-v4.js';
import {compileCachedSemanticTopicIndex as compileV3} from './cached-semantic-topic-index-v3.js';
import {parseSubjectKinds} from './semantic-subject-kinds.js';

const id=name=>createHash('sha256').update(name).digest('hex');
const axis=()=>[1,...Array(383).fill(0)];
const cosine=score=>[score,Math.sqrt(1-score*score),...Array(382).fill(0)];
function fixture({omitReptiles=false,scores={},categoryKinds={}}={}){
 const nodes=[['nature','Nature',null],['animals','Animals','nature'],
  ...(!omitReptiles?[['reptiles','Reptiles','animals']]:[]),['mammals','Mammals','animals'],
  ['koalas','Koalas','animals'],['plants','Plants','nature'],['technology','Technology',null],
  ['software','Software','technology'],['python','Python','software']]
  .map(([key,label,parent])=>({key:id(key),label,parentKey:parent?id(parent):null}));
 const input={teacherHash:'a'.repeat(64),nodes,cards:[
  {id:'K',title:'Koala care',excerpt:'Public document about the observed species.',url:'https://example.org/koala'},
  {id:'P',title:'Python programming',excerpt:'Public document about the named programming language.',url:'https://example.org/python'}],
 selections:[{id:'K',leafKey:id('koalas')},{id:'P',leafKey:id('python')}]};
 const bank=build(JSON.stringify(input)),byId=new Map(bank.nodes.map(node=>[node.id,node]));
 const subjects=bank.nodes.filter(node=>node.kind==='subject').map(node=>({nodeId:node.id,label:node.label,path:node.path.map(key=>byId.get(key).label)}));
 const kinds=parseSubjectKinds(subjects,JSON.stringify(Object.fromEntries(subjects.map((node,i)=>['M'+i,node.nodeId===id('koalas')?'common-class':'named-entity']))));
 const score={nature:.95,animals:.91,reptiles:.88,mammals:.65,koalas:.99,plants:.5,technology:.1,software:.2,python:.3,...scores};
 const encoded=bank.nodes.map(node=>({id:node.id,values:cosine(score[Object.keys(score).find(key=>id(key)===node.id)])}));
 const categoryKindsJson=JSON.stringify({schema:'semantic-category-kinds/v1',bankHash:bank.bankHash,
  rows:bank.nodes.filter(node=>node.kind==='category').map(node=>({nodeId:node.id,kind:categoryKinds[node.label]??'common-class'}))});
 return {bank,encoded,kinds,categoryKindsJson,index:compile(bank,encoded,kinds,categoryKindsJson),old:compileV3(bank,encoded,kinds)};
}
const query=(patch={})=>({title:'Wetland serpents',body:'These creatures live near water and shelter among stones and reeds.',
 titleVector:axis(),bodyVector:axis(),ownerGrouping:{defaultMaxDepth:8,overrides:[]},...patch});
const path=(...names)=>names.map(id);

test('unknown Snakes absent from the bank reaches existing supported Reptiles without any alias',()=>{
 const f=fixture(),input=query();assert(!f.bank.nodes.some(node=>node.label==='Snakes'));
 assert.deepEqual(f.old.lookup(input).selectedPath,path('nature'));
 const result=f.index.lookup(input);assert.equal(result.aliasMatches,0);
 assert.deepEqual(result.selectedPath,path('nature','animals','reptiles'));
 assert.equal(result.reason,'semantic-category-ancestor');assert.equal(result.scope.assignmentAuthority,false);
 assert.equal(result.scope.providerUsed,false);assert.equal(result.scope.liveChanged,false);
});

test('missing or weak Reptiles evidence falls back to Animals rather than a known species',()=>{
 for(const options of [{omitReptiles:true},{scores:{reptiles:.79}}]){
  const f=fixture(options),result=f.index.lookup(query());assert.deepEqual(result.selectedPath,path('nature','animals'));
  assert(!result.selectedPath.includes(id('koalas')));
 }
});

test('weak category evidence preserves the root and weak independent root evidence abstains',()=>{
 const f=fixture({scores:{animals:.79,reptiles:.79}});assert.deepEqual(f.index.lookup(query()).selectedPath,path('nature'));
 const noRoot=fixture({scores:{nature:.79}}).index.lookup(query());assert.deepEqual(noRoot.supportedPath,[]);
 assert.deepEqual(noRoot.categoryFallback,{considered:0,contenders:[]});
});

test('a stronger broad category cannot suppress a separately supported more specific descendant',()=>{
 const result=fixture({scores:{animals:.99,reptiles:.81}}).index.lookup(query());
 assert.deepEqual(result.selectedPath,path('nature','animals','reptiles'));
});

test('ambiguous Reptiles and Mammals coarsen to their existing Animals ancestor',()=>{
 const result=fixture({scores:{reptiles:.88,mammals:.875}}).index.lookup(query());
 assert.deepEqual(result.selectedPath,path('nature','animals'));assert.equal(result.reason,'semantic-category-common-ancestor');
 assert.equal(result.categoryFallback.contenders.length,2);
});

test('a sufficient peer margin selects the most specific supported branch',()=>{
 const result=fixture({scores:{reptiles:.9,mammals:.87}}).index.lookup(query());
 assert.deepEqual(result.selectedPath,path('nature','animals','reptiles'));
});

test('competing branches outside Animals coarsen to Nature and other-root contradiction prevents refinement',()=>{
 const broad=fixture({scores:{reptiles:.88,plants:.875}}).index.lookup(query());
 assert.deepEqual(broad.selectedPath,path('nature'));
 for(const scores of [{software:.94},{python:.99}]){
  const result=fixture({scores}).index.lookup(query());assert.deepEqual(result.selectedPath,path('nature'));
 }
});

test('title/body agreement and substantial body context remain necessary for category refinement',()=>{
 const f=fixture();
 assert.deepEqual(f.index.lookup(query({titleVector:[0,0,1,...Array(381).fill(0)]})).selectedPath,path('nature'));
 assert.deepEqual(f.index.lookup(query({body:'Short excerpt.'})).selectedPath,path('nature'));
});

test('strong semantic scores never nominate known named subjects or unsupported species',()=>{
 const f=fixture({scores:{koalas:1,python:.99}}),result=f.index.lookup(query());
 assert(!result.supportedPath.includes(id('koalas'))&&!result.supportedPath.includes(id('python')));
 assert(!result.supportedPath.includes(id('snakes')));assert.equal(result.aliasMatches,0);
});

test('owner grouping changes only presentation and has no effect on evidence, index identity or canonical IDs',()=>{
 const f=fixture(),full=f.index.lookup(query()),coarse=f.index.lookup(query({ownerGrouping:{defaultMaxDepth:1,overrides:[]}}));
 const explicit=f.index.lookup(query({ownerGrouping:{defaultMaxDepth:1,overrides:[{nodeId:id('animals'),maxDepth:3}]}}));
 assert.deepEqual(coarse.selectedPath,path('nature'));assert.deepEqual(coarse.supportedPath,full.supportedPath);
 assert.deepEqual(explicit.selectedPath,full.selectedPath);assert.equal(coarse.indexHash,full.indexHash);
 assert.notEqual(coarse.groupingHash,full.groupingHash);assert.equal(full.scope.canonicalIdsAssigned,undefined);
});

test('accepted proper names and common-class lexical matches keep the v3 result unchanged except version identity',()=>{
 const f=fixture();
 for(const title of ['Koala','Queensland koala','Python']){
  const values=title==='Python'?f.encoded.find(row=>row.id===id('python')).values:axis();
  const input=query({title,titleVector:values,bodyVector:values}),old=f.old.lookup(input),current=f.index.lookup(input);
  assert(old.aliasMatches>0,'the regression must exercise an accepted lexical match');
  for(const field of ['supportedPath','selectedPath','labels','reason','aliasMatches','scope'])assert.deepEqual(current[field],old[field]);
  assert.notEqual(current.indexHash,old.indexHash);assert.equal(current.fallbackPolicyHash,SEMANTIC_CATEGORY_FALLBACK_POLICY_HASH);
  assert.equal(current.categoryFallback.considered,0);
 }
});

test('strong details cannot rescue an ambiguous independent root',()=>{
 const result=fixture({scores:{nature:.95,technology:.94,reptiles:1}}).index.lookup(query());
 assert.deepEqual(result.supportedPath,[]);assert.equal(result.categoryFallback.considered,0);
});

test('policy identity is explicit, vectors are detached, and invalid query shape/vectors/policy still refuse',()=>{
 const f=fixture(),before=f.index.lookup(query());assert.notEqual(f.index.describe().indexHash,f.old.describe().indexHash);
 f.encoded[0].values.fill(0);assert.deepEqual(f.index.lookup(query()),before);
 for(const patch of [{bodyVector:Array(384).fill(0)},{titleVector:[NaN,...Array(383).fill(0)]},{ownerGrouping:{defaultMaxDepth:0,overrides:[]}}])assert.throws(()=>f.index.lookup(query(patch)));
 assert.throws(()=>compile(f.bank,f.encoded,f.kinds));
 assert.throws(()=>compile(f.bank,f.encoded,f.kinds,f.categoryKindsJson,'extra'));
});

test('explicit class meanings bind identity and unknown or named meanings cannot gain semantic membership',()=>{
 const f=fixture(),blocked=fixture({categoryKinds:{Reptiles:'named-entity'}}),unknown=fixture({categoryKinds:{Animals:'unknown'}});
 assert.deepEqual(blocked.index.lookup(query()).selectedPath,path('nature','animals'));
 assert.deepEqual(unknown.index.lookup(query()).selectedPath,path('nature'));
 assert.notEqual(f.index.describe().indexHash,blocked.index.describe().indexHash);
 assert.notEqual(f.index.describe().categoryKindsHash,blocked.index.describe().categoryKindsHash);
 assert.deepEqual(fixture({categoryKinds:{Nature:'unknown'}}).index.lookup(query()).selectedPath,[]);
});

test('category meaning metadata must cover the exact bank and every structural candidate',()=>{
 const f=fixture();
 for(const patch of [{bankHash:'b'.repeat(64)},{rows:[]},{schema:'other'}]){
  assert.throws(()=>compile(f.bank,f.encoded,f.kinds,JSON.stringify({...JSON.parse(f.categoryKindsJson),...patch})));
 }
 const wrong=JSON.parse(f.categoryKindsJson);wrong.rows[0].kind='anything';
 assert.throws(()=>compile(f.bank,f.encoded,f.kinds,JSON.stringify(wrong)));
 const ordered=JSON.parse(f.categoryKindsJson);
 for(const rows of [[...ordered.rows].reverse(),[ordered.rows[0],...ordered.rows.slice(0,-1)],
  [null,...ordered.rows.slice(1)]])assert.throws(()=>compile(f.bank,f.encoded,f.kinds,JSON.stringify({...ordered,rows})));
 assert.throws(()=>compile(f.bank,f.encoded,f.kinds,' '.repeat(131073)));
});

test('a structural named family cannot acquire unknown pages through similarity, including via common-class descendants',()=>{
 const nodes=[['games','Games',null],['gta','Grand Theft Auto','games'],['versions','Versions','gta'],
  ['v','Grand Theft Auto V','versions'],['vi','Grand Theft Auto VI','versions']].map(([key,label,parent])=>({key:id(key),label,parentKey:parent?id(parent):null}));
 const bank=build(JSON.stringify({teacherHash:'a'.repeat(64),nodes,cards:[
  {id:'V',title:'Grand Theft Auto V',excerpt:'An observed named game.',url:'https://example.org/v'},
  {id:'VI',title:'Grand Theft Auto VI',excerpt:'Another observed named game.',url:'https://example.org/vi'}],
 selections:[{id:'V',leafKey:id('v')},{id:'VI',leafKey:id('vi')}]}));
 const byId=new Map(bank.nodes.map(node=>[node.id,node]));
 const subjects=bank.nodes.filter(node=>node.kind==='subject').map(node=>({nodeId:node.id,label:node.label,path:node.path.map(key=>byId.get(key).label)}));
 const kinds=parseSubjectKinds(subjects,JSON.stringify(Object.fromEntries(subjects.map((_,i)=>['M'+i,'named-entity']))));
 const encoded=bank.nodes.map(node=>({id:node.id,values:cosine(node.id===id('games')?.95:.99)}));
 const categoryKindsJson=JSON.stringify({schema:'semantic-category-kinds/v1',bankHash:bank.bankHash,
  rows:bank.nodes.filter(node=>node.kind==='category').map(node=>({nodeId:node.id,kind:node.id===id('gta')?'named-entity':'common-class'}))});
 const index=compile(bank,encoded,kinds,categoryKindsJson),out=index.lookup(query({title:'Unseen interactive release'}));
 assert.deepEqual(out.selectedPath,path('games'));assert.equal(out.aliasMatches,0);
 const named=index.lookup(query({title:'Grand Theft Auto V'}));assert.deepEqual(named.selectedPath,path('games','gta','versions','v'));
});
