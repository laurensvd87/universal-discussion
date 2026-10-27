import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const corpus=JSON.parse(readFileSync(new URL('../harness/hierarchy-child-corpus.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows=corpus.freshCandidates;
test('plan revision preserves every historical annotation and original candidate value',()=>{
 // Baseline is git show HEAD:apps/local-service/harness/hierarchy-child-corpus.json decoded as
 // UTF-8, not a digest taken from the edited candidate's decoded strings.
 assert.equal(hash(Object.fromEntries(['reviewedArchivedRows','unknownArchivedRoster','unavailableArchivedRows'].map(k=>[k,corpus[k]]))),'b2feef0fdf8c3ed4d0627ddb075d2ebe71f326c684e84f1178bd3fc6af228bb8');
 const unchanged=Object.fromEntries(Object.entries(corpus).filter(([key])=>!['freshCandidates','requestBudget','separation','acceptanceLimitations','executionConditions','selectionRevision'].includes(key)));
 assert.equal(hash(unchanged),'081b30d2b14a055b4f39ab3ccf5de4ed6e3e74a646746792cc021a1892cad0e4');
 assert.equal(corpus.reviewedArchivedRows.find(r=>r.id==='root-expansion-train-009').title,'For\u00eats d\u00e9cidues humides tropicales et subtropicales');
 assert.equal(corpus.reviewedArchivedRows.find(r=>r.id==='root-expansion-train-010').title,'Selecci\u00f3n natural');
 assert.equal(hash(rows.slice(0,16)),'f08476bff786a267534e753c7d1d54f6b9b4f58907b19302fea8f41ffc3e8017');
 assert.equal(corpus.selectionRevision.historicalRosterSha256,'b2feef0fdf8c3ed4d0627ddb075d2ebe71f326c684e84f1178bd3fc6af228bb8');
 assert.equal(rows.length,25);assert.equal(corpus.selectionRevision.predictionsSeen,false);
});
test('fresh IDs, document/entity groups, URLs and publisher umbrellas never cross splits',()=>{
 for(const field of ['id','groupId','documentFamily','url'])assert.equal(new Set(rows.map(r=>r[field])).size,rows.length,field);
 const priorGroups=new Set(corpus.reviewedArchivedRows.map(r=>r.groupId));
 for(const row of rows.slice(16))assert.equal(priorGroups.has(row.groupId),false,row.id);
 const publishers=new Map();
 for(const row of rows){
  const url=new URL(row.url);assert.equal(url.protocol,'https:');assert.equal(url.origin,row.origin);assert.equal(url.username+url.password+url.hash,'');
  const family=url.hostname.endsWith('nsw.gov.au')?'new-south-wales-government':row.sourceFamily;
  if(publishers.has(family))assert.equal(publishers.get(family),row.split,row.id);else publishers.set(family,row.split);
  assert.equal(row.collectorApproved,false);assert.equal(row.collectorAttempted,false);assert.equal(row.embeddingGenerated,false);assert.equal(row.labelRevisionAfterPredictionsAllowed,false);
 }
});
test('planned animal negatives and fresh video-game TEST have explicit central-subject labels',()=>{
 const count=(split,predicate)=>rows.filter(r=>r.split===split&&predicate(r)).length;
 assert.equal(count('calibration',r=>r.labels.animals===true&&r.labels.koalas===false),3);
 assert.equal(count('test',r=>r.labels.animals===true&&r.labels.koalas===false),4);
 assert.equal(count('test',r=>r.labels.koalas===true),3);
 assert.equal(count('test',r=>r.expectedRootId==='games'&&r.labels['video-games']===true),3);
 assert.equal(count('test',r=>r.expectedRootId==='games'&&r.labels['video-games']===false),3);
 for(const row of rows.slice(16)){assert.equal(row.selectionEvidence.publisherUrl,row.url);assert.match(row.reviewMode,/search-result/);assert.ok(row.rationale.length>40);}
 assert.equal(corpus.acceptanceLimitations.koalaParentConditionedSupport.requireActualAcceptedParentBeforeCountingGatedSupport,true);
});
test('split-specific collection budgets count every exact-origin policy request without increasing caps',()=>{
 const plan=corpus.requestBudget;assert.equal(plan.maximumRequestsPerInvocation,34);assert.equal(plan.maximumDurationMsPerInvocation,240000);assert.equal(plan.minimumSequentialSpacingMs,5000);
 const seen=new Set();
 for(const batch of plan.batches){
  const subset=batch.ids.map(id=>{assert.equal(seen.has(id),false);seen.add(id);const row=rows.find(r=>r.id===id);assert.ok(row);assert.equal(row.split==='test',batch.name==='frozen-test-only');return row;});
  const origins=new Set(subset.map(r=>r.origin));assert.equal(batch.subjectRequests,subset.length);assert.equal(batch.originCount,origins.size);assert.equal(batch.originPolicyRequests,origins.size*2);assert.equal(batch.totalRequests,subset.length+origins.size*2);assert.ok(batch.totalRequests<=34);
  assert.equal(batch.perOrigin.length,origins.size);
  for(const origin of batch.perOrigin){assert.deepEqual(origin.subjectIds,subset.filter(r=>r.origin===origin.origin).map(r=>r.id));assert.equal(origin.totalRequests,origin.subjectIds.length+2);}
 }
 assert.equal(seen.size,rows.length);assert.deepEqual(plan.batches.map(b=>b.totalRequests),[21,30]);
});
test('known heldout collision stays quarantined and all authority/quality flags remain false',()=>{
 const collision=corpus.reviewedArchivedRows.find(r=>r.id==='gta-train-03');assert.equal(collision.reuseEligible,false);assert.ok(collision.heldoutDocumentCollisions.length>0);
 for(const field of ['classificationOrFitExecuted','newChildPredictionsSeen','collectorExecuted','newAssetsCreated','rootRetuned','existingGtaArtifactChanged','productionValidated','assignmentAuthority','nativeObservation','representativePopulation','statisticalIndependenceClaim'])assert.equal(corpus.scope[field],false,field);
 assert.equal(corpus.acceptanceLimitations.newCandidateEligibilityEstablished,false);assert.equal(corpus.acceptanceLimitations.qualityOrInstallationAcceptance,false);
 assert.match(corpus.separation.nearDuplicateAudit,/0\.80/);assert.match(corpus.separation.nearDuplicateAudit,/Never move split/);
 assert.match(corpus.separation.nearDuplicateAudit,/NOT duplicates merely because they concern the same species/);
});
