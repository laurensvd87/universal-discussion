// Fixed IO allowlist only. Never follows paths declared by old freezes/receipts.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {TARGET_PRODUCER_SOURCE_KEYS,buildTargetProducerProfiles} from './producer-profiles.js';
export const HERE=dirname(fileURLToPath(import.meta.url));
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const digest=value=>sha(JSON.stringify(value));
export const ENCODER_HASH='76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3';
export const CAPACITY_HASH='ee742344cdfd96d77f70764ffbe7c33d71b3404fa86d7f4646003389262d4c83';
export const V3_HASH='6892118af0326115f1bc40d19db30956b319157efde7991e6128d9823b4fb92a';
const IMMUTABLE_SOURCE_PINS=Object.freeze({
 '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js':'77dedacd3b468e068e875b95738f1617363302f5f5b8554aad5f93ff9e3c0abd',
 '../../../src/domain/hierarchical-e5-paired-input.js':'3047bc3c5062307e2127ec2f95175377a8fa1a3c6318ed3a3a1e158dc9344c14',
 '../../../src/domain/hierarchical-e5-paired-linear-heads.js':'7dfc2cadf57aacf6e0b63d719830a7118086a9ffec8eabde6cc6281d1891d5bf',
 '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js':'751e11093fb90a2e97f45d0c74d959cfe297ce8dd963c0a28e0152af52a72c8e',
 '../hierarchical-e5-broad-heads-v1/vector-packet.js':'3a0e37fa70cd1d2453555bcdf7abcabd14710874cb6ecf15e6d4cd58bd72c35f',
 '../builder-scoped-root-rank-candidate-v1/scorer.js':'5037cfec2cce670a9238556567a7d9d39db0ce0357f5bc00fb27d16cbd1489f6',
});
export const INPUTS=Object.freeze({
 capacityFreeze:['../hierarchical-e5-capacity-real-root-v1/freeze.json','326f9af63747b99e59527ea41a6ca998fbafe717dab6d0bfa853a09d575ad3df'],
 eligibility:['../hierarchical-e5-capacity-real-root-v1/output/training-eligibility.json','ef73b44936579c39ec054031f79864abb9f15c9dfce86eca0450d724341dd6cd'],
 expansionEncoding:['../hierarchical-e5-capacity-real-root-v1/output/encoding-training-expansion.json','789d46cb6f237c9d94f272c24d0b464ac6f35750254809e9237d12c06ac47b34'],
 expansionVectors:['../hierarchical-e5-capacity-real-root-v1/output/training-expansion.current-static.vectors.json','86eef41ce94da614738ae3035f83f42786a55c3b44ca8576adf58d7ba11c04f0'],
 oldFreeze:['../hierarchical-e5-real-root-v3/freeze.json','449d10d74a9b5e91bd6726a40199f51f2190662b238e317b8f000e6247eeb9f0'],
 oldEncoding:['../hierarchical-e5-real-root-v3/output/encoding-traincal.json','1df069f65ebfcba7b8f67dcafe2e401718704bcb55cd7aa3396e20375a18b687'],
 oldVectors:['../hierarchical-e5-real-root-v3/output/traincal.current-static.vectors.json','bcdf5c846acdc469b1e4de05ad4d9069612ec50b5c81c79500d90470aa833c6a'],
 trainingGold:['../../../data/hierarchy-real-root-training-gold-adr136.json','62ff96d3b98d197c4c90ea2db7f5a9adb7615bf8e18fce7f66c3c1681b1f53e8'],
 calibrationGold:['../../../data/hierarchy-real-root-calibration-gold-adr136.json','8b755d8ae214de78f51005f547cb074655382cd2fb0fc0cf99b8f2e9bba76cfc'],
 expansionGold:['../../../data/hierarchy-root-expansion-candidates-adr141.json','4c74ade125605bb41f3073803279ff9f96eb143d88b97f4ea373677b3b30aeca'],
 expansionSeal:['../../../data/hierarchy-root-expansion-label-seal-adr141.json','dc4e1a222ea62ca36b5a8eff6ff2af047f7c133af83157ddf8c75a75cc8c8faf'],
 candidate:['../../../data/hierarchy-current-producer-transfer-candidates-adr143.json','d6843c87347a111277c04baf65062cf246ccd75fc883631d8c69e31563288052'],
 labelSeal:['../../../data/hierarchy-current-producer-transfer-label-seal-adr143.json','a138f586f3590bf4b3c3158a2902d4187967f40de38703a981eae72335db8101'],
});
export const SOURCE_NAMES=Object.freeze(['fit.js','contracts.test.js','protocol.json','supervise.py','manifest.js','methods.js','methods.test.js','README.md','producer-profiles.js',
 'producer-profiles.test.js',
 '../builder-scoped-root-rank-candidate-v1/scorer.js','../../../src/domain/hierarchical-e5-paired-input.js',
 '../../../src/domain/hierarchical-e5-paired-linear-heads.js','../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 '../hierarchical-e5-broad-heads-v1/vector-packet.js',
 '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js']);
