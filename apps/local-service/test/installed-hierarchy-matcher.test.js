import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadInstalledHierarchyMatcher,createInstalledHierarchyMatcherLoaderForTest} from '../src/application/installed-hierarchy-matcher.js';
import {describeRootedHierarchyMatcher,classifyRootedHierarchyMatcher,ROOTED_MATCHER_LIMITS} from '../src/domain/hierarchy-rooted-matcher.js';

const names=['root-model.json','root-policy.json','input-definition.json','gta-detail.json','animals-detail.json','koalas-detail.json','embedding-contract.js','encoder-manifest.json'];
const file=name=>name==='embedding-contract.js'?new URL('../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',import.meta.url)
 :name==='encoder-manifest.json'?new URL('../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json',import.meta.url):new URL('../assets/hierarchy/'+name,import.meta.url);
const bytes=name=>readFile(file(name)),sha=value=>createHash('sha256').update(value).digest('hex');

test('fixed installed numeric artifacts compile one immutable full rooted matcher without loading an encoder',async()=>{
 const [one,two]=await Promise.all([loadInstalledHierarchyMatcher(),loadInstalledHierarchyMatcher()]);assert.equal(one,two);
 assert.equal(one.matcher,two.matcher);assert.deepEqual(Object.keys(one.matcher),[]);
 const d=one.descriptor,identity=describeRootedHierarchyMatcher(one.matcher);assert.equal(d.matcherIdentity,identity);
 assert.equal(d.matcherIdentityHash,sha(JSON.stringify(identity)));assert.equal(identity.nodes.length,20);assert.equal(identity.roots.length,16);
 assert.deepEqual(identity.limits,ROOTED_MATCHER_LIMITS);
 assert.deepEqual(identity.nodes.find(n=>n.id==='video-games'),{id:'video-games',parentId:'games'});
 assert.deepEqual(identity.nodes.find(n=>n.id==='gta'),{id:'gta',parentId:'video-games'});
 assert.deepEqual(identity.nodes.find(n=>n.id==='animals'),{id:'animals',parentId:'nature'});
 assert.deepEqual(identity.nodes.find(n=>n.id==='koalas'),{id:'koalas',parentId:'animals'});
 assert.deepEqual(identity.detailArtifacts.map(a=>({nodeId:a.nodeId,canonicalPath:a.canonicalPath,eligible:a.eligible})),
  [{nodeId:'animals',canonicalPath:['nature','animals'],eligible:true},{nodeId:'gta',canonicalPath:['games','video-games','gta'],eligible:true},
   {nodeId:'koalas',canonicalPath:['nature','animals','koalas'],eligible:true}]);
 assert.equal(d.encoder.encoderHash,'76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3');
 assert.equal(d.encoder.manifestAndContractVerified,true);assert.equal(d.encoder.encoderAssetBytesVerified,false);
 for(const flags of [d,identity])for(const key of ['nativeObservation','productionValidated','assignmentAuthority'])assert.equal(flags[key],false);
 assert.throws(()=>{d.matcherIdentity.nodes[0].parentId='gta';},TypeError);assert.throws(()=>{d.assets['gta-detail.json'].sha256='x';},TypeError);
 assert.throws(()=>{d.encoder.encoderAssetBytesVerified=true;},TypeError);assert.ok(Object.isFrozen(d.matcherIdentity.detailArtifacts[0].canonicalPath));
 await assert.rejects(loadInstalledHierarchyMatcher({path:'elsewhere'}),TypeError);
});

test('accepted raw asset bytes and property order survive installation exactly',async()=>{
 const installed=await loadInstalledHierarchyMatcher();
 for(const name of names){const raw=await bytes(name),pin=installed.descriptor.assets[name];assert.equal(raw.length,pin.bytes);assert.equal(sha(raw),pin.sha256);}
 for(const name of names.slice(0,3))assert.notEqual((await bytes(name)).at(-1),10,'accepted root files deliberately have no final newline');
 assert.equal((await bytes('gta-detail.json')).at(-1),10);
});

test('trusted reader receives only eight fixed names and concurrent load compiles once',async()=>{
 const calls=[],buffers=[];
 const load=createInstalledHierarchyMatcherLoaderForTest({readFixedFile:async name=>{calls.push(name);const raw=await bytes(name);buffers.push(raw);return raw;}});
 const [one,two]=await Promise.all([load(),load()]);assert.equal(one,two);assert.deepEqual(calls,names);
 assert.ok(buffers.every(raw=>raw.every(n=>n===0)),'temporary input bytes are cleared after decode');
 assert.equal(await load(),one);assert.equal(calls.length,8);await assert.rejects(load('root-only'),TypeError);
});

test('any corrupt numeric or encoder identity file refuses the whole matcher with no root-only fallback',async()=>{
 for(const badName of names){
  const load=createInstalledHierarchyMatcherLoaderForTest({readFixedFile:async name=>{const raw=await bytes(name);if(name===badName)raw[0]^=1;return raw;}});
  await assert.rejects(load(),{message:'Installed hierarchy matcher unavailable'});
 }
});

test('failed reads are not cached and retry revalidates every fixed input',async()=>{
 let fail=true,calls=0;
 const load=createInstalledHierarchyMatcherLoaderForTest({readFixedFile:async name=>{calls++;if(fail&&name==='gta-detail.json')throw Error('private path never exposed');return bytes(name);}});
 await assert.rejects(load(),error=>error.message==='Installed hierarchy matcher unavailable'&&!error.message.includes('private'));
 assert.equal(calls,4);fail=false;const result=await load();assert.equal(calls,12);assert.equal(result.descriptor.matcherIdentity.nodes.length,20);
 assert.equal(await load(),result);assert.equal(calls,12);
});

test('retained real public observations preserve accepted species paths and reject plants and physical-game refinements',async()=>{
 const installed=await loadInstalledHierarchyMatcher(),base=new URL('./fixtures/hierarchy-nature-heads/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
 assert.equal(manifest.schema,'retained-public-hierarchy-regressions/v1');assert.equal(manifest.doNotUseAsTraining,true);assert.equal(manifest.cases.length,10);
 for(const spec of manifest.cases){
  const raw=await readFile(new URL(spec.file,base));assert.equal(raw.length,spec.bytes);assert.equal(sha(raw),spec.sha256);const row=JSON.parse(raw);
  const result=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:row.id,sourceVersion:row.sourceInputHash,bodyVector:row.bodyVector,titleVector:row.titleVector});
  assert.deepEqual(result.semanticPath,spec.expectedSemanticPath,spec.file);assert.deepEqual(result.rootPath,row.match.rootPath,spec.file+' root');
 }
 assert.equal(installed.descriptor.matcherIdentity.detailArtifacts.some(a=>a.nodeId==='video-games'),false,'failed general head stays absent; GTA retains its structural ancestor');
});

test('reader outputs cannot bypass exact bounds, buffer type or pins through proxy hooks',async()=>{
 let hooks=0;
 for(const value of [new Uint8Array(143743),Buffer.alloc(143744),new Proxy(Buffer.alloc(1),{get(){hooks++;throw Error('hook');}})]){
  const load=createInstalledHierarchyMatcherLoaderForTest({readFixedFile:()=>value});await assert.rejects(load(),{message:'Installed hierarchy matcher unavailable'});
 }
 assert.equal(hooks,0);
 assert.throws(()=>createInstalledHierarchyMatcherLoaderForTest({readFixedFile:null}),TypeError);
});
