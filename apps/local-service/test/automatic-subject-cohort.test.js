import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {automaticSubjectTitleTerms as terms,buildAutomaticSubjectCohort as build,AUTOMATIC_COHORT_LIMITS as limits} from '../src/application/automatic-subject-cohort.js';
import {compilePairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {automaticCohortFixture as input,automaticVectorWire as wire} from './fixtures/automatic-subject-cohort.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),axis=Array.from({length:384},(_,i)=>i===0?1:0);

test('title keys are bounded Unicode hints without publisher/instruction words or model work',()=>{
 assert.deepEqual(terms('KIP KAPSALON (met friet) op de KAMADO! - YouTube'),['kip','kapsalon','friet','kamado']);
 assert.deepEqual(terms('Steam Deck OLED Repair Help: Learn How to Fix It Yourself.'),['steam','deck','oled']);
 assert(terms('Roter Panda – Bären und Café').includes('café'));assert.equal(terms('one two three four five six seven eight nine ten eleven').length,8);
 assert(Object.isFrozen(terms('Koalas')));assert.throws(()=>terms('bad\u0000title'),TypeError);
});
test('actual binary64 body/title wires build a general publication input with canonical Source witnesses',()=>{
 const a=input(),r=build(JSON.stringify(a));assert.equal(r.input.observations.length,2);assert.equal(r.input.minimumSimilarity,.8);
 assert.equal(r.input.observations[0].publisherKey,'general.example.org');assert.deepEqual(r.input.observations[0].acceptedPath,['cooking']);
 const w=r.input.sourceWitnesses[0];assert.equal(r.input.observations[0].inputHash,sha(JSON.stringify(Object.values(w))));
 assert.equal(r.input.observations[1].vector[0],.96);assert(Object.isFrozen(r.input.observations));assert.equal(r.assignmentAuthority,false);
});
test('up to128 approximate candidates produce at most64 exact-ranked observations with an explicit lexical reserve',()=>{
 const a=input(128),row=a.rows[120],values=axis.map((_,j)=>j===0?.83:j===120?Math.sqrt(1-.83**2):0),w=wire(values);
 row.lexical=true;row.bodyBase64=row.titleBase64=w.base64;row.bodyWireHash=row.titleWireHash=w.hash;
 const r=build(JSON.stringify(a));assert.equal(r.input.observations.length,64);assert(r.input.observations.some(r=>r.sourceId===row.sourceId));
 assert(r.input.observations.some(r=>r.sourceId===a.seedSourceId));assert.equal(r.work.coordinateProducts,128*384);assert.equal(r.work.lexicalSelected,1);
 assert.equal(r.approximateRetrieval,true);assert.equal(r.globalRecallProven,false);assert.equal(limits.rawCandidates,128);
});
test('below-policy peers are omitted and a seed-only context does not invent a shared topic',()=>{
 const a=input(),w=wire(axis.map((_,i)=>i===1?1:0));a.rows[1].bodyBase64=a.rows[1].titleBase64=w.base64;a.rows[1].bodyWireHash=a.rows[1].titleWireHash=w.hash;
 const r=build(JSON.stringify(a));assert.equal(r.input.observations.length,1);assert.equal(r.input.observations[0].sourceId,a.seedSourceId);
});
test('row order never changes the chosen bounded cohort',()=>{
 const a=input(80),first=build(JSON.stringify(a));a.rows.reverse();assert.deepEqual(build(JSON.stringify(a)),first);
});
test('missing seed, duplicated Source, detached wires, incompatible representations and expanded rows refuse',()=>{
 for(const change of [a=>{a.rows.shift();},a=>{a.rows[1].sourceId=a.rows[0].sourceId;},a=>{a.rows[0].bodyWireHash='f'.repeat(64);},
  a=>{a.representationHash='f'.repeat(64);},a=>{a.rows[0].sourceVersion='-1';},a=>{a.rows[0].unboundedExtra={};},a=>{a.rows[0].supportedPath=['cooking','cooking'];}]){
  const a=input();change(a);assert.throws(()=>build(JSON.stringify(a)));
 }
 const a=input(128);a.rows.push(a.rows[0]);assert.throws(()=>build(JSON.stringify(a)),TypeError);
});
test('wire coordinates are checked before endpoint fusion and their signed zeros are preserved',()=>{
 const a=input(1);a.inputDefinition.bodyWeight=1;a.inputDefinition.titleWeight=0;a.representationHash=describePairedE5Input(compilePairedE5Input(a.inputDefinition)).representationHash;
 const values=[...axis];values[1]=-0;const w=wire(values);a.rows[0].bodyBase64=w.base64;a.rows[0].bodyWireHash=w.hash;
 assert(Object.is(build(JSON.stringify(a)).input.observations[0].vector[1],-0));
 a.rows[0].titleBase64='invalid';assert.throws(()=>build(JSON.stringify(a)));
});
