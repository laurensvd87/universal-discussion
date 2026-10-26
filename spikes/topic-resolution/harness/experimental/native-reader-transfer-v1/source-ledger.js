// Default inert. Fixed reviewed CODE paths only; no path is taken from evidence.
// Explicit preparation/load calls read artifacts but never fit, capture or infer.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCE_PATHS} from './source-paths.js';
import {CONSTRUCTION_SOURCE_KEYS,buildNativeProducerProfile} from './producer-profile.js';
import {OLD_FIT_SOURCE_PATHS,OLD_TARGET_SOURCE_PATHS,ARTIFACT_REUSE_DEPENDENCY_PINS,
 createNativeArtifactReuseReceipt,validateNativeArtifactReuseReceipt} from './artifact-reuse.js';
import {validateRootFitEvidence} from '../../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {validateCandidateStructure,CANDIDATE_SHA256,ROOT_IDS,digest,sha} from '../../current-producer-final-v1/manifest.js';
import {MODEL_SHA256,readAssetManifest} from '../../../browser/embedding/embedding-contract.js';
import {FIXED_CASES} from './native-adapter.js';

export const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..');
export const OUTPUT=resolve(HERE,'output');
export const OWN='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/';
export const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/';
export const ASSET_ROOT=resolve(REPO,'spikes/topic-resolution/browser/embedding/.assets');
export const PACKAGE_ROOT=resolve(REPO,DEV,'node_modules/playwright-core');
export const PACKAGE_INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
const FIT='apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/';
const PKG_PREFIX='node_modules/playwright-core/';
const ASSETS=Object.freeze(['model.onnx','tokenizer.json','tokenizer_config.json','config.json','special_tokens_map.json',
 'tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']);
export const ARTIFACT_FILES=Object.freeze({
 freezeBytes:{path:FIT+'freeze.json',maximum:65536,sha256:'ddee567ad132299dc130f01da77d77bae3fd18a7ad7c222a276de1384ef9c894'},
 supervisorBytes:{path:FIT+'output/supervisor.json',maximum:65536,sha256:'c5b1073a5cf9c71412e0d43488ecae008474b39276c5a43c67bec8efd7ee766e'},
 selectionReceiptBytes:{path:FIT+'output/selection-receipt.json',maximum:65536,sha256:'88b87fc555c4e456bfb1a7ab23c93fcffa75de8d51b453df0f861324e3a0ae4f'},
 selectionBytes:{path:FIT+'output/selection.json',maximum:262144,sha256:'d5bc132ac6182046830822f98e16710b5a8ccad176a461f8e8613fde5661e0de'},
 modelBytes:{path:FIT+'output/root-model.json',maximum:262144,sha256:'442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'},
 policyBytes:{path:FIT+'output/root-policy.json',maximum:65536,sha256:'309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'},
 inputDefinitionBytes:{path:FIT+'output/input-definition.json',maximum:16384,sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},
 candidate:{path:'apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json',maximum:65536,sha256:CANDIDATE_SHA256},
 labelSeal:{path:'apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json',maximum:65536,sha256:'a138f586f3590bf4b3c3158a2902d4187967f40de38703a981eae72335db8101'},
 packageBaseline:{path:'spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json',maximum:65536,
  sha256:'908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb'},
 assetManifest:{path:'spikes/topic-resolution/browser/embedding/.assets/manifest.json',maximum:16384,sha256:null},
});
for(const value of Object.values(ARTIFACT_FILES))Object.freeze(value);
const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const equal=(a,b)=>assert.deepEqual(a,b);
const jsonBytes=v=>Buffer.from(JSON.stringify(v));
function exact(v,keys){assert.ok(plain(v));equal(Object.keys(v),keys);}

