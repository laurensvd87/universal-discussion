// Stored-byte and outcome arithmetic only. Never encode, fit or classify again.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
const here=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const external=new Set(['../../../src/domain/hierarchical-e5-paired-linear-heads.js',
  '../../../src/domain/hierarchical-e5-paired-head-policy.js','../../../src/domain/hierarchical-e5-paired-input.js',
  '../../../src/crawler/packaged-e5.js','../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
  '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json',
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js','../hierarchical-e5-paired-v1/taxonomy.js']);
async function bytes(name,max=8*1024*1024){const url=new URL(name,here),s=await lstat(url);
  assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max);const b=await readFile(url);assert.equal(b.length,s.size);return b;}
const read=async name=>JSON.parse(await bytes(name));
export async function verifyStored({local=false}={}){
  const frozen=await read('freeze.json'),{freezeHash,...body}=frozen;
  assert.equal(hash(JSON.stringify(body)),freezeHash);
  const sources=Object.entries(frozen.sourceHashes);assert.ok(sources.length>10&&sources.length<=80);
  for(const [name,expected] of sources){assert.ok(external.has(name)||/^[a-z][a-z0-9.-]{0,100}\.(?:js|py|json)$/u.test(name));
    assert.match(expected,/^[a-f0-9]{64}$/u);assert.equal(hash(await bytes(name)),expected,`Source mismatch: ${name}`);}
  const result={status:'verified',scope:'stored-byte-linkage-not-inference-or-independent-quality',freezeHash,
    sourceHashesChecked:sources.length,localEvidenceVerified:local,productionReady:false};
  if(local){
    const fit=await read('output/fit.json'),calibration=await read('output/calibration.json'),measured=await read('measured-results.json');
    const encoding=await read('output/encoding.json');
    for(const r of [fit,calibration,measured,encoding])assert.equal(r.freezeHash,freezeHash);
    assert.equal(hash(await bytes('output/model.json')),fit.modelSha256);
    assert.equal(hash(await bytes('output/input-definition.json')),fit.inputDefinitionSha256);
    assert.equal(hash(await bytes('output/policy.json')),calibration.policySha256);
    assert.equal(hash(await bytes('output/fit.json')),calibration.fitSha256);
    assert.equal(hash(await bytes('output/vectors.json',12*1024*1024)),encoding.vectorPacketSha256);
    assert.equal(measured.selectedModelSha256,fit.modelSha256);
    assert.equal(measured.selectedPolicySha256,calibration.policySha256);
    assert.equal(measured.selectedInputDefinitionSha256,fit.inputDefinitionSha256);
    assert.equal(measured.vectorPacketSha256,encoding.vectorPacketSha256);
    assert.equal(fit.finalTestEvaluated,false);assert.equal(fit.calibrationUsed,false);
    assert.equal(calibration.finalTestEvaluated,false);assert.equal(calibration.testUsed,false);
    const t=measured.test,o=t.outcomes;assert.equal(o.length,frozen.protocol.expectedSplits.test);
    assert.equal(t.rowCount,o.length);assert.equal(t.accepted,o.filter(r=>r.primaryNodeId!==null).length);
    assert.equal(t.safeAccepted,o.filter(r=>r.safeAccepted).length);
    assert.equal(t.correctDeepestOutcome,o.filter(r=>r.exactOutcome).length);
    assert.equal(t.gate.productionValidated,false);assert.equal(measured.productionReady,false);
    Object.assign(result,{selectedBodyWeight:fit.selectedBodyWeight,selectedLambda:fit.selectedLambda,
      testRows:t.rowCount,accepted:t.accepted,safeAccepted:t.safeAccepted,
      failedReleaseChecks:Object.entries(t.gate).filter(([k,v])=>!['productionValidated','representativeWebValidation'].includes(k)&&v===false).map(([k])=>k)});
  }
  return result;
}
const args=process.argv.slice(2);
if(!args.length)process.stdout.write('No action. Explicit --verify or --verify-local checks stored bytes only.\n');
else if(args.length===1&&['--verify','--verify-local'].includes(args[0]))
  process.stdout.write(JSON.stringify(await verifyStored({local:args[0]==='--verify-local'}))+'\n');
else process.exitCode=1;
