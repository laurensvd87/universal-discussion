import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_SEMANTIC_CATEGORY_KINDS as meanings} from './public-semantic-category-kinds.js';
import {PUBLIC_SEMANTIC_DEFINITION_NODES as nodes} from './public-semantic-definition-nodes.js';
import {PUBLIC_SUBJECT_KIND_NODES as subjects} from './public-subject-kind-nodes.js';

test('explicit meanings cover precisely the public structural categories, preserving named GTA ancestry',()=>{
 const subjectIds=new Set(subjects.map(node=>node.nodeId));
 assert.deepEqual(meanings.map(row=>row.nodeId),nodes.filter(node=>!subjectIds.has(node.id)).map(node=>node.id));
 const byId=new Map(nodes.map(node=>[node.id,node.label]));
 assert.deepEqual(meanings.filter(row=>row.kind==='named-entity').map(row=>byId.get(row.nodeId)),['Grand Theft Auto']);
 assert(meanings.every(row=>row.kind==='common-class'||byId.get(row.nodeId)==='Grand Theft Auto'));
 assert(Object.isFrozen(meanings)&&meanings.every(Object.isFrozen));
});
