import test from 'node:test';
import assert from 'node:assert/strict';
import {compileHierarchyLocalEvidence as compile,scoreHierarchyLocalEvidence as score,classifyHierarchyLocalEvidence as classify,
  describeHierarchyLocalEvidence as describe,LOCAL_EVIDENCE_LIMITS as LIMITS} from '../src/domain/hierarchical-e5-local-evidence.js';
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
const mix=(a,b,x)=>{const v=axis(a);v[a]=x;v[b]=Math.sqrt(1-x*x);return v;};
const forest=[{id:'games',parentId:null},{id:'gta',parentId:'games'},{id:'zelda',parentId:'games'},
  {id:'nature',parentId:null},{id:'koalas',parentId:'nature'}];
const example=(id,nodeId,vector,kind='member',groupId=id)=>({id,groupId,nodeId,kind,vector});
function artifact(examples=[example('gta-a','gta',axis(0)),example('koala-a','koalas',axis(1))],nodes=forest){return {
  schema:'hierarchical-e5-local-evidence/v1',representation:'paired-raw-e5-body-title-v1',representationHash:'1'.repeat(64),inputConstructionHash:'2'.repeat(64),
  taxonomyVersion:'reviewed-taxonomy/1',evidenceVersion:'fresh-evidence/1',calibrationVersion:'external-calibration/1',calibrationStatus:'experimental',nodes,examples,
  nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:true,minSupport:1,minSimilarity:.85,minNegativeMargin:0,minRivalMargin:0}))};}
function witness(vector=axis(0),sourceVersion='source-v1'){return {sourceId:'synthetic-source',sourceVersion,
  representation:'paired-raw-e5-body-title-v1',representationHash:'1'.repeat(64),inputConstructionHash:'2'.repeat(64),vector};}
const rule=(a,nodeId,patch)=>Object.assign(a.nodePolicies.find(r=>r.nodeId===nodeId),patch);
const feature=(r,nodeId)=>r.nodes.find(n=>n.nodeId===nodeId);

