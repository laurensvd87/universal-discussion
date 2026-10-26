import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecificityManifest,validateSpecificityBatch,deriveBatchNetworkScope,digest,RESOURCE_ORIGINS} from './manifest.js';

function fixture(){
 const cases=[];for(const split of ['training','calibration','test'])for(let i=0;i<(split==='test'?72:48);i++){
  const id=split==='test'&&i<2?`adr159-test-${i===0?'054':'083'}`:`invented-${split}-${i}`;
  const unverified=split==='test'&&i<2,gold={kind:'complete',path:['games','video-games','gta']};
  cases.push({id,groupId:'group-'+id,split,role:'leaf',nodeId:'gta',publicUrl:`https://publisher${i%7}.org/${id}`,publicSupportUrl:`https://support-only.org/${id}`,language:i%2?'de':'en',publisherFamily:`family-${split}-${i%(split==='test'?25:24)}`,proposedGold:gold,assessmentGold:unverified?null:{...gold,path:[...gold.path]},labelStatus:unverified?'unverified':'verified',referenceAnnotation:split==='training'?{nodeId:'gta',kind:'member'}:null,formatState:'not-a-challenge'});
 }
 const body={schema:'hierarchy-native-specificity-panel/v1',cases,counts:{},sourceDigests:{},taxonomy:{unionNodeCount:25},assessmentPolicy:{allOriginalRowsAndDenominatorsRetained:true,unverifiedOrDisputedProposedGoldNeverPassedToAssessor:true},limitations:{},fullyReviewedGoldReady:false,nativeReady:false,modelReady:false,productionValidated:false,assignmentAuthority:false};
 return {panel:{...body,panelIdentity:digest(body)},expectedPanelIdentity:digest(body)};
}
function build(){return buildSpecificityManifest(fixture());}
const clone=x=>JSON.parse(JSON.stringify(x));
const pinned=(m,b=m.batches[0])=>({manifest:m,batch:b,expectedPanelIdentity:m.panelIdentity,expectedManifestHash:m.manifestHash});

