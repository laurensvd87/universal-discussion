import test from 'node:test';import assert from 'node:assert/strict';
import {readRelationCandidates,buildRelationQuestion,parseRelationProposal,SYNTHETIC_RELATION_CANDIDATES as data,SYNTHETIC_RELATION_EXPECTED as expected} from './semantic-relation.js';
test('synthetic evidence fits the normal question contract and never embeds expected answers',()=>{
 const question=buildRelationQuestion(data);assert.ok(question.length<=2000);assert.ok(question.includes('Testprämissen'));
 assert.equal(question.includes(JSON.stringify(expected)),false);assert.equal(question.includes('sourceId'),false);
 const p=parseRelationProposal(data,JSON.stringify(expected));assert.equal(p.edges.length,2);assert.equal(p.equivalences.length,2);assert.equal(p.scope.assignmentAuthority,false);
});
test('a valid parse cannot confer Source, provider, publication or truth authority',()=>{
 const p=parseRelationProposal(data,JSON.stringify(expected));for(const k of ['semanticTruthProven','providerConsentGranted','sourceWitnessesVerified','assignmentAuthority','publication','liveChanged'])assert.equal(p.scope[k],false);
 assert.equal(p.relations.P8,'unknown');assert.equal(p.edges.some(e=>e.child==='u'),false);
});
test('duplicate keys, missing cases, unsolicited output, invented relations and entities are refused',()=>{
 for(const body of ['```json\n'+JSON.stringify(expected)+'\n```',JSON.stringify({...expected,P9:'same'}),JSON.stringify({...expected,P1:'related'}),
  '{"P1":"same",'+JSON.stringify(expected).slice(1),JSON.stringify({...expected,P8:null})])assert.throws(()=>parseRelationProposal(data,body));
 assert.throws(()=>readRelationCandidates({...data,pairs:[{id:'x',a:'unknown-node',b:'k'}]}));
});
test('parent cycles and contradictions after same-subject collapse cannot become a hierarchy',()=>{
 const nodes=[{id:'a',label:'A',hint:'premise A'},{id:'b',label:'B',hint:'premise B'},{id:'c',label:'C',hint:'premise C'}],
  pairs=[{id:'x',a:'a',b:'b'},{id:'y',a:'b',b:'c'},{id:'z',a:'c',b:'a'}];
 assert.throws(()=>parseRelationProposal({nodes,pairs},'{"x":"narrower","y":"narrower","z":"narrower"}'));
 assert.throws(()=>parseRelationProposal({nodes,pairs},'{"x":"same","y":"same","z":"separate"}'));
 assert.throws(()=>parseRelationProposal({nodes,pairs},'{"x":"same","y":"same","z":"narrower"}'));
});
test('aliases collapse deterministically while valid proposed ancestry remains directional',()=>{
 const nodes=[{id:'z',label:'Z',hint:'alias A'},{id:'a',label:'A',hint:'same alias'},{id:'b',label:'B',hint:'broader'}],
  pairs=[{id:'x',a:'z',b:'a'},{id:'y',a:'z',b:'b'}],p=parseRelationProposal({nodes,pairs},'{"x":"same","y":"narrower"}');
 assert.deepEqual(p.equivalences,[['a','z']]);assert.deepEqual(p.edges,[{child:'a',parent:'b'}]);
});
