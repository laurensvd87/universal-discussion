import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildCachedSemanticTopicBank as build,compileCachedSemanticTopicIndex as compile} from './cached-semantic-topic-index.js';
const id=value=>createHash('sha256').update(value).digest('hex');
const vector=axis=>Array.from({length:384},(_,i)=>i===axis?1:0);
function fixture(){
 const nodes=[['games','Games',null],['gta','Grand Theft Auto','games'],['v','Grand Theft Auto V','gta'],['vi','Grand Theft Auto VI','gta'],
 ['nature','Nature',null],['animals','Animals','nature'],['koalas','Koalas','animals'],['technology','Technology',null],['dolphin','Dolphin','technology']]
 .map(([key,label,parent])=>({key:id(key),label,parentKey:parent?id(parent):null}));
 const cards=[['P1','Grand Theft Auto V','https://www.rockstargames.com/gta-v','v'],['P2','Grand Theft Auto VI','https://www.rockstargames.com/VI','vi'],
 ['P3','Koala Facts','https://animals.example/koala','koalas'],['P4','Dolphin - KDE','https://apps.example/dolphin','dolphin']];
 const input={teacherHash:'a'.repeat(64),nodes,cards:cards.map(([id,title,url])=>({id,title,url,excerpt:'Public evidence for the assigned topic.'})),
 selections:cards.map(([card,,,node])=>({id:card,leafKey:id(node)}))};
 const bank=build(JSON.stringify(input));
 const index=compile(bank,bank.nodes.map(node=>({id:node.id,values:vector(node.rootId===id('games')?0:node.rootId===id('nature')?1:2)})));
 return {input,bank,index};
}
const query=(title,axis,ownerGrouping={defaultMaxDepth:8,overrides:[]})=>({title,body:'This is a fresh public document with enough context.',
 titleVector:vector(axis),bodyVector:vector(axis),ownerGrouping});
test('aliases come from proposed labels and actual assigned title/URL spellings without gold input',()=>{
 const {bank}=fixture();assert.ok(bank.nodes.find(n=>n.id===id('gta')).aliases.some(a=>a.label==='gta'&&a.basis==='assigned-url-initialism'));
 assert.equal(bank.nodes.find(n=>n.id===id('vi')).aliases.some(a=>a.label==='gta vi'),false);
 assert.equal(bank.scope.canonicalIdsAssigned,false);assert.ok(Object.isFrozen(bank.nodes));
});
test('Roman numeral boundaries retain the named game while explicit sibling mentions select their shared family',()=>{
 const {index}=fixture();assert.equal(index.lookup(query('Grand Theft Auto V',0)).selectedPath.at(-1),id('v'));
 assert.equal(index.lookup(query('Grand Theft Auto VI',0)).selectedPath.at(-1),id('vi'));
 assert.equal(index.lookup(query('Grand Theft Auto V and Grand Theft Auto VI',0)).selectedPath.at(-1),id('gta'));
 assert.equal(index.lookup(query('GTA 6',0)).selectedPath.at(-1),id('gta'));
});
test('word inflections retrieve an observed koala and owner policy selects only a supported prefix',()=>{
 const {index}=fixture();assert.equal(index.lookup(query('Koala',1)).selectedPath.at(-1),id('koalas'));
 const policy={defaultMaxDepth:1,overrides:[{nodeId:id('animals'),maxDepth:3}]};
 assert.equal(index.lookup(query('Koala',1,policy)).selectedPath.at(-1),id('koalas'));
 assert.deepEqual(index.lookup(query('Koala',1,{defaultMaxDepth:1,overrides:[]})).selectedPath,[id('nature')]);
});
test('semantic context can reject a matching software name rather than relabelling an animal',()=>{
 const {index}=fixture(),result=index.lookup(query('Dolphin',1));
 assert.notEqual(result.selectedPath.at(-1),id('dolphin'));assert.deepEqual(result.selectedPath,[id('nature')]);
 assert.equal(result.scope.providerUsed,false);assert.equal(result.scope.assignmentAuthority,false);
});
test('unknown names and a surname component do not become an arbitrary known subject',()=>{
 const {index}=fixture();assert.equal(index.lookup(query('Unknown new product',2)).selectedPath.at(-1),id('technology'));
 assert.equal(index.lookup(query('River Dolphin',2)).selectedPath.at(-1),id('technology'));
 assert.notEqual(index.lookup(query('Dolphinfish',2)).selectedPath.at(-1),id('dolphin'));
});
test('cycles, absent graph targets, prototype mismatch and invalid vectors are refused',()=>{
 const {input,bank,index}=fixture();const cycle=structuredClone(input);cycle.nodes[0].parentKey=id('v');assert.throws(()=>build(JSON.stringify(cycle)));
 const missing=structuredClone(input);missing.selections[0].leafKey='b'.repeat(64);assert.throws(()=>build(JSON.stringify(missing)));
 assert.throws(()=>compile(bank,[]));const invalid=query('Koala',1);invalid.bodyVector[1]=NaN;assert.throws(()=>index.lookup(invalid));
});