// Caller supplies only fixed source/package/artifact constants above. Every
// ancestor, final file and before/after identity is checked without writes.
async function checkedPath(path,{directory=false,maximum=4194304}={}){
 const absolute=resolve(path),rel=relative(REPO,absolute);
 assert.ok(rel&&!rel.startsWith('..')&&!resolve(rel).startsWith('\\\\'));
 let at=REPO;
 for(const segment of rel.split(sep)){at=resolve(at,segment);const s=await lstat(at);
  assert.ok(!s.isSymbolicLink());assert.equal((await realpath(at)).toLowerCase(),at.toLowerCase());}
 const s=await lstat(absolute);assert.ok(directory?s.isDirectory():s.isFile());
 if(!directory)assert.ok(s.size>0&&s.size<=maximum);return s;
}
async function bytes(path,maximum=4194304){
 const before=await checkedPath(path,{maximum}),b=await readFile(path),after=await lstat(path);
 assert.ok(!after.isSymbolicLink()&&after.isFile());assert.equal(b.length,before.size);
 equal([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);return b;
}
export async function inspectNativeSources({guard=()=>{}}={}){
 assert.equal(typeof guard,'function');assert.ok(/^D:/iu.test(HERE));guard();
 const sourceHashes={},packageFiles=[];let count=0,total=0;
 for(const name of SOURCE_PATHS){guard();sourceHashes[name]=sha(await bytes(resolve(REPO,name)));}
 async function walk(dir,depth=0){
  assert.ok(depth<=8);await checkedPath(dir,{directory:true});const children=await readdir(dir,{withFileTypes:true});assert.ok(children.length<=128);
  for(const child of children.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   guard();assert.ok(!child.isSymbolicLink());const path=resolve(dir,child.name);
   if(child.isDirectory())await walk(path,depth+1);
   else {assert.ok(child.isFile());const b=await bytes(path);assert.ok(++count<=128);total+=b.length;assert.ok(total<=16777216);
    const key=PKG_PREFIX+relative(PACKAGE_ROOT,path).split(sep).join('/');sourceHashes[key]=sha(b);packageFiles.push(key);}
  }
 }
 await walk(PACKAGE_ROOT);assert.equal(count,115);assert.equal(total,13656167);assert.ok(Object.keys(sourceHashes).length<=256);
 const pkg=parse(await bytes(resolve(PACKAGE_ROOT,'package.json'))),lock=parse(await bytes(resolve(REPO,DEV,'package-lock.json')));
 assert.equal(pkg.name,'playwright-core');assert.equal(pkg.version,'1.64.1');assert.equal(lock.packages?.['node_modules/playwright-core']?.integrity,PACKAGE_INTEGRITY);
 guard();return {sourceHashes,packageFiles};
}
export function validateNativeFreeze(value,expected){
 exact(value,['schema','sourceHashes','artifactHashes','protocolSha256','artifactReuseReceiptSha256','targetProfile','encoderHash','freezeHash']);
 const {freezeHash,...material}=value;assert.equal(value.schema,'native-reader-root-transfer-freeze/v1');assert.equal(digest(material),freezeHash);
 for(const key of ['sourceHashes','artifactHashes','protocolSha256','artifactReuseReceiptSha256','targetProfile','encoderHash'])equal(value[key],expected[key]);
 return value;
}
async function readIdentity(inventory,guard){
 const {sourceHashes,packageFiles}=inventory,artifactHashes={},b={};
 for(const [key,spec]of Object.entries(ARTIFACT_FILES)){
  guard();b[key]=await bytes(resolve(REPO,spec.path),spec.maximum);artifactHashes[spec.path]=sha(b[key]);
  if(spec.sha256!==null)assert.equal(artifactHashes[spec.path],spec.sha256);
 }
 const baseline=parse(b.packageBaseline);assert.equal(baseline.schema,'playwright-route-burst-dev-freeze/v1');
 const {freezeHash:baselineHash,...baselineMaterial}=baseline;assert.equal(digest(baselineMaterial),baselineHash);
 equal(Object.keys(baseline.sourceHashes).filter(k=>k.startsWith(PKG_PREFIX)),packageFiles);
 for(const key of packageFiles)assert.equal(sourceHashes[key],baseline.sourceHashes[key]);
 for(const [key,pin]of Object.entries(ARTIFACT_REUSE_DEPENDENCY_PINS))assert.equal(sourceHashes[key],pin);
 const oldSourceHashes=Object.fromEntries(Object.entries(OLD_FIT_SOURCE_PATHS).map(([alias,path])=>[alias,sourceHashes[path]]));
 const oldTargetHashes=Object.fromEntries(Object.entries(OLD_TARGET_SOURCE_PATHS).map(([alias,path])=>[alias,sourceHashes[path]]));
 const oldFreeze=parse(b.freezeBytes);equal(oldFreeze.sourceHashes,oldSourceHashes);equal(oldFreeze.targetSourceHashes,oldTargetHashes);
 const oldFit=Object.fromEntries(['freezeBytes','supervisorBytes','selectionReceiptBytes','selectionBytes','modelBytes','policyBytes','inputDefinitionBytes'].map(k=>[k,b[k]]));
 oldFit.sourceHashes=oldSourceHashes;
 const proof=validateRootFitEvidence(oldFit),candidate=parse(b.candidate),captureCases=validateCandidateStructure(candidate),seal=parse(b.labelSeal);
 equal(captureCases.map((c,i)=>({id:c.id,ordinal:i+1,url:c.url})),FIXED_CASES);
 assert.equal(seal.schema,'hierarchy-current-producer-label-seal/v1');assert.equal(seal.candidateSha256,CANDIDATE_SHA256);
 for(const k of ['labelsFrozenBeforeFinalInputs','rootReviewed','independentlyReviewed','noFinalInputsRead'])assert.equal(seal[k],true);
 assert.equal(seal.caseCount,32);equal(seal.caseIds,FIXED_CASES.map(c=>c.id));
 const projected=candidate.cases.map(c=>({id:c.id,entityGroup:c.entityGroup,publicUrl:c.publicUrl,language:c.language,expectedRootId:c.expectedRootId,
  supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown}));assert.equal(digest(projected),seal.labelIdentityHash);
 const goldCases=candidate.cases.map((c,i)=>{assert.equal(c.expectedRootId,ROOT_IDS[Math.floor(i/2)]);
  return {id:c.id,groupId:c.entityGroup,rootId:c.expectedRootId,language:c.language,host:new URL(c.publicUrl).hostname};});
 const profile=buildNativeProducerProfile(Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,sourceHashes[k]])));
 readAssetManifest(parse(b.assetManifest));
 const encoderHash=digest({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes['spikes/topic-resolution/browser/embedding/embedding-contract.js'],assetManifestSha256:sha(b.assetManifest)});
 assert.equal(encoderHash,proof.selection.encoderHash);assert.equal(encoderHash,'76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3');
 const next={nativeProfile:profile.producerProfile,profileRecipeHash:profile.recipeHash,protocolSha256:sourceHashes[OWN+'protocol.json'],
  candidateSha256:sha(b.candidate),labelSealSha256:sha(b.labelSeal)};
 return {sourceHashes,artifactHashes,oldFit,proof,profile,next,goldCases,encoderHash,assetManifestBytes:b.assetManifest};
}
function freezeMaterial(context,receiptBytes){return {schema:'native-reader-root-transfer-freeze/v1',sourceHashes:context.sourceHashes,
 artifactHashes:context.artifactHashes,protocolSha256:context.next.protocolSha256,artifactReuseReceiptSha256:sha(receiptBytes),
 targetProfile:context.profile.producerProfile,encoderHash:context.encoderHash};}
