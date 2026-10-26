import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTrainReferenceCodec,TrainReferenceCodecError} from './reference-codec.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
const H='a'.repeat(64),C='b'.repeat(64);
const parents={games:null,'video-games':'games',gta:'video-games',minecraft:'video-games',nature:null,animals:'nature',koalas:'animals',dolphins:'animals',cooking:null,recipes:'cooking',kapsalon:'recipes',pasta:'recipes'};
const leaves=['gta','minecraft','koalas','dolphins','kapsalon','pasta'],stops=['games','video-games','nature','animals','cooking','recipes'];
function fixture(){
 const trainingCases=Array.from({length:48},(_,i)=>({id:'invented-train-'+i,groupId:'invented-group-'+i,referenceAnnotation:
  i<24?{nodeId:leaves[i%6],kind:'member'}:i<36?{nodeId:stops[i%6],kind:'stop'}:{nodeId:['games','nature','cooking'][i%3],kind:'outside'}}));
 const config={expectedManifestHash:H,expectedInputConstructionHash:C,trainingCases};
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:'paired-raw-e5-body-title-v1',representationHash:'c'.repeat(64),inputConstructionHash:C,
  taxonomyVersion:'invented-taxonomy',evidenceVersion:'invented-evidence',calibrationVersion:'invented-calibration',calibrationStatus:'experimental',
  nodes:Object.entries(parents).map(([id,parentId])=>({id,parentId})),
  examples:trainingCases.map((r,i)=>{const v=Array(384).fill(0);v[i]=1;v[100]=-0;v[101]=Number.MIN_VALUE;return {id:r.id,groupId:r.groupId,...r.referenceAnnotation,vector:v};}),
  nodePolicies:Object.keys(parents).map(nodeId=>({nodeId,enabled:false,minSupport:2,minSimilarity:.99,minNegativeMargin:0,minRivalMargin:0}))};
 return {config,artifact};
}
const refused=fn=>assert.throws(fn,TrainReferenceCodecError);
function changedPacket(encoded,change){const p=JSON.parse(encoded.text);change(p);const text=JSON.stringify(p);return {text,hash:sha(text)};}

test('maximum48 TRAIN references round-trip every binary64 bit and exact joins',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config),encoded=codec.encode(artifact),decoded=codec.decode(encoded.text,encoded.packetHash);
 assert.equal(encoded.examples,48);assert.equal(encoded.vectorOccurrences,48);assert.ok(Buffer.byteLength(encoded.text)<1048576);
 assert.equal(decoded.artifactHash,encoded.artifactHash);assert.deepEqual(decoded.artifact,artifact);
 assert.equal(decoded.assignmentAuthority,false);
 for(let r=0;r<48;r++)for(let i=0;i<384;i++)assert.ok(Object.is(decoded.artifact.examples[r].vector[i],artifact.examples[r].vector[i]));
 const p=JSON.parse(encoded.text);for(const r of p.artifact.examples){assert.equal(r.vectorBase64.length,4096);assert.equal(Buffer.from(r.vectorBase64,'base64').length,3072);assert.equal(Object.hasOwn(r,'vector'),false);}
 assert.ok(Object.isFrozen(decoded.artifact.examples[0].vector));
});

test('signed zero is in packet and artifact identity, no JSON-number collapse',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config),negative=codec.encode(artifact);
 artifact.examples[0].vector[100]=0;const positive=codec.encode(artifact);
 assert.notEqual(negative.packetHash,positive.packetHash);assert.notEqual(negative.artifactHash,positive.artifactHash);
 assert.notEqual(JSON.parse(negative.text).artifact.examples[0].vectorBitHash,JSON.parse(positive.text).artifact.examples[0].vectorBitHash);
 assert.equal(Object.is(codec.decode(negative.text,negative.packetHash).artifact.examples[0].vector[100],-0),true);
 assert.equal(Object.is(codec.decode(positive.text,positive.packetHash).artifact.examples[0].vector[100],0),true);
});

test('config and artifact mutation cannot alter private copied joins or decoded results',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config),encoded=codec.encode(artifact),decoded=codec.decode(encoded.text,encoded.packetHash);
 config.trainingCases[0].referenceAnnotation.kind='stop';config.trainingCases[0].groupId='foreign';config.expectedManifestHash='d'.repeat(64);
 artifact.examples[0].vector[0]=0;artifact.nodes[0].parentId='foreign';
 assert.equal(decoded.artifact.examples[0].vector[0],1);assert.equal(decoded.artifact.nodes[0].parentId,null);
 assert.equal(codec.decode(encoded.text,encoded.packetHash).artifactHash,encoded.artifactHash);
});

test('external manifest, construction, full TRAIN mapping and packet pins are independent',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config),encoded=codec.encode(artifact);
 refused(()=>codec.decode(encoded.text,'f'.repeat(64)));
 for(const key of ['manifestHash','inputConstructionHash','trainingCasesHash','artifactHash']){const x=changedPacket(encoded,p=>p[key]='e'.repeat(64));refused(()=>codec.decode(x.text,x.hash));}
 const other=fixture();other.config.trainingCases[0].id='invented-different-train';
 refused(()=>createTrainReferenceCodec(other.config).decode(encoded.text,encoded.packetHash));
});

