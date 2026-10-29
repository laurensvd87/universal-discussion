// Pure causal setup checks. No native API, process, database, inference or model
// assets: an owned-SQL sentinel stops the actual generic assertions at case0.
import test from 'node:test';import assert from 'node:assert/strict';
import {numericMatcher} from './semantic-native-assertions.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,describePairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {runAutomaticSubjectNativeAssertions,AUTOMATIC_SUBJECT_NATIVE_CASES} from './automatic-subject-native-assertions.js';

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
