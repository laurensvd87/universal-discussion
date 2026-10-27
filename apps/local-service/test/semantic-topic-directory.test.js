import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSemanticTopicDirectory,projectSemanticSourceContext} from '../src/domain/semantic-topic-directory.js';

const generation='directory-generation',matcherIdentityHash='a'.repeat(64);
const topology={generation,matcherIdentityHash,nodes:[{id:'games',parentId:null,path:['games']},
 {id:'video-games',parentId:'games',path:['games','video-games']},{id:'gta',parentId:'video-games',path:['games','video-games','gta']},
 {id:'nature',parentId:null,path:['nature']}]};
const policy={revision:2,defaultMaxDepth:1,overrides:[]};
const context={generation,matcherIdentityHash,sourceId:'current-source',sourceVersion:'0',status:'classified',supportedPath:['games','video-games','gta']};
test('owner breadth cuts only an existing supported path and applies identically to the global directory',()=>{
 const broad=projectSemanticSourceContext(topology,policy,context);assert.deepEqual(broad.supportedPath,context.supportedPath);assert.deepEqual(broad.selectedPath,['games']);
 assert.equal(broad.topic.title,'Games');assert.equal(broad.sourceVersion,'0');assert.equal(broad.policyRevision,2);
 assert.deepEqual(projectSemanticTopicDirectory(topology,policy).topics.map(n=>n.id),['games','nature']);
 const specific={revision:3,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]};
 assert.deepEqual(projectSemanticSourceContext(topology,specific,context).selectedPath,context.supportedPath);
 assert.deepEqual(projectSemanticTopicDirectory(topology,specific).topics.map(n=>n.id),['games','gta','nature','video-games']);
});
test('a niche override exposes its supported node without inventing confidence or forcing every sibling to that depth',()=>{
 const niche={revision:4,defaultMaxDepth:1,overrides:[{nodeId:'gta',maxDepth:3}]};
 assert.deepEqual(projectSemanticTopicDirectory(topology,niche).topics.map(n=>n.id),['games','gta','nature']);
 const gta=projectSemanticSourceContext(topology,niche,context);assert.equal(gta.topic.title,'Grand Theft Auto (GTA)');
 const parent=projectSemanticSourceContext(topology,niche,{...context,supportedPath:['games','video-games']});assert.deepEqual(parent.selectedPath,['games']);
 assert.ok(Object.isFrozen(gta.topic.path));assert.deepEqual(Object.keys(gta).sort(),['policyRevision','selectedPath','sourceId','sourceVersion','status','supportedPath','topic']);
});
test('pending, excluded and conservative abstention stay ungrouped rather than selecting a nearby topic',()=>{
 for(const status of ['pending','excluded','classified']){
  const result=projectSemanticSourceContext(topology,policy,{...context,status,supportedPath:[]});assert.deepEqual(result.selectedPath,[]);assert.equal(result.topic,null);assert.equal(result.status,status);
 }
 const empty={generation,matcherIdentityHash:null,nodes:[]};assert.deepEqual(projectSemanticTopicDirectory(empty,policy).topics,[]);
 assert.equal(projectSemanticSourceContext(empty,policy,{...context,matcherIdentityHash:null,status:'pending',supportedPath:[]}).topic,null);
 assert.throws(()=>projectSemanticSourceContext(empty,policy,context),TypeError);
});
test('retired-model owner rules do not break the active topology or manufacture new nodes',()=>{
 const changed={...policy,overrides:[{nodeId:'retired-node',maxDepth:8}]};
 assert.deepEqual(projectSemanticTopicDirectory(topology,changed),projectSemanticTopicDirectory(topology,policy));
 assert.deepEqual(projectSemanticSourceContext(topology,changed,context),projectSemanticSourceContext(topology,policy,context));
 assert.throws(()=>projectSemanticSourceContext(topology,policy,{...context,matcherIdentityHash:'b'.repeat(64)}),TypeError);
 assert.throws(()=>projectSemanticSourceContext(topology,policy,{...context,supportedPath:['games','gta']}),TypeError);
});
