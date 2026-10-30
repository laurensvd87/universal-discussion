import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {proposeFocusedSubjects as propose} from './focus-subjects.js';
import {proposeFocusedSubjects as previous} from '../automatic-topic-discovery-v2/focus-subjects.js';
import {main} from '../../harness/run-stored-topic-label-refinement.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
function input(titles){return {representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,
 observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:hash('input'+i),materialHash:hash('material'+i),title,publisherKey:'publisher'+i+'.test',acceptedPath:['games'],
 vector:Array.from({length:384},(_,j)=>i===0?(j===0?1:0):j===0?.95:j===i?Math.sqrt(1-.95**2):0)}))};}
test('retained V2 reproduces generic Alle; V3 keeps specific GTA6 without that false topic',()=>{
 const a=input(['Alle reden über GTA 6: Was Eltern wissen müssen','GTA 6: Alle neuen Screenshots','GTA 6 erhält eine Erwachsenenfreigabe']);
 assert(previous(JSON.stringify(a)).proposals.some(p=>p.label==='Alle'));
 const r=propose(JSON.stringify(a));assert.equal(r.schema,'automatic-focus-subjects/v3');assert(!r.proposals.some(p=>p.label==='Alle'));
 assert(r.proposals.some(p=>p.label==='GTA 6'));const byKey=new Map(r.proposals.map(p=>[p.proposalKey,p]));assert(r.selections.every(s=>byKey.get(s.preferredProposalKey).label==='GTA 6'));
});
test('bare generic determiners in supported languages cannot become a named subject',()=>{
 for(const generic of ['All','Every','Alle','Iedereen','Tous','Todos','Tutti']){
  const a=input([generic+' reden over GTA 6',generic+' nieuwe GTA 6 screenshots']);const r=propose(JSON.stringify(a));assert(!r.proposals.some(p=>p.label===generic),generic);assert(r.proposals.some(p=>p.label==='GTA 6'));
 }
});
test('concrete names containing a generic modifier remain possible',()=>{
 for(const name of ['All Saints','New York']){const a=input([name+' music and history',name+' tour and archive']);const r=propose(JSON.stringify(a));assert(r.proposals.some(p=>p.label===name),name);}
});
test('natural-case captured witness is preferred over all-caps while source offsets stay genuine',()=>{
 const a=input(['KAPSALON met kip','Kapsalon maken met shoarma']);a.observations.forEach(r=>{r.acceptedPath=['cooking'];});
 const before=previous(JSON.stringify(a));assert(before.proposals.some(p=>p.label==='KAPSALON'));
 const r=propose(JSON.stringify(a)),p=r.proposals.find(p=>p.label==='Kapsalon');assert(p);assert.equal(p.labelWitness.sourceId,'source-1');
 assert.equal(a.observations[1].title.normalize('NFKC').slice(p.labelWitness.start,p.labelWitness.end),p.label);
});
test('same-publisher materials, instructional suffixes and genuine product-family names retain V2 behavior',()=>{
 const a=input(['Steam Deck OLED Repair Help: Learn How to Fix It Yourself.','Steam Deck LCD Repair Help: Learn How to Fix It Yourself.',
  'Nintendo Switch 2 Repair Help: Learn How to Fix It Yourself.','Nintendo Switch OLED Repair Help: Learn How to Fix It Yourself.']);a.observations.forEach(r=>{r.publisherKey='repair.example';});
 const r=propose(JSON.stringify(a));assert(r.proposals.some(p=>p.label==='Steam Deck'));assert(r.proposals.some(p=>p.label==='Nintendo Switch'));
 assert(!r.proposals.some(p=>/^(learn|how|fix|repair|help)\b/iu.test(p.label)));assert(r.selections.every(s=>s.preferredProposalKey!==null));
});
test('duplicates, conflicting roots, singletons and malformed vectors still cannot establish a subject',()=>{
 const duplicate=input(['Koalas','Koalas']);duplicate.observations[1].vector=duplicate.observations[0].vector;assert.equal(propose(JSON.stringify(duplicate)).proposals.length,0);
 const conflict=input(['Kapsalon with chicken','Kapsalon salon interiors']);conflict.observations[0].acceptedPath=['cooking'];conflict.observations[1].acceptedPath=['personal-care'];assert.equal(propose(JSON.stringify(conflict)).proposals.length,0);
 const singleton=input(['Koalas']);assert.equal(propose(JSON.stringify(singleton)).proposals.length,0);singleton.observations[0].vector[0]=NaN;assert.throws(()=>propose(JSON.stringify(singleton)));
});
test('refinement entry refuses selectors without reading protected inputs',async()=>{for(const args of [[],['--refine'],['--refine-stored-labels','other'],null])assert.equal(await main(args),2);});
