import test from 'node:test';import assert from 'node:assert/strict';
import {PUBLIC_SEMANTIC_DEFINITION_NODES as nodes} from './public-semantic-definition-nodes.js';
import {buildTopicDefinitionQuestion as question,parseTopicDefinitions as parse,buildDefinedCachedSemanticTopicBank as build} from './semantic-topic-definitions.js';
import {buildCachedSemanticTopicBank} from './cached-semantic-topic-index.js';
const valid=()=>Object.fromEntries(nodes.map((node,i)=>['N'+i,'A bounded synthetic definition for this topic']));
test('definition request contains only the retained public graph, no transfer pages or known-answer dictionary',()=>{
 const value=question(nodes);assert.equal(nodes.length,24);assert.ok(value.length<=2000);
 for(const absent of ['Nature journal','JavaScript','H1','H12','https://','expectedRoot'])assert.equal(value.includes(absent),false);
 assert.ok(value.includes('Programming languages'));assert.ok(value.includes('parent'));
});
test('all graph IDs, bounded definitions and literal unique JSON keys are required',()=>{
 const raw=valid();assert.equal(parse(nodes,JSON.stringify(raw)).rows.length,24);
 assert.equal(parse(nodes,JSON.stringify(raw)).scope.semanticTruthProven,false);
 const missing={...raw};delete missing.N0;assert.throws(()=>parse(nodes,JSON.stringify(missing)));
 for(const replacement of ['one','a'.repeat(91),' a long enough definition','two\ncontrol words'])assert.throws(()=>parse(nodes,JSON.stringify({...raw,N0:replacement})));
 assert.throws(()=>parse(nodes,JSON.stringify(raw).replace('"N0":','"N0":"A duplicate fake definition","N0":')));
 assert.throws(()=>parse(nodes,'```json\n'+JSON.stringify(raw)+'\n```'));
});
test('definitions change contextual descriptors while preserving paths and grounded search aliases',()=>{
 const graphInput=JSON.stringify({teacherHash:'a'.repeat(64),cards:[{id:'P1',title:'Python',excerpt:'A public programming language page.',url:'https://www.python.org/'}],
  nodes:nodes.map(({id,label,parentId})=>({key:id,label,parentKey:parentId})),selections:[{id:'P1',leafKey:nodes.find(node=>node.label==='Python').id}]});
 const definitions=parse(nodes,JSON.stringify(valid())),before=buildCachedSemanticTopicBank(graphInput),after=build(graphInput,JSON.stringify(definitions));
 assert.notEqual(after.bankHash,before.bankHash);assert.notEqual(after.teacherHash,before.teacherHash);
 assert.deepEqual(after.nodes.map(({id,path,aliases})=>({id,path,aliases})),before.nodes.map(({id,path,aliases})=>({id,path,aliases})));
 assert.equal(after.nodes.every(node=>node.descriptor.startsWith('A bounded synthetic definition')),true);
 assert.equal(after.definitionProvenance.providerAliasesUsed,false);
 assert.throws(()=>build(graphInput,JSON.stringify({...definitions,graphHash:'b'.repeat(64)})));
 const wrong=structuredClone(definitions);wrong.rows[0].nodeId='c'.repeat(64);assert.throws(()=>build(graphInput,JSON.stringify(wrong)));
 assert.throws(()=>question([...nodes].reverse()));
});
