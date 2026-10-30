import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {screenStoredTopics,STORED_TOPIC_SCREEN_SQL,STORED_TOPIC_SCREEN_PROBES} from './stored-topic-screen.js';
import {main} from './run-stored-topic-screen.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function wire(axis){const b=Buffer.alloc(20+384*12);b.writeInt32BE(1,0);b.writeInt32BE(0,4);b.writeUInt32BE(701,8);b.writeInt32BE(384,12);b.writeInt32BE(1,16);for(let i=0;i<384;i++){b.writeInt32BE(8,20+i*12);b.writeDoubleBE(i===axis?1:0,24+i*12);}return {raw:b.toString('base64'),sha256:hash(b)};}
function fixture(){const v=wire(0);return {rows:[0,1].map(i=>({sourceId:'source-'+i,sourceVersion:'1',operationId:'operation-'+i,operationDigest:hash('operation'+i),sourceStamp:hash('stamp'+i),probe:'koalas',title:'Koalas',url:'https://example'+i+'.test/koalas',acceptedPath:['nature','animals','koalas'],bodyBase64:v.raw,bodyWireHash:v.sha256,titleBase64:v.raw,titleWireHash:v.sha256})),inputDefinition:{bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},matcherHash:'b'.repeat(64)};}
test('four declared comparisons use distinct input representations without publishing or encoding',()=>{
 const f=fixture(),r=screenStoredTopics(f);assert.deepEqual(r.variants.map(v=>v.id),['paired-v1','paired-v2','body-only-v2','title-only-v2']);
 assert.equal(r.rows,2);assert.equal(new Set(r.variants.map(v=>v.representationHash)).size,3);assert.ok(r.variants.every(v=>v.timing.repetitions===30));
 assert.equal(r.scope.databaseWrites,false);assert.equal(r.scope.newEncoder,false);assert.equal(r.scope.representativeAccuracy,false);assert.equal(r.scope.endToEndLatency,false);
 // Identical vectors/material cannot fabricate two independent pages.
 assert.ok(r.variants.every(v=>v.assigned===0));
});
test('stored binary64 corruption, row overflow and duplicate sources refuse before comparison',()=>{
 for(const patch of [{bodyWireHash:'c'.repeat(64)},{titleBase64:'invalid'},{probe:'arbitrary'}]){const f=fixture();Object.assign(f.rows[0],patch);assert.throws(()=>screenStoredTopics(f));}
 const f=fixture();f.rows[1].sourceId=f.rows[0].sourceId;assert.throws(()=>screenStoredTopics(f));f.rows=Array(49).fill(f.rows[0]);assert.throws(()=>screenStoredTopics(f));
});
test('query remains bounded before material joins, parameterized, readonly and title-only',()=>{
 assert.match(STORED_TOPIC_SCREEN_SQL,/LIMIT 8/u);assert.match(STORED_TOPIC_SCREEN_SQL,/LIMIT 48$/u);assert.match(STORED_TOPIC_SCREEN_SQL,/\$1::jsonb/u);assert.match(STORED_TOPIC_SCREEN_SQL,/o.generation=\$2/u);
 assert.equal(/\b(INSERT|UPDATE|DELETE|pg_advisory|request_material)\b/iu.test(STORED_TOPIC_SCREEN_SQL),false);assert.equal(STORED_TOPIC_SCREEN_PROBES.length,6);
});
test('CLI rejects selectors without opening resources',async()=>{for(const args of [[],['--capture'],['--screen-stored-topics','other'],null])assert.equal(await main(args),2);});
