// Pure causal setup checks. No native API, process, database, inference or model
// assets: an owned-SQL sentinel stops the actual generic assertions at case0.
import test from 'node:test';import assert from 'node:assert/strict';
import {numericMatcher} from './semantic-native-assertions.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,describePairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {runAutomaticSubjectNativeAssertions,AUTOMATIC_SUBJECT_NATIVE_CASES,automaticSubjectNativeCommand} from './automatic-subject-native-assertions.js';
import {planAutomaticNamedSubjectsV2 as plan,GENERAL_SUBJECT_POLICY_V2_HASH as policyHash} from '../../src/application/automatic-named-subject-plan.js';

test('a full derived input definition is not a legal three-field compiler request',()=>{
 const identity=describeRootedHierarchyMatcher(numericMatcher('general-causal'));
 assert.throws(()=>compilePairedE5Input(identity.inputDefinition),TypeError);
 const d=identity.inputDefinition,compiled=compilePairedE5Input({bodyWeight:d.bodyWeight,titleWeight:d.titleWeight,encoderHash:d.encoderHash});
 assert.equal(describePairedE5Input(compiled).representationHash,identity.representationHash);
});

test('the corrected actual component reaches its first owned SQL call and preserves the sentinel failure',async()=>{
 const matcher=numericMatcher('general-source-sentinel'),sentinel=Error('stop before owned SQL'),cases=[];let calls=0;
 const owner={async query(){throw Error('unexpected earlier SQL');},async exec(sql){calls++;assert(sql.includes('CREATE TABLE canonical_v4.named_subject_ids'));throw sentinel;}};
 const unavailable={async query(){assert.fail('no other SQL may execute before owned schema admission');}};
 await assert.rejects(runAutomaticSubjectNativeAssertions({owner,worker:unavailable,app:unavailable,observer:unavailable,generation:'invented-generation',matcher,cases}),e=>e===sentinel);
 assert.equal(calls,1);assert.deepEqual(cases,[{name:AUTOMATIC_SUBJECT_NATIVE_CASES[0],status:'failed'}]);
});

test('a malformed SQL fixture mutates a wire copy while the real plan remains immutable',()=>{
 const titles=['Steam Deck OLED battery replacement','Steam Deck OLED screen replacement','Steam Deck LCD battery replacement','Steam Deck LCD screen replacement'];
 const input={generation:'invented-generation',policyHash,representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,candidates:[],
  observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:String(i+1).repeat(64),materialHash:String(i+5).repeat(64),title,publisherKey:'general.example.org',acceptedPath:[],
   vector:Array.from({length:384},(_,j)=>j===0?.97:j===i+3?Math.sqrt(1-.97**2):0)})),
  sourceWitnesses:titles.map((_,i)=>({sourceId:'source-'+i,sourceVersion:'0',operationId:'operation-'+i,operationDigest:'c'.repeat(64),sourceStamp:'d'.repeat(64)}))};
 const original=plan(JSON.stringify(input));assert(original.updates.length>=2);assert.throws(()=>{original.updates[0].parentId=original.updates[1].subjectId;},TypeError);
 const wire=automaticSubjectNativeCommand(input);assert(!Object.isFrozen(wire.updates[0]));
 wire.updates[0].parentId=wire.updates[1].subjectId;wire.updates[1].parentId=wire.updates[0].subjectId;
 assert.equal(wire.updates[0].parentId,wire.updates[1].subjectId);assert(Object.isFrozen(original.updates[0]));
});
