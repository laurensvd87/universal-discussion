import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),axis=Array.from({length:384},(_,i)=>i===0?1:0);
export function automaticVectorWire(v){const b=Buffer.alloc(20+384*12);for(const [at,n]of [[0,1],[4,0],[8,701],[12,384],[16,1]])b.writeInt32BE(n,at);
 for(let i=0;i<384;i++){b.writeInt32BE(8,20+i*12);b.writeDoubleBE(v[i],24+i*12);}return {base64:b.toString('base64'),hash:sha(b)};}
export function automaticCohortFixture(n=2){const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const rows=Array.from({length:n},(_,i)=>{const values=i===0?axis:axis.map((_,j)=>j===0?.96:j===i?Math.sqrt(1-.96**2):0),w=automaticVectorWire(values);
  return {sourceId:'source-'+String(i).padStart(3,'0'),sourceVersion:'0',ordinal:String(i),operationId:'operation-'+i,operationDigest:'b'.repeat(64),sourceStamp:'c'.repeat(64),url:'https://general.example.org/'+i,
   title:i?'Kapsalon with chicken':'Kapsalon maken',bodyWireHash:w.hash,titleWireHash:w.hash,bodyBase64:w.base64,titleBase64:w.base64,supportedPath:['cooking'],lexical:false};});
 return {generation:'generation-a',matcherHash:'d'.repeat(64),representationHash,inputDefinition,seedSourceId:rows[0]?.sourceId??'source-000',rows};}