export async function boundedBytes(name,maximum=8*1024*1024){
 const path=resolve(HERE,name),info=await lstat(path);
 assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size<=maximum);
 assert.equal((await realpath(path)).toLowerCase(),path.toLowerCase());
 const bytes=await readFile(path);assert.ok(bytes.length<=maximum);return bytes;
}
export function inputSpec(key){assert.ok(Object.hasOwn(INPUTS,key));return INPUTS[key];}
export async function inputBytes(key){const [name,expected]=inputSpec(key),bytes=await boundedBytes(name,12*1024*1024);assert.equal(sha(bytes),expected);return bytes;}
export async function sourceLedger(){const hashes={};for(const name of SOURCE_NAMES)hashes[name]=sha(await boundedBytes(name));for(const [name,pin]of Object.entries(IMMUTABLE_SOURCE_PINS))assert.equal(hashes[name],pin);return hashes;}
export async function recheckLedger(ledger){for(const [name,expected]of Object.entries(ledger))assert.equal(sha(await boundedBytes(name,12*1024*1024)),expected);}
const TARGET_NAMES=Object.freeze([
 'spikes/topic-resolution/harness/current-producer-final-v1/run.mjs',
 'spikes/topic-resolution/harness/current-producer-final-v1/policy.js',
 'spikes/topic-resolution/harness/current-producer-final-v1/manifest.js',
 'spikes/topic-resolution/harness/current-producer-final-v1/protocol.json',
 'spikes/topic-resolution/browser/core/page-content-policy.js','apps/local-service/src/crawler/public-fetch.js',
 'apps/local-service/src/crawler/robots.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js',
 'apps/local-service/src/crawler/static-capture.js','spikes/topic-resolution/browser/chromium/page-content-reader.js']);
export async function targetProfileLedger(){
 assert.deepEqual(TARGET_PRODUCER_SOURCE_KEYS,TARGET_NAMES);
 const sourceHashes={},ledger={};for(const name of TARGET_NAMES){const relative='../../../../../'+name;sourceHashes[name]=sha(await boundedBytes(relative));ledger[relative]=sourceHashes[name];}
 return {profiles:buildTargetProducerProfiles(sourceHashes),ledger};
}
export async function validateLabelSeal(candidate,seal){
 assert.equal(seal.schema,'hierarchy-current-producer-label-seal/v1');assert.equal(seal.candidateSha256,INPUTS.candidate[1]);
 assert.equal(candidate.cases.length,32);const fields=['id','entityGroup','publicUrl','language','expectedRootId','supportedPathPrefix','maximumSpecificityKnown'];
 const labels=candidate.cases.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])));
 assert.equal(digest(labels),seal.labelIdentityHash);assert.deepEqual(seal.caseIds,labels.map(r=>r.id));assert.equal(new Set(labels.map(r=>r.entityGroup)).size,32);
 const counts=new Map();for(const r of labels)counts.set(r.expectedRootId,(counts.get(r.expectedRootId)??0)+1);assert.equal(counts.size,16);assert.ok([...counts.values()].every(n=>n===2));
 for(const key of ['labelsFrozenBeforeFinalInputs','rootReviewed','independentlyReviewed','noFinalInputsRead','rightsUnverified'])assert.equal(seal[key],true);
 assert.equal(seal.ownerTaxonomyApproved,false);assert.equal(seal.productionValidated,false);assert.equal(seal.assignmentAuthority,false);
 const names={freezeSha256:'freeze.json',staticResultSha256:'output-static/result.json',staticSupervisorSha256:'output-static/supervisor.json',browserResultSha256:'output-browser/result.json',browserSupervisorSha256:'output-browser/supervisor.json'},ledger={};
 assert.deepEqual(Object.keys(seal.devCompatibility).sort(),Object.keys(names).sort());
 for(const [key,name]of Object.entries(names)){const relative='../../../../../spikes/topic-resolution/harness/current-producer-controls-v1/'+name,b=await boundedBytes(relative);assert.equal(sha(b),seal.devCompatibility[key]);ledger[relative]=sha(b);}
 return ledger;
}
