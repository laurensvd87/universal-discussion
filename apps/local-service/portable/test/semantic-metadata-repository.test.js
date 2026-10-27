import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalV4SemanticMetadataRepository} from '../canonical-v4/semantic-metadata-repository.js';

const generation='metadata-generation',hash='a'.repeat(64);
const topology=()=>({generation,matcherIdentityHash:hash,nodes:[
 {id:'games',parentId:null,path:['games']},{id:'gta',parentId:'video-games',path:['games','video-games','gta']},
 {id:'nature',parentId:null,path:['nature']},{id:'video-games',parentId:'games',path:['games','video-games']},
]});
const context=()=>({generation,matcherIdentityHash:hash,sourceId:'source-one',sourceVersion:'0',status:'classified',supportedPath:['games','video-games','gta']});
const fixture=value=>createCanonicalV4SemanticMetadataRepository({database:{query:async()=>({rows:[{metadata:value}]})}});
const corrupt={code:'storage-corrupt'};

test('active public topology preserves the complete ancestry without exporting model or material',async()=>{
 const calls=[],value=topology(),repo=createCanonicalV4SemanticMetadataRepository({database:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{metadata:value}]};}}});
 const result=await repo.topics({generation});assert.deepEqual(result,value);assert.ok(Object.isFrozen(result.nodes[1].path));
 assert.deepEqual(calls,[{sql:'SELECT canonical_v4.semantic_read_topic_nodes($1) AS metadata',args:[generation]}]);
 value.nodes[1].path[0]='changed';assert.equal(result.nodes[1].path[0],'games');
 assert.deepEqual(Object.keys(result).sort(),['generation','matcherIdentityHash','nodes']);
});

test('null head exposes an empty topology and current Source pending state without inventing exclusion',async()=>{
 assert.deepEqual(await fixture({generation,matcherIdentityHash:null,nodes:[]}).topics({generation}),{generation,matcherIdentityHash:null,nodes:[]});
 const value={...context(),matcherIdentityHash:null,status:'pending',supportedPath:[]};
 assert.deepEqual(await fixture(value).sourceContext({generation,sourceId:'source-one'}),value);
});

test('topology rejects incomplete, cyclic, contradictory, duplicate and unordered paths',async()=>{
 const mutations=[v=>{v.generation='other';},v=>{v.nodes[1].parentId='nature';},v=>{v.nodes[1].path=['nature','video-games','gta'];},
  v=>{v.nodes[1].path=['gta','video-games','gta'];},v=>{v.nodes=v.nodes.filter(n=>n.id!=='video-games');},
  v=>{v.nodes.reverse();},v=>{v.nodes.push(structuredClone(v.nodes[0]));},v=>{v.nodes=[];},v=>{v.matcherIdentityHash=null;},
  v=>{v.nodes[0].id='games\u200b';},v=>{v.nodes[1].path=Array.from({length:9},(_,i)=>'x'+i);},v=>{v.privateVector=[1];}];
 for(const change of mutations){const value=topology();change(value);await assert.rejects(fixture(value).topics({generation}),corrupt);}
});

test('node count and aggregate bytes are both bounded before publishing topology',async()=>{
 const tooMany={generation,matcherIdentityHash:hash,nodes:Array.from({length:513},(_,i)=>({id:'node-'+String(i).padStart(3,'0'),parentId:null,path:['node-'+String(i).padStart(3,'0')]}))};
 await assert.rejects(fixture(tooMany).topics({generation}),corrupt);
 // Valid ancestry with long names can expand metadata substantially even when
 // the node count and each path independently fit their limits.
 const nodes=[],chain=[];
 for(let i=0;i<7;i++){const id='a'+String(i)+'x'.repeat(155);chain.push(id);nodes.push({id,parentId:i?chain[i-1]:null,path:[...chain]});}
 for(let i=0;i<505;i++){const id='z'+String(i).padStart(3,'0')+'x'.repeat(155);nodes.push({id,parentId:chain.at(-1),path:[...chain,id]});}
 assert.equal(nodes.length,512);assert.ok(Buffer.byteLength(JSON.stringify(nodes))>524288);
 await assert.rejects(fixture({generation,matcherIdentityHash:hash,nodes}).topics({generation}),corrupt);
});

test('Source context binds generation, ID and lossless current version while preserving classified abstention',async()=>{
 const value=context(),repo=fixture(value),result=await repo.sourceContext({generation,sourceId:'source-one'});
 assert.deepEqual(result,value);assert.ok(Object.isFrozen(result.supportedPath));
 for(const status of ['classified','excluded','pending']){
  const item={...context(),status,supportedPath:[],sourceVersion:'9223372036854775807'};
  assert.equal((await fixture(item).sourceContext({generation,sourceId:'source-one'})).status,status);
 }
 for(const change of [v=>{v.generation='other';},v=>{v.sourceId='other';},v=>{v.sourceVersion=0;},v=>{v.sourceVersion='9223372036854775808';},
  v=>{v.status='excluded';},v=>{v.status='pending';},v=>{v.matcherIdentityHash=null;},v=>{v.status='ready';},v=>{v.title='private source title';}]){
  const bad=context();change(bad);await assert.rejects(fixture(bad).sourceContext({generation,sourceId:'source-one'}),corrupt);
 }
});

test('malformed records, accessors, sparse arrays and proxy values refuse without used-field hooks',async()=>{
 let hooks=0;const accessor=topology();Object.defineProperty(accessor.nodes[0],'path',{enumerable:true,get(){hooks++;return ['games'];}});
 const sparse=topology();sparse.nodes=new Array(1);
 const proxy=new Proxy(topology(),{get(){hooks++;throw Error('hook');},getPrototypeOf(){hooks++;throw Error('hook');}});
 for(const value of [accessor,sparse,proxy])await assert.rejects(fixture(value).topics({generation}),corrupt);
 assert.equal(hooks,0);
 let queries=0;const repo=createCanonicalV4SemanticMetadataRepository({database:{query(){queries++;assert.fail('Invalid request');}}});
 assert.throws(()=>repo.topics({generation,query:'caller-selected'}),TypeError);assert.equal(queries,0);
});

test('finite SQL failures distinguish forgotten Sources and stale generations without exposing server messages',async()=>{
 for(const [sql,code] of [['P1241','conflict'],['P1242','not-found'],['P1243','invalid'],['P1244','storage-corrupt'],['XX000','storage-failure']]){
  const repo=createCanonicalV4SemanticMetadataRepository({database:{async query(){throw Object.assign(Error('private SQL source data'),{code:sql});}}});
  await assert.rejects(repo.sourceContext({generation,sourceId:'source-one'}),error=>error.code===code&&!error.message.includes('private'));
 }
});
