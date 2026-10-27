// Actual SQL assertions only when called by the owned semantic fixture. Import
// is inert. The provider adapter below is invented; no provider request occurs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChatGPTRuntime} from '../../src/ai/chatgpt-runtime.js';
import {buildInsightContext} from '../../../../spikes/topic-resolution/browser/core/insight-context.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function scalar(db,sql,args=[]){const {rows}=await db.query(sql,args);assert.equal(rows.length,1);return rows[0];}

export async function runSemanticInsightNativeAssertions({owner,app,observer,service,appRuntime,appLifecycle,
  actor,header,nextId,now,rootId,rootTopicId,rootDiscussionId,evidenceSourceId,evidenceTopicId,evidenceInput,queued,finish}) {
  let phase='QUESTION';
  try {
  const state=()=>scalar(observer,`SELECT
    (SELECT count(*)::integer FROM canonical_v4.id_registry) ids,
    (SELECT count(*)::integer FROM canonical_v4.contributions) contributions,
    (SELECT count(*)::integer FROM canonical_v4.revisions) revisions,
    (SELECT count(*)::integer FROM canonical_v4.command_receipts) receipts,
    (SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton) revision`);
  const human=await appRuntime.command({actorId:actor.id,requestId:nextId('ai-question'),expected:await header(),
    command:{type:'reply',discussionId:rootDiscussionId,rootId,replyToId:rootId,body:'@AI Welche Antwort passt zur aktuellen Seite?',originSourceId:null}});
  let questionId=human.result.contributionId;
  const readTarget=()=>service.semanticTarget({nodeId:'invented-game-branch',rootId,targetId:questionId});
  const witness=view=>({nodeId:view.nodeId,topicId:view.topic.id,rootRevision:view.rootRevision,targetRevision:view.targetRevision});
  const bundle=async()=>{const view=await readTarget();return service.insightJobBundle({sourceId:evidenceSourceId,topicId:evidenceTopicId,
    destinationTopicId:rootTopicId,semanticTarget:{...witness(view),targetId:questionId}});};
  const proof=command=>({kind:'generated-insight',operationId:command.operationId,actorId:actor.id,topicId:command.topicId,
    originSourceId:command.originSourceId,body:command.body,rootId:command.rootId,replyToId:command.replyToId,
    discussionId:command.discussionId,semanticPublication:command.semanticPublication});
  async function packet(label){
    const value=await bundle(),view=value.semanticTarget;
    const publication={semanticTarget:witness(view),evidence:value.anchor.evidence,articleDigest:sha('Invented current Page B extract'),
      rootDigest:sha(view.root.body),targetDigest:sha(view.root.replies[0].body),expiresAt:Date.now()+60000};
    return {expected:value.anchor.version,command:{type:'share-insight-reply',topicId:rootTopicId,discussionId:rootDiscussionId,
      rootId,replyToId:questionId,body:'Invented generated answer '+label,operationId:nextId('ai-operation'),originSourceId:null,
      semanticPublication:publication}};
  }
  async function refuse(value,codes=['conflict']){
    // Renew only the unrelated global CAS, retaining every stale A/B witness.
    // Otherwise the older expected revision would mask the intended 016 fence.
    const expected=await header(),before=await state();await assert.rejects(appLifecycle.command(expected,value.command,actor,proof(value.command)),e=>codes.includes(e.code));
    assert.deepEqual(await state(),before,'refused AI publication leaves no canonical mutation or receipt');
  }

  // Verify the actual application grant, while broad protected stamp SELECT
  // remains unavailable. Worker and submitter grants are tested by the caller.
  await assert.rejects(app.query('SELECT * FROM canonical_v4.runtime_source_stamps'),e=>e.code==='42501');
  phase='EVIDENCE';
  const evidence=await scalar(app,'SELECT * FROM canonical_v4.semantic_insight_evidence($1)',[evidenceSourceId]);
  assert.equal(evidence.postable,true);assert.match(evidence.source_version,/^(0|[1-9][0-9]*)$/u);
  const initialBundle=await bundle();assert.equal(initialBundle.followupDiscussion,null);
  assert.equal(initialBundle.anchor.evidence.sourceId,evidenceSourceId);assert.notEqual(evidenceTopicId,rootTopicId);
  assert.equal(initialBundle.semanticTarget.root.replies.length,1);assert.equal(initialBundle.semanticTarget.targetId,questionId);
  assert.equal(initialBundle.anchor.evidence.sourceVersion,evidence.source_version);

  // The real worker commits a queued title renewal between two application
  // reads. Both target and evidence must stay in the original read-only RR.
  phase='RR';
  const rrWork=await queued('ai-RR-evidence',{url:evidenceInput.url,title:evidenceInput.title+' RR'});
  let rrVerified=false,renewedDuringRead=false;
  const rrReads=createCanonicalV4ReadFacade({database:{query:(...args)=>app.query(...args),
    transaction:work=>app.transaction(tx=>work({dialect:'pg',query:async(sql,args=[])=>{
      if(sql==='SELECT * FROM canonical_v4.semantic_insight_evidence($1)'&&!renewedDuringRead){
        await finish(rrWork);renewedDuringRead=true;
      }
      const result=await tx.query(sql,args);
      if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'){
        assert.deepEqual(await scalar(tx,"SELECT current_setting('transaction_isolation') isolation,current_setting('transaction_read_only') read_only"),
          {isolation:'repeatable read',read_only:'on'});rrVerified=true;
      }
      return result;
    }}))}});
  const rrView=await readTarget();
  const coherent=await rrReads.insightJobBundle({sourceId:evidenceSourceId,topicId:evidenceTopicId,destinationTopicId:rootTopicId,
    semanticTarget:{...witness(rrView),targetId:questionId}});
  assert.equal(rrVerified,true);assert.equal(renewedDuringRead,true);
  assert.equal(coherent.anchor.evidence.sourceVersion,evidence.source_version);
  assert.equal(coherent.anchor.evidence.operationDigest,evidence.operation_digest);
  assert.deepEqual(coherent.anchor.version,coherent.semanticTarget.version);
  assert.notEqual((await bundle()).anchor.evidence.sourceVersion,evidence.source_version,'a later snapshot sees the committed worker renewal');

  // The actual job state machine, read facade, service and lifecycle adapter
  // publish through the real app SQL role. Only provider/account ports are fake.
  const requests=[],inflight=new Set();let retained=null;
  const track=name=>(...args)=>{const pending=Promise.resolve().then(()=>service[name](...args));inflight.add(pending);
    pending.then(()=>inflight.delete(pending),()=>inflight.delete(pending));return pending;};
  const aiService={...service,insightBundle:track('insightBundle'),insightJobBundle:track('insightJobBundle')};
  const ai=createChatGPTRuntime({service:aiService,connectionAdapter:{status:()=>({connected:true,planEnabled:true,pending:false,
    account:{clientId:'invented-native-fixture',label:'Synthetic provider fixture'}}),dispose(){}},
    insightsAdapter:{createInsight(request){requests.push(request);return Promise.resolve({body:'@Alex: Eine erfundene Testantwort.',model:'synthetic-fixture',citations:[]});},cancel(){},dispose(){}}});
  try{
    const view=await readTarget(),parts=await service.insightBundle({sourceId:evidenceSourceId,topicId:evidenceTopicId,
      includeDiscussion:false,includeRelatedSources:false,destinationTopicId:rootTopicId,semanticTarget:{...witness(view),targetId:questionId}});
    const context=buildInsightContext({catalog:parts.catalog,discussion:parts.discussion,related:null,sourceId:evidenceSourceId,
      topicId:evidenceTopicId,includeDiscussion:false,sourceLimit:6});
    const operationId=nextId('native-ai-job');
    phase='JOB_CREATE';
    await ai.create({operationId,model:'synthetic-fixture',context,articleText:'Invented current Page B extract',allowWebResearch:false,
      expected:parts.version,includeRelatedSources:false,followupQuestionId:questionId,followupTopicId:rootTopicId,semanticTarget:witness(view)},actor.id);
    // The fixture has one exclusive app connection. Background dispatch and
    // completion checks must settle before another SQL-bearing result read.
    // Poll only existing in-memory terminal diagnostics while they run.
    phase='JOB_WAIT';const deadline=Date.now()+3000;
    const terminal=()=>ai.diagnostics().events.some(event=>event.kind==='insight');
    while(!terminal()&&Date.now()<deadline)await sleep(5);
    assert.equal(terminal(),true,'original background job settles within the existing SQL deadline');
    phase='JOB_RESULT';const result=await ai.result({operationId},actor.id);
    assert.equal(result.state,'completed');assert.equal(requests.length,1);assert.equal(requests[0].context.currentSource.id,evidenceSourceId);
    assert.equal(requests[0].articleText,'Invented current Page B extract');assert.equal(requests[0].followup.questionBody,view.root.replies[0].body);
    assert.equal(requests[0].followup.parentBody,view.root.body.slice(0,2000));
    const resumed=await ai.resumable(actor.id);assert.equal(resumed.job.originSourceId,null);
    assert.deepEqual(resumed.job.semanticPublication,result.semanticPublication);
    const command={type:'share-insight-reply',topicId:rootTopicId,discussionId:rootDiscussionId,rootId,replyToId:questionId,
      body:result.result.body,operationId,originSourceId:null,semanticPublication:result.semanticPublication};
    phase='JOB_SHARE';
    const posted=await ai.share({expected:await header(),command},actor.id,(generated,current)=>{
      retained={expected:current,command:structuredClone(command),proof:generated};return service.command(current,command,actor.id,generated);
    });
    const stored=await scalar(owner,'SELECT discussion_id,root_id,reply_to_id,origin_source_id,actor_type FROM canonical_v4.contributions WHERE id=$1',[posted.result.contributionId]);
    assert.deepEqual(stored,{discussion_id:rootDiscussionId,root_id:rootId,reply_to_id:questionId,origin_source_id:null,actor_type:'agent'});
    assert.equal(requests.length,1,'result/resume/share never reissue the provider request');
  }finally{ai.dispose();await Promise.allSettled([...inflight]);}

  // A fresh request cannot use stale question/root revisions or an absent edge.
  phase='STALE';const staleTarget=await packet('stale-target');
  await appLifecycle.command(await header(),{type:'edit',contributionId:questionId,body:'Edited question after AI witness'},actor);
  await refuse(staleTarget);
  const beforeReplay=await state();await appLifecycle.command(retained.expected,retained.command,actor,retained.proof);
  assert.deepEqual(await state(),beforeReplay,'exact original receipt replays after target edits without another append');
  const changed=structuredClone(retained.command);changed.semanticPublication.targetDigest='f'.repeat(64);
  const changedMaterial=JSON.stringify({generation:retained.expected.generation,revision:retained.expected.revision,command:changed});
  const changedArgs=[actor.id,'lifecycle-'+sha(JSON.stringify({actorId:actor.id,expected:retained.expected,command:retained.command})),
    sha(changedMaterial),changedMaterial,retained.expected.generation,retained.expected.revision,changed.type,changed.topicId,
    changed.discussionId,changed.rootId,changed.replyToId,changed.body,changed.originSourceId,changed.operationId,null,nextId('forbidden-ai-replay'),now(),JSON.stringify(proof(changed))];
  await assert.rejects(app.query('SELECT canonical_v4.runtime_lifecycle_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',changedArgs),e=>e.code==='P1001');
  assert.deepEqual(await state(),beforeReplay,'altered witness cannot reuse the same actor/request receipt');
  const wrongNode=await packet('wrong-node');wrongNode.command.semanticPublication.semanticTarget.nodeId='nature';await refuse(wrongNode);
  const expired=await packet('expired');expired.command.semanticPublication.expiresAt=Date.now()-1;await refuse(expired);

  // Verify expiry after an actual watermark lock wait, not just at entry.
  phase='LATE_EXPIRY';const late=await packet('expires-behind-watermark');late.command.semanticPublication.expiresAt=Date.now()+900;
  const beforeLate=await state(),entered=deferred(),release=deferred(),ownerPid=Number((await scalar(owner,'SELECT pg_backend_pid() pid')).pid);let pending,results;
  const held=owner.transaction(async tx=>{try{await tx.query('SELECT singleton FROM canonical_v4.runtime_state WHERE singleton FOR UPDATE');
    entered.resolve();await release.promise;}catch(error){entered.reject(error);throw error;}});void held.catch(()=>{});
  try{
    await entered.promise;pending=appLifecycle.command(late.expected,late.command,actor,proof(late.command));void pending.catch(()=>{});
    const appPid=Number((await scalar(observer,"SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND usename='murmingle_app'")).pid);
    const until=Date.now()+1500;let waiting=false;
    while(Date.now()<until){const row=await scalar(observer,"SELECT coalesce((SELECT wait_event_type='Lock' AND $2=ANY(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=$1),false) waiting",[appPid,ownerPid]);
      if(row.waiting){waiting=true;break;}await sleep(5);}
    assert.equal(waiting,true,'generated publication actually waits on the held watermark');
    assert.deepEqual(await state(),beforeLate,'MVCC readers exclude uncommitted generated writes');
    await sleep(Math.max(0,late.command.semanticPublication.expiresAt-Date.now()+25));
  }finally{release.resolve();results=await Promise.allSettled([held,...(pending?[pending]:[])]);}
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1]?.status,'rejected');assert.equal(results[1].reason.code,'conflict');
  assert.deepEqual(await state(),beforeLate,'late expiry rolls back contributions, IDs, revisions and receipt');

  // Title-only Page B renewal must invalidate evidence even if its embedding
  // and authoritative body-vector stamp are unchanged.
  phase='TITLE_RENEWAL';const staleEvidence=await packet('title-renewal'),prior=staleEvidence.command.semanticPublication.evidence;
  await finish(await queued('ai-title-renewal',{url:evidenceInput.url,title:evidenceInput.title+' changed'}));
  const renewed=await scalar(app,'SELECT * FROM canonical_v4.semantic_insight_evidence($1)',[evidenceSourceId]);
  assert.equal(renewed.stamp,prior.sourceStamp);assert.notEqual(renewed.operation_digest,prior.operationDigest);
  assert.notEqual(renewed.source_version,prior.sourceVersion);await refuse(staleEvidence);
  phase='ROOT_WITHDRAWAL';const staleRoot=await packet('stale-root');
  await appLifecycle.command(await header(),{type:'edit',contributionId:rootId,body:'Edited root after generated witness'},actor);await refuse(staleRoot);
  const withdrawn=await packet('withdrawn-question');
  await appLifecycle.command(await header(),{type:'withdraw',contributionId:questionId},actor);await refuse(withdrawn,['invalid']);
  questionId=(await appRuntime.command({actorId:actor.id,requestId:nextId('ai-erasure-question'),expected:await header(),
    command:{type:'reply',discussionId:rootDiscussionId,rootId,replyToId:rootId,body:'Visible question retained across Source erasure',originSourceId:null}})).result.contributionId;
  const erasure=await packet('erased-membership');
  return {...erasure,proof:proof(erasure.command)};
  }catch(error){throw Object.assign(new Error('Semantic AI native assertion failed',{cause:error}),{code:'SEMANTIC_AI_'+phase});}
}
