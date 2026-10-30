// Standalone compatibility/performance prototype. No IO/SQL/provider on import.
// NOT bound to any backup, verifier, service or migration. Fail, never rescore.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
const need=v=>{if(!v)throw new TypeError('Unsupported vector fingerprint projection');};
const shapes=Object.freeze({
 embeddings:{base:['source_id','payload','model_id','dimensions','vector_mirror'],arrays:['values_double'],order:['source_id'],nullable:true},
 fixed_references:{base:['topic_id','payload','source_id','parameter_sha256','vector_mirror'],arrays:['values_double'],order:['topic_id'],nullable:true},
 semantic_inputs:{base:['source_id','operation_digest','matcher_hash','body_wire_hash','title_wire_hash','supported_path','semantic_eligible'],arrays:['body_values','title_values'],order:['source_id','operation_digest','matcher_hash'],nullable:false},
});
const descriptor=table=>{need(typeof table==='string'&&Object.hasOwn(shapes,table));return shapes[table];};
export function describeVectorProjection(table){
 need(arguments.length===1);const s=descriptor(table);return Object.freeze({base:Object.freeze([...s.base]),arrays:Object.freeze([...s.arrays]),order:Object.freeze([...s.order])});
}
export function vectorProjectionSelect(table){
 need(arguments.length===1);const s=descriptor(table);
 return `SELECT to_jsonb(b)::text AS base_json,${s.arrays.map(name=>`array_send(t.${name}) AS ${name}_wire`).join(',')}`+
  ` FROM canonical_v4.${table} t CROSS JOIN LATERAL (SELECT ${s.base.map(name=>'t.'+name).join(',')}) b ORDER BY ${s.order.map(name=>'t.'+name).join(',')}`;
}
// PostgreSQL numeric JSONB output does not use exponent notation. Compatibility
// with PG float8's shortest spelling must additionally be checked by SQL oracle
// and exact original receipt hashes; no universal IEEE-equivalence claim.
export function expandedFiniteNumber(value){
 need(arguments.length===1&&typeof value==='number'&&Number.isFinite(value));
 const raw=String(value);if(!raw.includes('e'))return raw;
 const negative=raw.startsWith('-'),[mantissa,exponent]=raw.replace(/^-/u,'').split('e');
 const pieces=mantissa.split('.'),digits=pieces.join(''),position=pieces[0].length+Number(exponent);
 return (negative?'-':'')+(position<=0?'0.'+'0'.repeat(-position)+digits:position>=digits.length?digits+'0'.repeat(position-digits.length):digits.slice(0,position)+'.'+digits.slice(position));
}
export function arrayWireJson(wire){
 need(arguments.length===1&&Buffer.isBuffer(wire)&&!types.isProxy(wire)&&wire.length>=12&&wire.length<=18452);
 const dimensions=wire.readInt32BE(0),nullFlag=wire.readInt32BE(4),oid=wire.readUInt32BE(8);
 need((dimensions===0||dimensions===1)&&(nullFlag===0||nullFlag===1)&&oid===701);
 if(dimensions===0){need(wire.length===12&&nullFlag===0);return '[]';}
 need(wire.length>=20);const count=wire.readInt32BE(12);need(count>0&&count<=1536);
 let offset=20,nulls=0;const values=[];
 for(let i=0;i<count;i++){
  need(offset+4<=wire.length);const size=wire.readInt32BE(offset);offset+=4;
  if(size===-1){values.push('null');nulls++;continue;}
  need(size===8&&offset+8<=wire.length);values.push(expandedFiniteNumber(wire.readDoubleBE(offset)));offset+=8;
 }
 need(offset===wire.length&&(nulls>0?1:0)===nullFlag);return '['+values.join(', ')+']';
}
function rawMembers(text,expected){
 need(typeof text==='string'&&text.isWellFormed()&&Buffer.byteLength(text)<=131072&&text.startsWith('{')&&text.endsWith('}'));
 const parsed=JSON.parse(text);need(parsed&&Object.getPrototypeOf(parsed)===Object.prototype&&Object.keys(parsed).length===expected.length);
 const members=new Map();let at=1;
 while(at<text.length-1){
  while(text[at]===' ')at++;const begin=at;need(text[at++]==='"');
  while(at<text.length){if(text[at]==='\\'){at+=2;continue;}if(text[at++]==='"')break;}
  const key=JSON.parse(text.slice(begin,at));need(expected.includes(key)&&!members.has(key));
  while(text[at]===' ')at++;need(text[at++]===':');while(text[at]===' ')at++;
  const valueStart=at;let depth=0,quoted=false;
  while(at<text.length){const c=text[at];if(quoted){if(c==='\\'){at+=2;continue;}if(c==='"')quoted=false;at++;continue;}
   if(c==='"'){quoted=true;at++;continue;}if(c==='['||c==='{')depth++;
   if(c===']'||c==='}'){if(depth===0)break;depth--;}
   if(c===','&&depth===0)break;at++;
  }
  need(!quoted&&depth===0&&at>valueStart);members.set(key,text.slice(valueStart,at).trim());
  if(text[at]===','){at++;need(at<text.length-1);}else break;
 }
 need(members.size===expected.length&&text.slice(at).trim()==='}');return members;
}
export function projectedVectorRowHash(table,row){
 need(arguments.length===2&&row&&typeof row==='object'&&!types.isProxy(row)&&Object.getPrototypeOf(row)===Object.prototype);
 const s=descriptor(table),keys=['base_json',...s.arrays.map(name=>name+'_wire')];need(Reflect.ownKeys(row).length===keys.length);
 const values={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(row,k);need(d?.enumerable&&Object.hasOwn(d,'value'));values[k]=d.value;}
 const members=rawMembers(values.base_json,s.base),wires=[];
 for(const name of s.arrays){const wire=values[name+'_wire'];need(wire!==null||s.nullable);members.set(name,wire===null?'null':arrayWireJson(wire));wires.push(wire);}
 const ordered=[...members].sort(([a],[b])=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b)));
 const hash=createHash('sha256');hash.update('{'+ordered.map(([name,value])=>JSON.stringify(name)+': '+value).join(', ')+'}','utf8');
 for(const wire of wires)if(wire!==null)hash.update(wire);return hash.digest('hex');
}