test('invented168 projection becomes24+18 four-case batches, preserving all global identities/nullgold',()=>{
 const f=fixture(),m=buildSpecificityManifest(f);assert.equal(m.cases.length,168);assert.equal(m.batches.length,42);
 assert.equal(m.batches.filter(b=>b.phase==='train-cal').length,24);assert.equal(m.batches.filter(b=>b.phase==='test').length,18);
 assert.deepEqual(m.cases.map(r=>r.id),f.panel.cases.map(r=>r.id));assert.deepEqual(m.cases.filter(r=>r.assessmentGold===null).map(r=>r.id),['adr159-test-054','adr159-test-083']);
 for(const b of m.batches){assert.equal(b.cases.length,4);assert.deepEqual(b.cases.map(r=>r.nativeOrdinal),[1,2,3,4]);for(const c of b.cases)assert.equal(m.cases[c.globalOrdinal-1].id,c.id);}
 assert.equal(new Set(m.batches.map(b=>b.batchId)).size,42);assert.equal(m.batches.at(-1).batchIndex,18);assert.ok(Object.isFrozen(m.cases[0].proposedGold.path));
 f.panel.cases[0].groupId='mutated';assert.notEqual(m.cases[0].groupId,'mutated');
});
test('panel external pin and recomputed property-order identity are mandatory',()=>{
 const f=fixture();assert.throws(()=>buildSpecificityManifest({...f,expectedPanelIdentity:'0'.repeat(64)}));
 f.panel.cases[0].groupId='tampered';assert.throws(()=>buildSpecificityManifest(f));
 const g=fixture();g.panel.panelIdentity='0'.repeat(64);assert.throws(()=>buildSpecificityManifest(g));
});
test('deterministic manifest binds original mixed split order without reordering cases',()=>{
 const a=fixture(),b=fixture();assert.equal(buildSpecificityManifest(a).manifestHash,buildSpecificityManifest(b).manifestHash);
 b.panel.cases=[...b.panel.cases.slice(96),...b.panel.cases.slice(0,96)];const {panelIdentity,...body}=b.panel;b.panel.panelIdentity=digest(body);b.expectedPanelIdentity=digest(body);
 const m=buildSpecificityManifest(b);assert.equal(m.cases[0].split,'test');assert.equal(m.batches[0].cases[0].globalOrdinal,73);assert.notEqual(m.manifestHash,buildSpecificityManifest(a).manifestHash);
});
test('batch validation requires separate owner pins, not supplied self-hashes',()=>{
 const m=build();assert.deepEqual(validateSpecificityBatch(pinned(m)),m.batches[0]);
 assert.throws(()=>validateSpecificityBatch({...pinned(m),expectedManifestHash:'0'.repeat(64)}));
 const forged=clone(m);forged.cases[0].groupId='different';const {manifestHash,...body}=forged;forged.manifestHash=digest(body);
 assert.throws(()=>validateSpecificityBatch({...pinned(m),manifest:forged}));
 const bad=clone(m.batches[0]);bad.cases[0].nativeOrdinal=5;assert.throws(()=>validateSpecificityBatch(pinned(m,bad)));
 assert.throws(()=>validateSpecificityBatch(pinned(m,{...m.batches[0],batchId:m.batches[1].batchId})));
});
test('primary-only scopes retain literal5CDN and never add support aliases',()=>{
 const m=build(),b=m.batches[0],s=deriveBatchNetworkScope(m,b);assert.deepEqual(s.cdnOrigins,RESOURCE_ORIGINS);assert.ok(s.hosts.length<=9);
 assert.equal(s.primaryHosts.length,4);assert.ok(!m.networkScope.hosts.includes('support-only.org'));assert.ok(!s.hosts.includes('support-only.org'));
 assert.equal(s.batchId,b.batchId);assert.equal(s.panelIdentity,m.panelIdentity);assert.ok(Object.isFrozen(s.hosts));
});
test('descriptor-safe copies reject proxies/accessors/sparse/extended arrays before traps',()=>{
 const f=fixture();let calls=0;const proxy=new Proxy(f.panel,{ownKeys(){calls++;throw Error();}});
 assert.throws(()=>buildSpecificityManifest({...f,panel:proxy}));
 Object.defineProperty(f.panel.cases[0],'id',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>buildSpecificityManifest(f));assert.equal(calls,0);
 for(const change of [f=>{delete f.panel.cases[2];},f=>{f.panel.cases.extra=1;},f=>{f.panel[Symbol('x')]=1;}]){const g=fixture();change(g);assert.throws(()=>buildSpecificityManifest(g));}
});
test('bounded schemas refuse bad split/family/status/nullgold and capacity',()=>{
 for(const change of [p=>{p.cases.pop();},p=>{p.cases[0].split='other';},p=>{p.cases[48].publisherFamily=p.cases[0].publisherFamily;},p=>{p.cases[96].assessmentGold=p.cases[96].proposedGold;},p=>{p.cases[0].labelStatus='disputed';},p=>{p.nativeReady=true;},p=>{p.cases[0].groupId='x'.repeat(161);},p=>{p.limit='x'.repeat(16385);}]){
  const f=fixture();change(f.panel);const {panelIdentity,...body}=f.panel;f.panel.panelIdentity=digest(body);f.expectedPanelIdentity=digest(body);assert.throws(()=>buildSpecificityManifest(f));
 }
});
test('split and labelStatus are primitive strings, never property-key-coerced arrays',()=>{
 for(const key of ['split','labelStatus']){
  const f=fixture();f.panel.cases[0][key]=[f.panel.cases[0][key]];const {panelIdentity,...body}=f.panel;
  f.panel.panelIdentity=digest(body);f.expectedPanelIdentity=digest(body);assert.throws(()=>buildSpecificityManifest(f));
 }
});
