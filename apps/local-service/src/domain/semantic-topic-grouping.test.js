import assert from 'node:assert/strict';
import test from 'node:test';
import {compileSemanticTopicGrouping,describeSemanticTopicGrouping,groupSupportedSemanticPath} from './semantic-topic-grouping.js';

const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null},{id:'video-games',parentId:'games'},
 {id:'gta',parentId:'video-games'},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}];
const compile=(policy={revision:0,defaultMaxDepth:1,overrides:[]},tree=nodes)=>compileSemanticTopicGrouping({nodes:tree,policy});

test('one owner default groups confident detail broadly without discarding the supported path',()=>{
 const grouping=compile(),path=['games','video-games','gta'],result=groupSupportedSemanticPath(grouping,path);
 assert.deepEqual(result,{policyRevision:0,supportedPath:path,selectedPath:['games'],nodeId:'games',deepestSupportedNodeId:'gta'});
 path.pop();assert.equal(result.supportedPath.length,3);assert.ok(Object.isFrozen(result.supportedPath));
 assert.equal(groupSupportedSemanticPath(grouping,['nature','animals','koalas']).nodeId,'nature');
});

test('popular topic override can refine Games while niche Nature keeps the broad owner default',()=>{
 const grouping=compile({revision:7,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:8}]});
 assert.equal(groupSupportedSemanticPath(grouping,['games','video-games','gta']).nodeId,'gta');
 assert.equal(groupSupportedSemanticPath(grouping,['nature','animals','koalas']).nodeId,'nature');
 // Increasing specificity never manufactures a descendant or a confident root.
 assert.equal(groupSupportedSemanticPath(grouping,['games']).nodeId,'games');
 assert.equal(groupSupportedSemanticPath(grouping,[]).nodeId,null);
});

test('deepest subtree override wins while other sibling branches retain their rule',()=>{
 const tree=[...nodes,{id:'strategy',parentId:'video-games'},{id:'chess-game',parentId:'strategy'}];
 const grouping=compile({revision:8,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:8},{nodeId:'strategy',maxDepth:3}]},tree);
 assert.equal(groupSupportedSemanticPath(grouping,['games','video-games','gta']).nodeId,'gta');
 assert.equal(groupSupportedSemanticPath(grouping,['games','video-games','strategy','chess-game']).nodeId,'strategy');
 assert.deepEqual(describeSemanticTopicGrouping(grouping).overrides,[{nodeId:'games',maxDepth:8},{nodeId:'strategy',maxDepth:3}]);
});

test('invalid ancestry, unregistered nodes and skipped ancestors cannot create feed groups',()=>{
 const grouping=compile();for(const path of [['gta'],['nature','gta'],['games','gta'],['games','video-games','missing'],['games','games']])
  assert.throws(()=>groupSupportedSemanticPath(grouping,path),TypeError);
 for(const tree of [[...nodes,{id:'games',parentId:null}],nodes.filter(n=>n.id!=='video-games'),
  nodes.map(n=>n.id==='video-games'?{...n,parentId:'gta'}:n)])assert.throws(()=>compile(undefined,tree),TypeError);
});

test('owner policy changes compile as detached snapshots and refuse impossible or ambiguous rules',()=>{
 const policy={revision:1,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]},grouping=compile(policy);
 policy.defaultMaxDepth=8;policy.overrides[0].maxDepth=1;
 assert.equal(groupSupportedSemanticPath(grouping,['games','video-games','gta']).nodeId,'gta');
 for(const bad of [{revision:-1,defaultMaxDepth:1,overrides:[]},{revision:1,defaultMaxDepth:9,overrides:[]},
  {revision:1,defaultMaxDepth:1,overrides:[{nodeId:'gta',maxDepth:1}]},
  {revision:1,defaultMaxDepth:1,overrides:[{nodeId:'missing',maxDepth:3}]},
  {revision:1,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:2},{nodeId:'games',maxDepth:3}]}])assert.throws(()=>compile(bad),TypeError);
});

test('getters, proxies, sparse paths and stale foreign handles refuse without running caller hooks',()=>{
 let hooks=0;const trap=()=>{hooks++;throw Error('untrusted hook');},grouping=compile();
 for(const value of [new Proxy(nodes,{get:trap}),Object.assign([],{length:2}),['games',,'gta']])
  assert.throws(()=>groupSupportedSemanticPath(grouping,value),TypeError);
 const item={id:'games',parentId:null};Object.defineProperty(item,'id',{get:trap});
 assert.throws(()=>compile(undefined,[item,...nodes.slice(1)]),TypeError);
 assert.throws(()=>groupSupportedSemanticPath({},['games']),TypeError);
 assert.throws(()=>compileSemanticTopicGrouping(new Proxy({},{ownKeys:trap,getPrototypeOf:trap})),TypeError);
 assert.equal(hooks,0);
});
