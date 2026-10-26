import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,relative} from 'node:path';
import {SOURCE_PATHS} from './source-paths.js';
import {validateNativeFreeze,ARTIFACT_FILES,PACKAGE_INTEGRITY,recheckNativePreparationInputs,assertUnusedNativePreparation,inspectNativeSources} from './source-ledger.js';
import {OLD_FIT_SOURCE_PATHS,OLD_TARGET_SOURCE_PATHS} from './artifact-reuse.js';
import {CONSTRUCTION_SOURCE_KEYS} from './producer-profile.js';
import {digest,sha} from '../../current-producer-final-v1/manifest.js';
const H='a'.repeat(64),P='b'.repeat(64);
function invented(){const material={schema:'native-reader-root-transfer-freeze/v1',sourceHashes:{'fixed-code.js':H},artifactHashes:{'fixed-artifact.json':P},
 protocolSha256:H,artifactReuseReceiptSha256:P,targetProfile:{producerId:'invented',producerProfileHash:H},encoderHash:P};return {material,value:{...material,freezeHash:digest(material)}};}

test('fixed CODE list covers actual construction/original fit and original target aliases without old corpus packets',()=>{
 assert.equal(SOURCE_PATHS.length,72);assert.equal(new Set(SOURCE_PATHS).size,72);assert.ok(SOURCE_PATHS.length+115<=256);
 for(const path of [...CONSTRUCTION_SOURCE_KEYS,...Object.values(OLD_FIT_SOURCE_PATHS),...Object.values(OLD_TARGET_SOURCE_PATHS)])assert.ok(SOURCE_PATHS.includes(path),path);
 for(const path of SOURCE_PATHS)assert.ok(!path.includes('/data/')&&!path.includes('/output/')&&!path.includes('/.assets/'));
 assert.ok(Object.isFrozen(SOURCE_PATHS));assert.ok(SOURCE_PATHS.every(p=>!p.startsWith('/')&&!p.includes('..')&&!p.includes('\\')));
});

test('actual guarded CODE/package inventory proves all72 fixed files exist and115 client files fit bounds, without artifacts',async()=>{
 const {sourceHashes,packageFiles}=await inspectNativeSources();assert.equal(Object.keys(sourceHashes).length,187);assert.equal(packageFiles.length,115);
 assert.ok(sourceHashes['apps/local-service/package.json']);assert.ok(sourceHashes['spikes/topic-resolution/package.json']);
 assert.ok(!Object.hasOwn(sourceHashes,'package.json'));
 for(const spec of Object.values(ARTIFACT_FILES))assert.ok(!Object.hasOwn(sourceHashes,spec.path));
});

test('freshness barrier rechecks all11 actual fixed reader results after async preparation; no source-only success',async()=>{
 const specs=Object.values(ARTIFACT_FILES),seen=[],sourceHashes={'invented-code.js':H};
 const context={sourceHashes,artifactHashes:Object.fromEntries(specs.map(s=>[s.path,sha('invented-'+s.path)]))};
 const readSources=async()=>({sourceHashes}),readArtifact=async spec=>{seen.push(spec.path);return Buffer.from('invented-'+spec.path);};
 assert.equal(await recheckNativePreparationInputs(context,{readSources,readArtifact}),true);assert.deepEqual(seen,specs.map(s=>s.path));
 for(const altered of specs){
  await assert.rejects(recheckNativePreparationInputs(context,{readSources,readArtifact:async spec=>Buffer.from((spec===altered?'changed-':'invented-')+spec.path)}));
 }
 await assert.rejects(recheckNativePreparationInputs(context,{readSources:async()=>({sourceHashes:{...sourceHashes,extra:P}}),readArtifact}));
});