test('deep accepted member inherits disabled ancestry without parent centroid gate',()=>{
  const a=artifact();rule(a,'games',{enabled:false});const h=compile(a),r=classify(h,witness());
  assert.deepEqual(r.selectedPath,['games','gta']);assert.equal(r.primaryNodeId,'gta');assert.equal(r.assignmentAuthority,false);
  assert.equal(r.productionValidated,false);assert(Object.isFrozen(r.selectedPath));assert(!JSON.stringify(r).includes('vector'));
  assert(r.work.countedUnits<=r.work.preflightUpperBound);assert(r.work.preflightUpperBound<=LIMITS.maxWork);
});
test('sibling set returns supported LCA; different root set abstains',()=>{
  const a=artifact([example('a','gta',axis(0)),example('b','zelda',axis(0))]);rule(a,'games',{enabled:false});
  const r=classify(compile(a),witness());assert.deepEqual(r.selectedPath,['games']);assert.equal(r.plausiblePaths.length,2);
  const b=artifact([example('a','gta',axis(0)),example('b','koalas',axis(0))]);
  const s=classify(compile(b),witness());assert.equal(s.status,'unresolved');assert.equal(s.reason,'cross-root-ambiguity');assert.deepEqual(s.selectedPath,[]);
});
test('no nearest unrelated fallback, no ancestor from two failing children',()=>{
  assert.equal(classify(compile(artifact()),witness(axis(3))).status,'unresolved');
  const a=artifact([example('a','gta',axis(0)),example('b','zelda',axis(0))]);rule(a,'games',{enabled:false});
  rule(a,'gta',{minRivalMargin:.01});rule(a,'zelda',{minRivalMargin:.01});assert.equal(classify(compile(a),witness()).status,'unresolved');
});
test('STOP excludes strict descendants; plausible STOP retained even beside stronger child',()=>{
  const a=artifact([example('gta-a','gta',axis(0)),example('generic','games',mix(0,1,.9),'stop')]);
  const h=compile(a),raw=score(h,witness());assert.equal(feature(raw,'gta').accepted,true);assert.equal(feature(raw,'games').plausibleStop,true);
  assert.deepEqual(classify(h,witness()).selectedPath,['games']);
  const b=artifact([example('gta-a','gta',mix(0,1,.9)),example('generic','games',axis(0),'stop')]);
  const rawB=score(compile(b),witness());assert.equal(feature(rawB,'gta').accepted,false);assert.equal(feature(rawB,'gta').negativeSimilarity,1);
});
test('root-only member is not child negative; unknown child stops at supported parent',()=>{
  const a=artifact([example('known','gta',axis(0)),example('root-only','games',axis(2))]);
  const h=compile(a),q=witness(axis(2)),f=score(h,q);assert.equal(feature(f,'gta').negativeSimilarity,null);
  assert.equal(feature(f,'gta').bestIncompatiblePositive,null);assert.deepEqual(classify(h,q).selectedPath,['games']);
});
test('outside scope applies to its subtree, not parent/siblings; exact negative ties reject',()=>{
  const a=artifact([example('a','gta',axis(0)),example('b','games',axis(0)),example('not-gta','gta',axis(0),'outside')]);
  const f=score(compile(a),witness());assert.equal(feature(f,'gta').accepted,false);assert.equal(feature(f,'games').negativeSimilarity,null);
  assert.deepEqual(classify(compile(a),witness()).selectedPath,['games']);
  const b=artifact([example('a','gta',axis(0)),example('outside-games','games',axis(0),'outside')]);
  assert.equal(classify(compile(b),witness()).status,'unresolved');
  const f2=score(compile(b),witness());assert.equal(feature(f2,'gta').negativeSimilarity,1);assert.equal(feature(f2,'gta').negativeMargin,0);
});
test('rival is incompatible positive ambiguity, never ancestor evidence or outside label',()=>{
  const nodes=[{id:'root',parentId:null},{id:'child',parentId:'root'}];
  const a=artifact([example('root-only','root',axis(0)),example('child','child',mix(0,1,.9))],nodes);
  rule(a,'child',{minRivalMargin:1});const f=score(compile(a),witness());assert.equal(feature(f,'child').bestIncompatiblePositive,null);
  assert.equal(feature(f,'child').negativeSimilarity,null);assert.equal(feature(f,'child').accepted,true);
  const b=artifact([example('a','gta',axis(0)),example('b','zelda',axis(0))]);const raw=score(compile(b),witness());
  assert.equal(feature(raw,'gta').bestIncompatiblePositive,1);assert.equal(feature(raw,'gta').rivalMargin,0);assert.equal(feature(raw,'gta').negativeSimilarity,null);
  rule(b,'gta',{minRivalMargin:.01});assert.equal(feature(score(compile(b),witness()),'gta').accepted,false);
});
test('translations/multiple captures are max-per-group, never independent support',()=>{
  const a=artifact([example('translation-a','gta',axis(0),'member','entity'),example('translation-b','gta',axis(1),'member','entity')]);
  for(const r of a.nodePolicies)r.minSupport=2;let h=compile(a),f=feature(score(h,witness()),'gta');
  assert.equal(f.positiveGroupCount,1);assert.equal(f.bestSimilarity,1);assert.equal(f.support,1);assert.equal(classify(h,witness()).status,'unresolved');
  a.examples.push(example('independent','gta',axis(0)));h=compile(a);assert.equal(classify(h,witness()).primaryNodeId,'gta');
  for(const patch of [{nodeId:'games'},{kind:'stop'}]){const b=artifact([...a.examples,{...a.examples[0],id:'conflicting',...patch}]);assert.throws(()=>compile(b));}
});
test('raw strongest eight group scores plus total counts, detached immutable features',()=>{
  const a=artifact(Array.from({length:10},(_,i)=>example('group-'+i,'gta',axis(0))));const f=feature(score(compile(a),witness()),'gta');
  assert.equal(f.positiveSimilarities.length,8);assert.equal(f.positiveGroupCount,10);assert.equal(f.support,10);assert(Object.isFrozen(f.positiveSimilarities));
  assert.equal(f.stopGroupCount,0);assert.equal(f.bestStopSimilarity,null);
});
test('private copies, permutation stable hashes, signed-zero and calibration/construction identities',()=>{
  const a=artifact(),h=compile(a),before=describe(h);a.examples[0].vector[0]=0;rule(a,'gta',{enabled:false});
  assert.equal(classify(h,witness()).primaryNodeId,'gta');assert.equal(describe(h).artifactHash,before.artifactHash);
  const b=artifact();b.nodes.reverse();b.examples.reverse();b.nodePolicies.reverse();assert.equal(describe(compile(b)).artifactHash,before.artifactHash);
  const c=artifact();c.examples[0].vector[3]=-0;assert.notEqual(describe(compile(c)).artifactHash,before.artifactHash);
  const d=artifact();d.calibrationVersion='external-calibration/2';assert.notEqual(describe(compile(d)).artifactHash,before.artifactHash);
  assert.throws(()=>classify(h,{...witness(),inputConstructionHash:'3'.repeat(64)}),e=>e.code==='identity-mismatch');
  const r=classify(h,witness(axis(0),'A')),s=classify(h,witness(axis(0),'B')),t=classify(h,witness(axis(1),'A'));
  assert.equal(r.source.sourceVersion,'A');assert.equal(s.source.sourceVersion,'B');assert.equal(t.source.sourceVersion,'A');assert.equal(t.primaryNodeId,'koalas');
});
test('strict namespace/schema/proxy/getter/dense/finite/unit protections',()=>{
  let called=false;const a=artifact();Object.defineProperty(a,'examples',{enumerable:true,get(){called=true;throw Error();}});assert.throws(()=>compile(a));assert.equal(called,false);
  assert.throws(()=>compile(new Proxy(artifact(),{})));const b=artifact();b.examples[0].vector=new Proxy(axis(0),{});assert.throws(()=>compile(b));
  const c=artifact();Object.defineProperty(c.examples[0].vector,'0',{enumerable:true,get(){called=true;throw Error();}});assert.throws(()=>compile(c));assert.equal(called,false);
  for(const rep of ['raw-e5','pinned-ridge'])assert.throws(()=>compile({...artifact(),representation:rep}));
  for(const mutate of [a=>a.extra=true,a=>delete a.inputConstructionHash,a=>a.examples.push(a.examples[0]),a=>a.nodePolicies[0].minSupport=0,
    a=>a.nodePolicies[0].minRivalMargin=-1,a=>a.examples[0].vector[0]=NaN,a=>a.examples[0].vector[0]=.5,a=>delete a.examples[0].vector[2]]){
    const x=artifact();mutate(x);assert.throws(()=>compile(x));
  }
  const h=compile(artifact());assert.throws(()=>score(h,new Proxy(witness(),{})));assert.throws(()=>score({},witness()));assert.throws(()=>score(h,{...witness(),extra:true}));
});
test('forest bounds, direct-group budgets, depth/cycles/missing parent refuse',()=>{
  for(const nodes of [[{id:'a',parentId:'missing'}],[{id:'a',parentId:'b'},{id:'b',parentId:'a'}],
    Array.from({length:9},(_,i)=>({id:'n'+i,parentId:i?'n'+(i-1):null}))])assert.throws(()=>compile(artifact([example('a',nodes[0].id,axis(0))],nodes)));
  assert.throws(()=>compile({...artifact(),nodes:Array(513).fill({id:'x',parentId:null})}),e=>e.code==='capacity');
  assert.throws(()=>compile({...artifact(),examples:Array(2049).fill({})}),e=>e.code==='capacity');
  assert.throws(()=>compile(artifact(Array.from({length:33},(_,i)=>example('g'+i,'gta',axis(0))))),e=>e.code==='capacity');
});
test('max-work topology preflight rejects before query coordinate work, never broad fallback',()=>{
  const nodes=Array.from({length:512},(_,i)=>({id:'n'+String(i).padStart(3,'0'),parentId:i?'n000':null}));
  const examples=Array.from({length:2048},(_,i)=>example('e'+i,'n000',axis(0),'outside','single-entity'));
  const h=compile(artifact(examples,nodes));assert(describe(h).scoringPreflightUpperBound>LIMITS.maxWork);
  let touched=false;const q=witness();Object.defineProperty(q,'vector',{enumerable:true,get(){touched=true;throw Error();}});
  assert.throws(()=>classify(h,q),e=>e.code==='capacity');assert.equal(touched,false);
});
