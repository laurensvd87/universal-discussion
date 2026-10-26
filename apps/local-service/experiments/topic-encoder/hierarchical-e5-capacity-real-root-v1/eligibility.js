// Pure response-capacity eligibility. No model, network, corpus or filesystem IO.
// Serialized ledger claims are identities, NOT Source/policy/write attestations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {posix} from 'node:path';
const HEX=/^[a-f0-9]{64}$/u,digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function plain(v){assert.ok(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);}
function data(v,k){plain(v);const d=Object.getOwnPropertyDescriptor(v,k);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;}
function exact(v,keys){plain(v);assert.deepEqual(Reflect.ownKeys(v).sort(),[...keys].sort());return Object.fromEntries(keys.map(k=>[k,data(v,k)]));}
function array(v,max){assert.ok(Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype);assert.ok(v.length<=max);assert.equal(Reflect.ownKeys(v).length,v.length+1);
 return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;});}
function text(v){assert.ok(typeof v==='string'&&v.length>0&&v.length<=512&&!/[\u0000-\u001f\u007f]/u.test(v));return v;}
function hash(v){assert.match(v,HEX);return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
const counts=(rows,key)=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(k=>[k,rows.filter(r=>r[key]===k).length]));

const FROZEN_INPUTS=new Set([
 ...['run.js','verify.js','eligibility.js','contracts.test.js','supervise.py','protocol.json','README.md'],
 ...['manifest.js','methods.js','verify.js'].map(n=>'../hierarchical-e5-expanded-real-root-v1/'+n),
 '../hierarchical-public-capture-v5/capture.js','../hierarchical-public-capture-v2/robots-deny-space-repair.js','../html-metadata-prune-v1/prune.js',
 ...['hierarchy-root-capacity-capture-adr142.mjs','hierarchy-root-capacity-capture-adr142-supervise.py',
 'hierarchy-real-root-training-gold-adr136.json','hierarchy-real-root-calibration-gold-adr136.json','hierarchy-root-expansion-candidates-adr141.json',
 'hierarchy-root-expansion-label-seal-adr141.json','hierarchy-real-root-capture-adr138.traincal.json'].map(n=>'../../../data/'+n),
 ...['public-fetch.js','robots.js','static-capture.js','packaged-e5.js'].map(n=>'../../../src/crawler/'+n),
 ...['hierarchical-e5-paired-linear-heads.js','hierarchical-e5-paired-head-policy.js','hierarchical-e5-observed-head-policy.js','hierarchical-e5-paired-input.js'].map(n=>'../../../src/domain/'+n),
 '../hierarchical-e5-paired-v1/taxonomy.js','../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js','../hierarchical-e5-real-root-v1/assessment.js',
 ...['assessment.js','vector-packet.js','taxonomy.js','freeze.json','output/model.json','output/policy.json','output/input-definition.json','output/fit.json'].map(n=>'../hierarchical-e5-broad-heads-v1/'+n),
 ...['assessment.test.js','assessment.js','supervise.py','run.test.js','run.js','README.md','protocol.json','corpus.test.js','corpus.js','corpus-test.js',
 'corpus-calibration.js','freeze.json','output/calibration.json','output/policy.json','measured-results.json'].map(n=>'../hierarchical-e5-observed-cuts-v1/'+n),
 ...['freeze.json','output/encoding-traincal.json','output/traincal.current-static.vectors.json','output/traincal.wikipedia-prose-lead.vectors.json'].map(n=>'../hierarchical-e5-real-root-v3/'+n),
 '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js','../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json',
 '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js','../../../../../decisions/ADR-142-response-capacity-aware-prospective-root-experiment.md'
]);
export function assertAllowedFrozenInputName(name){
 assert.ok(typeof name==='string'&&name.length>0&&name.length<=512&&!name.includes('\\')&&!name.startsWith('/')&&!/^[a-z]:/iu.test(name));
 assert.ok(FROZEN_INPUTS.has(posix.normalize(name)),'Unlisted frozen-input read refused');
}
export function validateCapacityLedger(input){
 const a=exact(input,['cases','ledger','outcomes']),cases=array(a.cases,112),ledger=array(a.ledger,112),outcomes=array(a.outcomes,112);
 assert.equal(ledger.length,cases.length);const captured=[],refused=[];let index=0;
 for(let i=0;i<cases.length;i++){
  const c=cases[i],r=ledger[i],status=data(r,'status');assert.equal(data(r,'id'),data(c,'id'));assert.equal(data(r,'url'),data(c,'publicUrl'));
  if(status==='captured'){
   const row=exact(r,['id','url','status','outcomeIndex']);assert.equal(row.outcomeIndex,index);const o=outcomes[index++];assert.ok(o);
   assert.equal(data(o,'id'),row.id);assert.equal(data(o,'url'),row.url);hash(data(o,'sourceInputHash'));captured.push(row.id);
  }else if(status==='capacity-refused'){
   const row=exact(r,['id','url','status','reason','transportFailure','originPolicy','pagePolicyAvailable','pagePolicyApproved','rightsPageUnknown','sourceInputIdentityAvailable','evaluationMarkerHash','evaluationMarkerScope']);
   assert.equal(row.pagePolicyAvailable,false);assert.equal(row.pagePolicyApproved,false);assert.equal(row.rightsPageUnknown,true);assert.equal(row.sourceInputIdentityAvailable,false);
   assert.equal(row.evaluationMarkerScope,'evaluation-only-not-captured-source-input');hash(row.evaluationMarkerHash);
   const failure=exact(row.transportFailure,['code','causeCode']);
   assert.ok(row.reason==='page-body-too-large'&&failure.code==='body-too-large'&&failure.causeCode===null||
    row.reason==='page-decoder-output-limit'&&failure.code==='content-encoding'&&failure.causeCode==='ERR_BUFFER_TOO_LARGE');
   const p=exact(row.originPolicy,['robotsSha256','robotsDecodedSha256','robotsCanonicalSha256','robotsRepairId','robotsRepairManifestHash','robotsAbsent','tdmAbsent','tdmSha256','robotsAllowed','crawlDelayMs','tdmDocumentReservation']);
   for(const k of ['robotsSha256','robotsDecodedSha256','robotsCanonicalSha256'])hash(p[k]);
   assert.ok(typeof p.robotsAbsent==='boolean'&&typeof p.tdmAbsent==='boolean');assert.equal(p.robotsAllowed,true);
   assert.ok(Number.isFinite(p.crawlDelayMs)&&p.crawlDelayMs>=0&&p.crawlDelayMs<=86400000);
   assert.ok(p.tdmDocumentReservation===null||p.tdmDocumentReservation===0);
   if(p.tdmSha256!==null)hash(p.tdmSha256);
   if(p.robotsRepairId===null){assert.equal(p.robotsRepairManifestHash,null);assert.equal(p.robotsDecodedSha256,p.robotsCanonicalSha256);}
   else{assert.equal(p.robotsRepairId,'adr137-nl-wikipedia-known-disallow-space-percent20/v1');
    assert.equal(new URL(row.url).origin,'https://nl.wikipedia.org');assert.equal(p.robotsAbsent,false);
    assert.equal(p.robotsSha256,'5b208e484c176e5fdcea5ba86f9ba5aa370117b03b706b37da2451baeb4b88b4');
    assert.equal(p.robotsDecodedSha256,'5bd4fdfe000f3371420eb68a396513fac4a3c75ef5a0c9324ce2eb8be8b6a5dd');
    assert.equal(p.robotsCanonicalSha256,'0f9d910c04b4ed4c26215eb4c9292ff18051376b95dd66cda201aef4538b29f4');
    assert.equal(p.robotsRepairManifestHash,'197646022460b0bffbc2a8701848525559f0bd50d2fcde0927f6d5d47bb56818');}
   refused.push({id:row.id,reason:row.reason});
  }else assert.fail('Fatal/not-attempted ledger must stop BEFORE any encoding or scoring');
 }
 assert.equal(index,outcomes.length);assert.equal(new Set(captured).size,captured.length);assert.equal(new Set(ledger.map(r=>r.id)).size,cases.length);
 return freeze({capturedIds:captured,refused});
}
export function buildTrainingEligibility(input){
 const a=exact(input,['freezeHash','captureSha256','reusedInputHashes','oldTraining','expansionCases','ledger','outcomes']);
 hash(a.freezeHash);hash(a.captureSha256);plain(a.reusedInputHashes);
 const reusedInputHashes={};for(const key of Object.keys(a.reusedInputHashes).sort())reusedInputHashes[key]=hash(data(a.reusedInputHashes,key));
 const old=array(a.oldTraining,48).map(r=>exact(r,['id','groupId','expectedRootId','language','sourceInputHash']));assert.equal(old.length,48);
 const cases=array(a.expansionCases,80);assert.equal(cases.length,80);
 const checked=validateCapacityLedger({cases,ledger:a.ledger,outcomes:a.outcomes}),captured=new Set(checked.capturedIds),outcomes=new Map(array(a.outcomes,80).map(o=>[data(o,'id'),o]));
 const added=cases.filter(c=>captured.has(data(c,'id'))).map(c=>{
  const o=outcomes.get(c.id);assert.ok(typeof data(o,'title')==='string'&&o.title.trim().length>0);
  const current=data(o,'current'),lead=data(o,'leadCandidate');
  assert.ok(typeof data(current,'text')==='string'&&current.text.trim().length>0);
  assert.equal(data(lead,'status'),'available');assert.ok(typeof data(lead,'text')==='string'&&lead.text.trim().length>0);
  return {id:data(c,'id'),groupId:data(c,'entityGroup'),expectedRootId:data(c,'expectedRootId'),language:data(c,'language'),sourceInputHash:hash(data(o,'sourceInputHash'))};
 });
 const rows=[...old,...added],ids=new Set(),groups=new Set();
 for(const r of rows){for(const k of ['id','groupId','expectedRootId','language'])text(r[k]);hash(r.sourceInputHash);
  assert.ok(!ids.has(r.id)&&!groups.has(r.groupId));ids.add(r.id);groups.add(r.groupId);}
 const oldRoots=counts(old,'expectedRootId');assert.equal(Object.keys(oldRoots).length,16);assert.ok(Object.values(oldRoots).every(n=>n===3));
 assert.ok(rows.every(r=>Object.hasOwn(oldRoots,r.expectedRootId)));
 const countsByRoot=counts(rows,'expectedRootId'),countsByLanguage=counts(rows,'language');
 const countsByRootLanguage=Object.fromEntries(Object.keys(countsByRoot).map(root=>[root,counts(rows.filter(r=>r.expectedRootId===root),'language')]));
 const ineligibilityReasons=[];if(rows.length<112)ineligibilityReasons.push('minimum-total-training');
 for(const [root,n]of Object.entries(countsByRoot))if(n<6)ineligibilityReasons.push('minimum-root:'+root);
 return freeze({schema:'hierarchy-root-capacity-training-eligibility/v1',freezeHash:a.freezeHash,captureSha256:a.captureSha256,reusedInputHashes,
 eligibleCohortHash:digest(rows),eligibleTraining:rows,refusedExpansion:checked.refused,oldTrainingRows:48,newEligibleRows:added.length,totalTrainingRows:rows.length,
 countsByRoot,countsByLanguage,countsByRootLanguage,minimumTrainingRows:112,minimumPerRoot:6,potentialTrainingRows:128,
 eligible:ineligibilityReasons.length===0,ineligibilityReasons,sameCohortForAllCandidates:true,equalPriorsClaim:false,responseDependentEligibility:true,
 finalTestEvaluated:false,productionValidated:false,assignmentAuthority:false});
}