test('preparation refuses existing receipt OR freeze OR output, before recreation or any write',async()=>{
 const seen=[];const missing=()=>Object.assign(new Error('invented absent'),{code:'ENOENT'});
 assert.equal(await assertUnusedNativePreparation({inspect:async path=>{seen.push(path);throw missing();}}),true);assert.equal(seen.length,3);
 for(let present=0;present<3;present++){
  let call=0;await assert.rejects(assertUnusedNativePreparation({inspect:async()=>{if(call++===present)return {};throw missing();}}));assert.equal(call,present+1);
 }
 await assert.rejects(assertUnusedNativePreparation({inspect:async()=>{throw Object.assign(new Error('invented denied'),{code:'EACCES'});}}));
});
test('literal artifact allowlist pins original fit/model/policy/input/candidate/labels and package baseline, not arbitrary JSON paths',()=>{
 assert.equal(Object.keys(ARTIFACT_FILES).length,11);for(const spec of Object.values(ARTIFACT_FILES)){
  assert.ok(Object.isFrozen(spec));assert.ok(spec.maximum>0&&spec.maximum<=262144);
  assert.ok(spec.sha256===null?/\/\.assets\/manifest\.json$/u.test(spec.path):/^[a-f0-9]{64}$/u.test(spec.sha256));
  assert.ok(!spec.path.includes('input.packet')&&!spec.path.includes('vector.packet'));
 }
 assert.equal(ARTIFACT_FILES.modelBytes.path.endsWith('/output/root-model.json'),true);assert.ok(PACKAGE_INTEGRITY.startsWith('sha512-'));
});
test('source/artifact/protocol/profile/receipt/encoder byte identities and complete freeze schema are indivisible',()=>{
 const {value,material}=invented();assert.deepEqual(validateNativeFreeze(value,material),value);
 for(const field of ['sourceHashes','artifactHashes','protocolSha256','artifactReuseReceiptSha256','targetProfile','encoderHash']){
  const changed=structuredClone(value);changed[field]=null;const {freezeHash,...m}=changed;changed.freezeHash=digest(m);
  assert.throws(()=>validateNativeFreeze(changed,material));
 }
 for(const changed of [{...value,extra:true},{...value,freezeHash:H},{...value,schema:'old-study-freeze/v1'}])assert.throws(()=>validateNativeFreeze(changed,material));
});
test('Python can extract only exact literal CODE source array; helper import has no default file/capture/model action',async()=>{
 const src=await readFile(new URL('./source-paths.js',import.meta.url),'utf8');
 const match=/^export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*\])\);\s*$/mu.exec(src);assert.ok(match);
 assert.deepEqual(JSON.parse(match[1]),SOURCE_PATHS);
 const helper=await readFile(new URL('./source-ledger.js',import.meta.url),'utf8');
 assert.ok(!helper.includes('createPackagedCrawlerEmbedder('));assert.ok(!helper.includes('classifyNativeRootRankCandidate('));
 assert.ok(!helper.includes('process.argv'));assert.ok(!helper.includes('process.env'));assert.ok(!helper.includes('child_process'));
 assert.ok(helper.includes("context.sourceHashes[source]"));assert.ok(helper.includes("{flag:'wx'}"));
});

test('the fixed source list closes every literal relative import of the actual live driver and staged worker',async()=>{
 const repo=fileURLToPath(new URL('../../../../../',import.meta.url)),own='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/',seen=new Set();
 const staged={'./chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js',
  './core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js'};
 async function visit(key){
  if(seen.has(key))return;assert.ok(SOURCE_PATHS.includes(key),'Unfrozen imported source: '+key);seen.add(key);
  const source=await readFile(resolve(repo,key),'utf8');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/gu)){
   const spec=match[1];if(!spec.startsWith('.')){assert.ok(spec.startsWith('node:'),'Unexpected external dependency: '+spec);continue;}
   const target=key===own+'worker.js'&&Object.hasOwn(staged,spec)?staged[spec]:relative(repo,resolve(repo,dirname(key),spec)).replaceAll('\\','/');
   await visit(target);
  }
 }
 await visit(own+'run.mjs');await visit(own+'worker.js');assert.ok(seen.size>=29);
});