test('available TRAIN subset is allowed; CAL/TEST/duplicate/repeated occurrences are not',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config);artifact.examples=artifact.examples.slice(0,2);
 const encoded=codec.encode(artifact);assert.equal(codec.decode(encoded.text,encoded.packetHash).vectorOccurrences,2);
 artifact.examples[0].id='invented-test-001';refused(()=>codec.encode(artifact));
 for(const change of [a=>a.examples.push({...a.examples[0]}),a=>{a.examples=Array.from({length:49},()=>a.examples[0]);},a=>{a.examples=[];},a=>{a.examples[0].groupId=a.examples[1].groupId;},a=>{a.examples[0].kind='stop';},a=>{a.examples[0].nodeId='games';}]){
  const f=fixture();change(f.artifact);refused(()=>createTrainReferenceCodec(f.config).encode(f.artifact));
 }
});

test('exact12-node graph, policies, construction and original artifact schema are enforced',()=>{
 for(const change of [a=>a.nodes.push({id:'extra',parentId:null}),a=>{a.nodes[0].parentId='nature';},a=>{a.nodes[0].id='unknown';},a=>a.nodePolicies.pop(),a=>{a.nodePolicies[0].enabled='yes';},a=>{a.nodePolicies[0].minSimilarity=NaN;},a=>{a.nodePolicies[0].minRivalMargin=3;},a=>{a.inputConstructionHash=H;},a=>{a.calibrationStatus='validated';},a=>{a.extra=true;}]){
  const {config,artifact}=fixture();change(artifact);refused(()=>createTrainReferenceCodec(config).encode(artifact));
 }
});

test('ordinary descriptors and primitive keys reject proxies/getters/coercion with zero hooks',()=>{
 let hooks=0;const hostile={toString(){hooks++;return 'games';}};
 for(const place of ['config-node','artifact-node','policy-node']){
  const {config,artifact}=fixture();if(place==='config-node'){config.trainingCases[0].referenceAnnotation.nodeId=hostile;refused(()=>createTrainReferenceCodec(config));}
  else{if(place==='artifact-node')artifact.nodes[0].id=hostile;else artifact.nodePolicies[0].nodeId=hostile;refused(()=>createTrainReferenceCodec(config).encode(artifact));}
 }
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config);
 refused(()=>codec.encode(new Proxy(artifact,{ownKeys(){hooks++;return [];}})));
 Object.defineProperty(artifact.examples[0],'vector',{enumerable:true,get(){hooks++;return [];}});refused(()=>codec.encode(artifact));
 const f=fixture();f.artifact.examples[0].vector=new Proxy(f.artifact.examples[0].vector,{get(){hooks++;return 0;}});refused(()=>createTrainReferenceCodec(f.config).encode(f.artifact));
 assert.equal(hooks,0);
});

test('input vectors are strict finite dense384 unit arrays, never normalized or repaired',()=>{
 for(const change of [v=>v.pop(),v=>v.push(0),v=>{delete v[1];},v=>{v.extra=0;},v=>{v[0]=NaN;},v=>{v[0]=Infinity;},v=>{v[0]=2;},v=>v.fill(0),v=>{v[0]=.1;}]){
  const {config,artifact}=fixture();change(artifact.examples[0].vector);refused(()=>createTrainReferenceCodec(config).encode(artifact));
 }
});

test('base64/LE payloads reject noncanonical, malformed, changed and nonunit bits',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config),encoded=codec.encode(artifact);
 for(const change of [r=>{r.vectorBase64+='=';},r=>{r.vectorBase64=' '+r.vectorBase64.slice(1);},r=>{r.vectorBase64=r.vectorBase64.slice(1);},r=>{r.vectorBitHash=H;},r=>{r.vectorBase64='A'.repeat(4096);}]){
  const x=changedPacket(encoded,p=>change(p.artifact.examples[0]));refused(()=>codec.decode(x.text,x.hash));
 }
 // Rehashing a malicious vector does not waive finite/unit validation.
 for(const n of [NaN,Infinity,2,0]){const x=changedPacket(encoded,p=>{const r=p.artifact.examples[0],b=Buffer.alloc(3072);b.writeDoubleLE(n,0);r.vectorBase64=b.toString('base64');r.vectorBitHash=createHash('sha256').update('native-specificity-train-reference/binary64-le/384/v1\0').update(b).digest('hex');});refused(()=>codec.decode(x.text,x.hash));}
});

test('canonical bounded JSON rejects duplicate keys, aliases, whitespace, depth and bytes',()=>{
 const {config,artifact}=fixture(),codec=createTrainReferenceCodec(config),encoded=codec.encode(artifact);
 const badTexts=[' '+encoded.text,encoded.text.replace('{','{"schema":"duplicate",'),encoded.text.replace('"schema"','"\\u0073chema"'),'['.repeat(17)+'0'+']'.repeat(17),' '.repeat(1048577),'"\\ud800"'];
 for(const text of badTexts)refused(()=>codec.decode(text,sha(text)));
 const x=changedPacket(encoded,p=>{p.artifact.examples[0].vector=[];});refused(()=>codec.decode(x.text,x.hash));
});

test('TRAIN config requires48 unique case-group joins and original annotation counts',()=>{
 for(const change of [c=>c.trainingCases.pop(),c=>c.trainingCases.push(c.trainingCases[0]),c=>{c.trainingCases[1].id=c.trainingCases[0].id;},c=>{c.trainingCases[1].groupId=c.trainingCases[0].groupId;},c=>{c.trainingCases[0].referenceAnnotation.kind='stop';},c=>{c.trainingCases[0].referenceAnnotation.extra=true;},c=>{c.expectedManifestHash='x';}]){
  const {config}=fixture();change(config);refused(()=>createTrainReferenceCodec(config));
 }
});
