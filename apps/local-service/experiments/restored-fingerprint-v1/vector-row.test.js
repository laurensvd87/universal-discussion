import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {arrayWireJson,expandedFiniteNumber,projectedVectorRowHash,describeVectorProjection,vectorProjectionSelect} from './vector-row.js';
const sha=(json,...wires)=>{const h=createHash('sha256').update(json);for(const w of wires)if(w)h.update(w);return h.digest('hex');};
export function wire(values,{lowerBound=1}={}){
 if(!values.length){const b=Buffer.alloc(12);b.writeUInt32BE(701,8);return b;}
 const b=Buffer.alloc(20+values.reduce((n,x)=>n+(x===null?4:12),0));b.writeInt32BE(1);b.writeInt32BE(values.includes(null)?1:0,4);b.writeUInt32BE(701,8);b.writeInt32BE(values.length,12);b.writeInt32BE(lowerBound,16);let at=20;
 for(const value of values){b.writeInt32BE(value===null?-1:8,at);at+=4;if(value!==null){b.writeDoubleBE(value,at);at+=8;}}return b;
}
test('binary float8 array layouts preserve order, nulls, signed zero, exponent expansion and lower bounds',()=>{
 assert.equal(arrayWireJson(wire([.25,-.5,0,-0,1e-7,1e21,null])),'[0.25, -0.5, 0, 0, 0.0000001, 1000000000000000000000, null]');
 assert.equal(arrayWireJson(wire([.5],{lowerBound:-3})),'[0.5]');assert.equal(arrayWireJson(wire([])),'[]');
 assert.equal(expandedFiniteNumber(Number.MIN_VALUE),'0.'+'0'.repeat(323)+'5');
});
test('unsupported, truncated, oversized or contradictory wire shapes fail without guessing',()=>{
 const good=wire([.5]);for(const b of [good.subarray(0,4),Buffer.concat([good,Buffer.from([0])]),wire([Infinity]),wire([NaN]),Buffer.alloc(18453)])assert.throws(()=>arrayWireJson(b));
 for(const [offset,value]of [[0,2],[4,1],[8,23],[12,-1],[20,4]]){const b=Buffer.from(good);b.writeInt32BE(value,offset);assert.throws(()=>arrayWireJson(b));}
});
test('canonical row text retains all base raw tokens, spacing and exact binary wires in original hash order',()=>{
 const b=wire([.25,-.5]);const row={base_json:'{"payload": "x, \\\"quoted\\\"", "model_id": "e5", "source_id": "s", "dimensions": 2, "vector_mirror": null}',values_double_wire:b};
 const expected='{"payload": "x, \\\"quoted\\\"", "model_id": "e5", "source_id": "s", "dimensions": 2, "values_double": [0.25, -0.5], "vector_mirror": null}';
 assert.equal(projectedVectorRowHash('embeddings',row),sha(expected,b));
 assert.notEqual(projectedVectorRowHash('embeddings',row),projectedVectorRowHash('embeddings',{...row,values_double_wire:wire([.25,-.5],{lowerBound:0})}));
 const changed={...row,base_json:row.base_json.replace('"s"','"other"')};assert.notEqual(projectedVectorRowHash('embeddings',row),projectedVectorRowHash('embeddings',changed));
});
test('raw bigint and numeric scale survive without JS rounding; nullable arrays differ from empty arrays',()=>{
 const base='{"payload": "x", "topic_id": "t", "source_id": null, "vector_mirror": 9223372036854775807, "parameter_sha256": 1.2300}';
 const row={base_json:base,values_double_wire:null};
 assert.equal(projectedVectorRowHash('fixed_references',row),sha('{"payload": "x", "topic_id": "t", "source_id": null, "values_double": null, "vector_mirror": 9223372036854775807, "parameter_sha256": 1.2300}'));
 assert.notEqual(projectedVectorRowHash('fixed_references',row),projectedVectorRowHash('fixed_references',{...row,values_double_wire:wire([])}));
});
test('fixed projection exposes every known column; unknown fields/tables, duplicate base keys and accessors refuse',()=>{
 assert.deepEqual(describeVectorProjection('embeddings').arrays,['values_double']);assert.match(vectorProjectionSelect('semantic_inputs'),/array_send\(t.body_values\)/u);
 for(const table of ['sources','x; DROP TABLE',null,{}])assert.throws(()=>vectorProjectionSelect(table));
 const row={base_json:'{"payload": "x", "model_id": "e5", "source_id": "s", "dimensions": 1, "vector_mirror": null}',values_double_wire:wire([.5])};
 assert.throws(()=>projectedVectorRowHash('embeddings',{...row,extra:true}));
 assert.throws(()=>projectedVectorRowHash('embeddings',{...row,base_json:row.base_json.replace('"payload": "x"','"payload": "x", "payload": "x"')}));
 let called=false;const forged={...row};Object.defineProperty(forged,'base_json',{get(){called=true;throw Error('private');}});assert.throws(()=>projectedVectorRowHash('embeddings',forged));assert.equal(called,false);
});