export async function assertUnusedNativePreparation({inspect=lstat}={}){
 for(const path of [resolve(HERE,'artifact-reuse.json'),resolve(HERE,'freeze.json'),OUTPUT]){
  let exists=false;try{await inspect(path);exists=true;}catch(e){if(e?.code!=='ENOENT')throw e;}
  assert.equal(exists,false,'Existing preparation/output prohibits recreation');
 }
 return true;
}
/** Explicit trusted reader seams permit mutation/ordering regression tests
 * without opening actual artifacts. Defaults read only the fixed CODE lists. */
export async function recheckNativePreparationInputs(context,{guard=()=>{},readSources=inspectNativeSources,
 readArtifact=spec=>bytes(resolve(REPO,spec.path),spec.maximum)}={}){
 guard();equal((await readSources({guard})).sourceHashes,context.sourceHashes);
 for(const spec of Object.values(ARTIFACT_FILES)){guard();assert.equal(sha(await readArtifact(spec)),context.artifactHashes[spec.path]);}
 guard();return true;
}

/** Explicit root-preparation action only, after source review. Exclusive files
 * prohibit automatic recreation/replay; no output directory or browser is made.
 */
export async function prepareNativeStudyFiles({guard=()=>{}}={}){
 await assertUnusedNativePreparation();
 const initial=await inspectNativeSources({guard}),context=await readIdentity(initial,guard);
 const receipt=await createNativeArtifactReuseReceipt({oldFit:context.oldFit,next:context.next,dependencySourceHashes:ARTIFACT_REUSE_DEPENDENCY_PINS});
 const receiptBytes=jsonBytes(receipt),material=freezeMaterial(context,receiptBytes),freeze={...material,freezeHash:digest(material)};
 await recheckNativePreparationInputs(context,{guard});await assertUnusedNativePreparation();guard();
 await writeFile(resolve(HERE,'artifact-reuse.json'),receiptBytes,{flag:'wx'});
 await writeFile(resolve(HERE,'freeze.json'),jsonBytes(freeze),{flag:'wx'});
 return {freezeHash:freeze.freezeHash,freezeSha256:sha(jsonBytes(freeze)),artifactReuseReceiptSha256:sha(receiptBytes),sourceCount:Object.keys(initial.sourceHashes).length};
}
export async function loadNativeStudyPreparation({guard=()=>{}}={}){
 const context=await readIdentity(await inspectNativeSources({guard}),guard);
 const receiptBytes=await bytes(resolve(HERE,'artifact-reuse.json'),65536),receipt=parse(receiptBytes);
 const {freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes}=context.oldFit;
 validateNativeArtifactReuseReceipt({receipt,oldProof:{freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes},next:context.next});
 const material=freezeMaterial(context,receiptBytes),frozenBytes=await bytes(resolve(HERE,'freeze.json'),65536);
 const frozen=validateNativeFreeze(parse(frozenBytes),material),p=context.profile.producerProfile;
 const candidateHandle=compileNativeRootRankCandidate({schema:'native-root-rank-candidate/v1',inputDefinition:context.proof.inputDefinition,
  rootModel:context.proof.model,rootPolicy:context.proof.policy,trainingInputConstructionHash:context.proof.selection.trainingInputConstructionHash,
  targetProfile:{producerId:p.producerId,inputConstructionHash:p.inputConstructionHash,extractorVersions:p.extractorVersions,effectiveTitleRule:p.effectiveTitleRule}});
 equal(describeNativeRootRankCandidate(candidateHandle),receipt.transferIdentity);guard();
 return {...context,candidateHandle,receipt,freeze:frozen,freezeSha256:sha(frozenBytes),artifactReuseReceiptSha256:sha(receiptBytes)};
}
export async function recheckNativeStudyPreparation(context,{guard=()=>{}}={}){
 await recheckNativePreparationInputs(context,{guard});
 assert.equal(sha(await bytes(resolve(HERE,'freeze.json'),65536)),context.freezeSha256);
 assert.equal(sha(await bytes(resolve(HERE,'artifact-reuse.json'),65536)),context.artifactReuseReceiptSha256);guard();return true;
}
export async function verifyNativeAssets(context,{guard=()=>{},hashContents=true}={}){
 assert.equal(typeof hashContents,'boolean');equal(await bytes(resolve(ASSET_ROOT,'manifest.json'),16384),context.assetManifestBytes);
 const manifest=readAssetManifest(parse(context.assetManifestBytes));let total=0;
 for(const name of ASSETS){
  guard();const spec=manifest.get(name),path=resolve(ASSET_ROOT,name),before=await checkedPath(path,{maximum:spec.bytes});
  assert.equal(before.size,spec.bytes);total+=spec.bytes;assert.ok(total<=256*1048576);
  if(hashContents){
   const hash=createHash('sha256');let seen=0;
   for await(const chunk of createReadStream(path,{highWaterMark:1048576})){guard();seen+=chunk.length;assert.ok(seen<=spec.bytes);hash.update(chunk);}
   assert.equal(seen,spec.bytes);assert.equal(hash.digest('hex'),spec.sha256);
  }
  const after=await lstat(path);assert.ok(!after.isSymbolicLink()&&after.isFile());equal([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);
 }
 guard();return true;
}
export async function stageNativeExtension(context,{guard=()=>{}}={}){
 const stage=resolve(OUTPUT,'staged-extension');await checkedPath(OUTPUT,{directory:true});await mkdir(stage);
 await mkdir(resolve(stage,'chromium'));await mkdir(resolve(stage,'core'));
 const layout={
  'manifest.json':OWN+'manifest.json','worker.js':OWN+'worker.js','native-adapter.js':OWN+'native-adapter.js','native-rights.js':OWN+'native-rights.js',
  'chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js',
  'core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js',
 };
 async function recheck(){
  for(const [target,source]of Object.entries(layout)){guard();assert.equal(sha(await bytes(resolve(stage,target))),context.sourceHashes[source]);}
  equal((await readdir(stage)).sort(),['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js']);
  equal(await readdir(resolve(stage,'chromium')),['page-content-reader.js']);equal(await readdir(resolve(stage,'core')),['page-content-policy.js']);
  guard();return true;
 }
 for(const [target,source]of Object.entries(layout)){guard();const b=await bytes(resolve(REPO,source));assert.equal(sha(b),context.sourceHashes[source]);await writeFile(resolve(stage,target),b,{flag:'wx'});}
 await recheck();return Object.freeze({path:stage,recheck});
}
