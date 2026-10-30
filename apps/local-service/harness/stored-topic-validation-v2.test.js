import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {prepareStoredValidation as previous,evaluateStoredValidation as oldScore} from './stored-topic-validation.js';
import {prepareStoredValidation as corrected,evaluateStoredValidation as newScore} from './stored-topic-validation-v2.js';
import {main} from './run-stored-topic-validation-v2.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(version){const b=Buffer.alloc(20+384*12);b.writeInt32BE(1,0);b.writeUInt32BE(701,8);b.writeInt32BE(384,12);b.writeInt32BE(1,16);
 for(let i=0;i<384;i++){b.writeInt32BE(8,20+12*i);b.writeDoubleBE(i===0?1:0,24+12*i);}
 return {rows:[{sourceId:'sample',sourceVersion:version,operationId:'operation',operationDigest:sha('op'),sourceStamp:sha('stamp'),probe:'python',title:'Python',url:'https://example.test/python',acceptedPath:['technology'],
  bodyBase64:b.toString('base64'),titleBase64:b.toString('base64'),bodyWireHash:sha(b),titleWireHash:sha(b)}],inputDefinition:{bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},matcherHash:'b'.repeat(64)};}
test('canonical version0 is preserved exactly; previous diagnostic refuses and corrected reader accepts',()=>{
 assert.throws(()=>previous(fixture('0')));const r=corrected(fixture('0'));
 assert.equal(r.observations[0].inputHash,sha(JSON.stringify(['sample','0','operation',sha('op'),sha('stamp')])));
 assert.deepEqual(corrected(fixture('1')),previous(fixture('1')));
 for(const version of ['-1','00','1.0','+1',''])assert.throws(()=>corrected(fixture(version)));
 assert.strictEqual(newScore,oldScore);
});
test('mechanical inverse is exact for preparation; only the diagnostic zero-version predicate changes',()=>{
 const extract=s=>s.slice(s.indexOf('export function prepareStoredValidation(')).split('\nexport function evaluateStoredValidation(')[0].trim();
 const old=extract(readFileSync(new URL('./stored-topic-validation.js',import.meta.url),'utf8'));
 const next=extract(readFileSync(new URL('./stored-topic-validation-v2.js',import.meta.url),'utf8'));
 assert.equal(next.replace('/^(0|[1-9][0-9]{0,18})$/u','/^[1-9][0-9]{0,18}$/u'),old);
});
test('fixed offline entry refuses additional arguments without opening private inputs',async()=>{
 for(const args of [null,[],['--capture-fixed-cohort'],['--compare-retained-cohort','extra']])assert.equal(await main(args),2);
});
