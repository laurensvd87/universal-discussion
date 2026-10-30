import test from 'node:test';import assert from 'node:assert/strict';
import {loadSupportedHierarchyMatcher,loadSupportedHierarchyMatchers} from '../src/application/supported-hierarchy-matchers.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
const LEGACY='eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c';
test('fixed numeric registry retains current default and reconstructs exact supported historical topology',async()=>{
 const current=await loadInstalledHierarchyMatcher(),all=await loadSupportedHierarchyMatchers();
 assert.equal(all.length,2);assert.equal(all[0],current);assert(Object.isFrozen(all));
 const legacy=await loadSupportedHierarchyMatcher(LEGACY);assert.equal(legacy,all[1]);
 assert.equal(legacy.descriptor.matcherIdentity.nodes.length,18);assert.equal(legacy.descriptor.matcherIdentity.roots.length,16);
 assert.deepEqual(legacy.descriptor.matcherIdentity.detailArtifacts.map(d=>d.nodeId),['gta']);
 assert.equal(legacy.descriptor.matcherIdentity.representationHash,current.descriptor.matcherIdentity.representationHash);
 assert.equal(legacy.descriptor.encoder,current.descriptor.encoder);
 for(const value of all){assert(Object.isFrozen(value.descriptor));assert.equal(value.descriptor.assignmentAuthority,false);assert.equal(value.descriptor.productionValidated,false);}
 assert.equal(await loadInstalledHierarchyMatcher(),current);
});
test('unknown malformed and caller-selected variants remain unavailable',async()=>{
 for(const value of [null,undefined,{},'gta','a'.repeat(64),LEGACY.toUpperCase()])await assert.rejects(loadSupportedHierarchyMatcher(value),{code:'unavailable'});
 await assert.rejects(loadSupportedHierarchyMatcher(LEGACY,{path:'other'}),{code:'unavailable'});
 await assert.rejects(loadSupportedHierarchyMatchers({path:'other'}),{code:'unavailable'});
});
test('concurrent known requests share immutable compiled numeric artifacts without model sessions',async()=>{
 const values=await Promise.all(Array.from({length:8},()=>loadSupportedHierarchyMatcher(LEGACY)));
 assert(values.every(value=>value===values[0]));
 assert.equal(values[0].descriptor.encoder.encoderAssetBytesVerified,false);
 assert.equal(values[0].descriptor.nativeObservation,false);
});
