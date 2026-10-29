import test from 'node:test';import assert from 'node:assert/strict';
import {proposeFocusedSubjects as propose} from './focus-subjects.js';
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
function input(titles){return {representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,
 observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:String(i+1).repeat(64),materialHash:String(i+5).repeat(64),title,publisherKey:'repair.example',acceptedPath:['games'],
  vector:axis(0).map((_,j)=>i===0?(j===0?1:0):j===0?.95:j===i?Math.sqrt(1-.95**2):0)}))};}
test('distinct material from one publisher can support a subject without claiming independent publishers',()=>{
 const r=propose(JSON.stringify(input(['Steam Deck OLED Repair Help: Learn How to Fix It Yourself.','Steam Deck LCD Repair Help: Learn How to Fix It Yourself.'])));
 const p=r.proposals.find(p=>p.label==='Steam Deck');assert(p);assert.equal(p.publishers,1);assert.equal(p.distinctInputs,2);assert(r.selections.every(s=>s.preferredProposalKey===p.proposalKey));assert.equal(r.eventIdentityAsserted,false);
});
test('instructional headline templates do not become subject names across unrelated product families',()=>{
 const r=propose(JSON.stringify(input(['Steam Deck OLED Repair Help: Learn How to Fix It Yourself.','Steam Deck LCD Repair Help: Learn How to Fix It Yourself.',
  'Nintendo Switch 2 Repair Help: Learn How to Fix It Yourself.','Nintendo Switch OLED Repair Help: Learn How to Fix It Yourself.'])));
 assert(r.proposals.some(p=>p.label==='Steam Deck'));assert(r.proposals.some(p=>p.label==='Nintendo Switch'));
 assert(!r.proposals.some(p=>/^(learn|how|fix|repair|help)\b/iu.test(p.label)));assert(!r.proposals.some(p=>/repair help$/iu.test(p.label)));assert(r.selections.every(s=>s.preferredProposalKey!==null));
});
test('question prefixes are excluded while concrete shared recipe focus remains selectable',()=>{
 const a=input(['How to make Kapsalon with chicken','How to make Kapsalon with beef','Kapsalon maken']);a.observations.forEach(r=>{r.acceptedPath=['cooking'];});
 const r=propose(JSON.stringify(a));assert(!r.proposals.some(p=>/^how\b/iu.test(p.label)));assert(r.proposals.some(p=>p.label==='Kapsalon'));
});
test('one publisher still cannot manufacture support with duplicates or semantically conflicting material',()=>{
 const a=input(['Steam Deck OLED','Steam Deck OLED']);a.observations[1].vector=a.observations[0].vector;
 assert.equal(propose(JSON.stringify(a)).proposals.length,0);
 const b=input(['Kapsalon with chicken','Kapsalon salon interiors']);b.observations[0].acceptedPath=['cooking'];b.observations[1].acceptedPath=['personal-care'];assert.equal(propose(JSON.stringify(b)).proposals.length,0);
});
test('singletons remain page-only and all old bounded numeric input requirements still apply',()=>{
 const a=input(['New specific product']);const r=propose(JSON.stringify(a));assert.equal(r.proposals.length,0);assert.equal(r.selections[0].preferredProposalKey,null);
 a.observations[0].vector[0]=NaN;assert.throws(()=>propose(JSON.stringify(a)),TypeError);
});
test('one publisher footer cannot become the subject of two different animal pages',()=>{
 const a=input(['Red panda | Example Zoo and Conservation Institute','Giant panda | Example Zoo and Conservation Institute']);a.observations.forEach(r=>{r.acceptedPath=['nature'];});
 const r=propose(JSON.stringify(a));assert(!r.proposals.some(p=>p.label.includes('Example Zoo')));
});
