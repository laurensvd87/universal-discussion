import test from 'node:test';import assert from 'node:assert/strict';
import {PUBLIC_SUBJECT_KIND_NODES as nodes} from './public-subject-kind-nodes.js';
import {buildSubjectKindQuestion as question,parseSubjectKinds as parse,readSubjectKindsForBank as read} from './semantic-subject-kinds.js';
test('public kind request has eight subject paths but no old or fresh query content',()=>{
 const text=question(nodes);assert.equal(nodes.length,8);assert.ok(text.length<=2000);
 for(const hidden of ['Queensland','Raclette','Browser','Emulator','H1','F1','https://'])assert.equal(text.includes(hidden),false);
});
test('unknown is preserved and complete literal IDs plus closed kind values are required',()=>{
 const answer=Object.fromEntries(nodes.map((node,i)=>['M'+i,'unknown']));const result=parse(nodes,JSON.stringify(answer));
 assert.equal(result.rows.length,8);assert.equal(result.rows.every(row=>row.kind==='unknown'),true);assert.equal(result.scope.identityProven,false);
 const missing={...answer};delete missing.M0;assert.throws(()=>parse(nodes,JSON.stringify(missing)));
 assert.throws(()=>parse(nodes,JSON.stringify({...answer,M0:'species'})));
 assert.throws(()=>parse(nodes,JSON.stringify(answer).replace('"M0":','"M0":"common-class","M0":')));
 assert.throws(()=>parse(nodes,JSON.stringify(answer).replace('"M0":','"\\u004d0":')));
});
test('kinds join to labels and ancestry as well as exact ordered node identities',()=>{
 const pathNodes=new Map();for(const node of nodes)for(let i=0;i<node.path.length;i++){
  const id=node.path.slice(0,i+1).join('/');if(!pathNodes.has(id))pathNodes.set(id,{id,label:node.path[i],kind:'category',path:node.path.slice(0,i+1).map((_,j)=>node.path.slice(0,j+1).join('/'))});
 }
 const bank={schema:'cached-semantic-topic-bank/v1',nodes:[...pathNodes.values()].filter(row=>!nodes.some(node=>node.path.join('/')===row.id))};
 bank.nodes.push(...nodes.map(node=>({id:node.nodeId,label:node.label,kind:'subject',path:node.path.map((_,i)=>i===node.path.length-1?node.nodeId:node.path.slice(0,i+1).join('/'))})));
 const proposal=parse(nodes,JSON.stringify(Object.fromEntries(nodes.map((node,i)=>['M'+i,'named-entity']))));assert.equal(read(bank,proposal).size,8);
 const changed=structuredClone(bank);changed.nodes.at(-1).label='Another subject';assert.throws(()=>read(changed,proposal));
 const reordered=structuredClone(proposal);reordered.rows.reverse();assert.throws(()=>read(bank,reordered));
});
