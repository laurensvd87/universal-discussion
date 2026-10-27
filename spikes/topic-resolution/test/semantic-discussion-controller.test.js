import { createHash } from "node:crypto";
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDiscussionController} from '../browser/core/local-discussion-controller.js';
import {createLocalServiceClient,isConfirmedCommandRejection,LocalServiceClientError} from '../browser/core/local-service-client.js';
import {createMemoryDemoService} from '../../../apps/local-service/src/application/create-demo-service.js';
import {lookupIndicatorFixtureByNormalizedUrl} from '../browser/fixtures/indicator-fixtures.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({saved=false,semanticTarget,command,attestActiveContext,attestSavedDocument,targetTopicId='harbor-s2',targetOrigin='harbor-overview'}={}) {
  let serial=0,actor='demo-alex',tab={tabId:7,windowId:2,url:'https://example.com/'};
  const service=createMemoryDemoService({nextId:kind=>kind+'-'+(++serial),now:()=> '2026-10-27T12:00:00.000Z'});
  const append=body=>service.command(service.catalog().version,body,'demo-alex');
  const rootId=append({type:'create-root',topicId:targetTopicId,body:'Canonical root A',originSourceId:targetOrigin}).result.contributionId;
  const targetId=append({type:'reply',discussionId:service.discussion(targetTopicId).discussionId,rootId,replyToId:rootId,body:'Canonical target A',originSourceId:null}).result.contributionId;
  const ids={nodeId:'harbor',topicId:targetTopicId,discussionId:service.discussion(targetTopicId).discussionId,rootId,targetId};
  let resolution=null;
  if(saved){tab={...tab,url:'http://127.0.0.1:4173/background-fixture/page-a.html'};
    const result=service.ingest({expected:service.catalog().version,operationId:'saved-operation',url:tab.url,title:'Page B',
      embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:Array.from({length:384},(_,i)=>i===0?1:0)},extractorVersion:'main-text-prefix/v1'});
    resolution={phase:'processing',reason:'embedding',tabId:7,url:tab.url,documentId:'doc-b',sourceId:null,topicId:null,assignment:null,
      sequence:1,enabled:true,blockedOrigins:[],sessionWindowId:2,currentWindowId:2,sessionRevision:'session-b',hostAccess:true,
      currentOrigin:'http://127.0.0.1:4173',currentTabId:7,currentUrl:tab.url,contextReason:null};
    assert.notEqual(result.topicId,ids.topicId);
  }
  const reads=[],writes=[];
  function dto(){const discussion=service.discussion(ids.topicId),root=discussion.roots.find(root=>root.id===rootId);
    return {version:discussion.version,policyRevision:2,nodeId:ids.nodeId,topic:discussion.topic,discussionId:discussion.discussionId,
      root:{...root,replies:root.replies.filter(reply=>reply.id===targetId)},targetId,rootRevision:3,targetRevision:2,
      actors:service.catalog().actors.filter(a=>a.id==='demo-alex')};}
  const client={async health(){return {};},async catalog(){return service.catalog();},
    async discussion(id){return service.discussion(id);},async related(sourceId,limit){return service.related(sourceId,limit);},
    async priorDiscussions(sourceId){return {version:service.catalog().version,sourceId,currentTopicId:service.catalog().sources.find(s=>s.id===sourceId).topicId,topics:[]};},
    async urlSelection({url}){const catalog=service.catalog(),source=catalog.sources.find(s=>s.url===url);return {catalog,discussion:service.discussion(source.topicId)};},
    async semanticTarget(request,options){reads.push({request,options});return semanticTarget?semanticTarget(request,options,dto):dto();},
    async command(expected,value,actorId,options){if(options?.beforeDispatch&&!await options.beforeDispatch())throw Object.assign(Error('guard refused'),{code:'conflict'});
      writes.push({expected,value,actorId,options});if(command)return command(expected,value,actorId,options);
      return {version:{generation:expected.generation,revision:expected.revision+1},result:{contributionId:'accepted-semantic-reply'}};},
  };
  const controller=createLocalDiscussionController({client,session:{async isPaired(){return true;}},readPostingActor:()=>actor,
    readActiveTab:async()=>({...tab}),observeTabLifecycle:()=>()=>{},lookupByNormalizedUrl:lookupIndicatorFixtureByNormalizedUrl,
    ...(saved?{readPageResolution:async()=>structuredClone(resolution),attestSavedDocument:attestSavedDocument??(async()=>true)}:{}),
    ...(attestActiveContext?{attestActiveContext}:{}),});
  await controller.setTopicViewMode('classic');await controller.open();await turn();
  return {controller,service,ids,reads,writes,dto,append,setActor(value){actor=value;},setTab(patch){tab={...tab,...patch};},
    setResolution(patch){resolution={...resolution,...patch};},resolution:()=>resolution};
}

test('fresh semantic selection keeps foreground canonical Page B intact and prepares only a human reply',async t=>{
  const ui=await harness();t.after(()=>ui.controller.dispose());const before=ui.controller.currentState();
  assert.equal(await ui.controller.selectSemanticTarget(ui.ids),true);const selected=ui.controller.currentState();
  for(const key of ['catalog','discussion','sourceId','topicId','selection','resolution'])assert.deepEqual(selected[key],before[key]);
  assert.equal(selected.semanticSelection.root.id,ui.ids.rootId);assert.equal(selected.draft.targetId,ui.ids.targetId);assert.equal(selected.semanticAiAvailable,false);
  assert.deepEqual(ui.reads[0].request,{nodeId:ui.ids.nodeId,rootId:ui.ids.rootId,targetId:ui.ids.targetId});
  assert.equal(await ui.controller.shareInsight({}),false);
});

test('semantic human reply rereads exact target, sends atomic revision witness and uses null cross-Source origin',async t=>{
  const ui=await harness();t.after(()=>ui.controller.dispose());const before=ui.controller.currentState();await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Reply from page B');
  assert.equal(await ui.controller.submitDraft(),true);assert.equal(ui.reads.length,2);assert.equal(ui.writes.length,1);
  assert.deepEqual(ui.writes[0].value,{type:'reply',discussionId:ui.ids.discussionId,rootId:ui.ids.rootId,replyToId:ui.ids.targetId,body:'Reply from page B',originSourceId:null,
    semanticTarget:{nodeId:ui.ids.nodeId,topicId:ui.ids.topicId,rootRevision:3,targetRevision:2}});
  const after=ui.controller.currentState();for(const key of ['sourceId','topicId','selection','discussion','resolution'])assert.deepEqual(after[key],before[key]);
  assert.equal(after.draft.body,'');
});

test('reply to a semantic root uses that original root as the exact target',async t=>{
  const ui=await harness({semanticTarget:async(request,_options,dto)=>{const value=dto();return {...value,targetId:request.rootId,
    targetRevision:value.rootRevision,root:{...value.root,replies:[]}};}});t.after(()=>ui.controller.dispose());
  assert.equal(await ui.controller.selectSemanticTarget({...ui.ids,targetId:ui.ids.rootId}),true);ui.controller.setDraft('Reply to original root');
  assert.equal(await ui.controller.submitDraft(),true);assert.equal(ui.writes[0].value.replyToId,ui.ids.rootId);
  assert.deepEqual(ui.writes[0].value.semanticTarget,{nodeId:ui.ids.nodeId,topicId:ui.ids.topicId,rootRevision:3,targetRevision:3});
});

test('saved human fast-post authority remains separate while matcher is processing',async t=>{
  const ui=await harness({saved:true});t.after(()=>ui.controller.dispose());const before=ui.controller.currentState();assert.equal(before.phase,'loading');assert.equal(before.humanPostingReady,true);
  assert.equal(await ui.controller.selectSemanticTarget(ui.ids),true);ui.controller.setDraft('Saved Page B reply');assert.equal(await ui.controller.submitDraft(),true);
  assert.equal(ui.writes[0].value.originSourceId,null);const after=ui.controller.currentState();assert.equal(after.phase,'loading');assert.equal(after.humanPostingReady,true);
  assert.equal(after.sourceId,before.sourceId);assert.equal(after.topicId,before.topicId);
});

test('origin requires the actual foreground Source URL and independent destination eligibility',async t=>{
  const same=await harness({targetTopicId:'reserved-domain-demo',targetOrigin:null});t.after(()=>same.controller.dispose());
  await same.controller.selectSemanticTarget(same.ids);same.controller.setDraft('Eligible foreground origin');assert.equal(await same.controller.submitDraft(),true);
  assert.equal(same.writes[0].value.originSourceId,'reserved-example-com');
  const other=await harness();t.after(()=>other.controller.dispose());await other.controller.selectSource('harbor-overview');
  assert.equal(other.controller.currentState().sourceId,'harbor-overview');assert.equal(await other.controller.selectSemanticTarget(other.ids),true);
  other.controller.setDraft('Manual Source A is not the foreground document');assert.equal(await other.controller.submitDraft(),true);
  assert.equal(other.writes[0].value.originSourceId,null);
});

test('changed destination, generation, body or body revision refuses posting without rebase',async t=>{
  for(const change of [value=>{value.topic.id='different-topic';},value=>{value.discussionId='different-discussion';},value=>{value.version.generation='different-generation';},
    value=>{value.root.body='Changed root';},value=>{value.root.replies[0].body='Changed target';},value=>{value.rootRevision++;},value=>{value.targetRevision++;}]){
    let reads=0;const ui=await harness({semanticTarget:async(_request,_options,dto)=>{const value=dto();if(++reads>1)change(value);return value;}});t.after(()=>ui.controller.dispose());
    assert.equal(await ui.controller.selectSemanticTarget(ui.ids),true);ui.controller.setDraft('Do not silently rebase');assert.equal(await ui.controller.submitDraft(),false);
    assert.equal(ui.writes.length,0);assert.equal(ui.controller.currentState().draft.body,'Do not silently rebase');assert.equal(ui.controller.currentState().draft.detached,true);
  }
});

test('selection rejects forged tuple and stale responses after account or document revocation',async t=>{
  const ui=await harness();t.after(()=>ui.controller.dispose());assert.equal(await ui.controller.selectSemanticTarget({...ui.ids,topicId:'forged-topic'}),false);
  assert.equal(ui.controller.currentState().semanticSelection,null);
  for(const revoke of [ui=>ui.setActor('demo-blair'),ui=>ui.controller.invalidateContext(),ui=>ui.controller.dispose()]){
    const gate=deferred();const held=await harness({semanticTarget:async()=>gate.promise});t.after(()=>held.controller.dispose());
    const pending=held.controller.selectSemanticTarget(held.ids);await turn();revoke(held);gate.resolve(held.dto());assert.equal(await pending,false);assert.equal(held.controller.currentState().semanticSelection,null);
  }
});

test('prewrite and credential dispatch guards refuse account, privacy and native document changes',async t=>{
  for(const revoke of [ui=>ui.setActor('demo-blair'),ui=>ui.setResolution({blockedOrigins:['http://127.0.0.1:4173']}),ui=>ui.setResolution({documentId:'replacement-doc'}),ui=>ui.setTab({tabId:99})]){
    const ui=await harness({saved:true});t.after(()=>ui.controller.dispose());await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Do not send');revoke(ui);
    assert.equal(await ui.controller.submitDraft(),false);assert.equal(ui.writes.length,0);
  }
});

test('final asynchronous native dispatch attestation fences a replacement document before fetch',async t=>{
  const gate=deferred(),entered=deferred();let docs=0,holdAt=Infinity;
  const ui=await harness({saved:true,attestSavedDocument:async()=>{if(++docs===holdAt){entered.resolve();await gate.promise;}return true;}});t.after(()=>ui.controller.dispose());
  await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Do not send after the last native yield');holdAt=docs+3;
  const pending=ui.controller.submitDraft();await entered.promise;ui.setResolution({documentId:'new-native-document'});gate.resolve();
  assert.equal(await pending,false);assert.equal(ui.writes.length,0);assert.equal(ui.controller.currentState().semanticWritePending,false);
});

test('ambiguous semantic append stays latched and cannot automatically reissue after open or reselection',async t=>{
  const ui=await harness({command:async()=>{throw Object.assign(Error('ambiguous'),{code:'unavailable'});}});t.after(()=>ui.controller.dispose());
  await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Possibly committed');assert.equal(await ui.controller.submitDraft(),false);
  assert.equal(ui.controller.currentState().semanticWritePending,true);assert.equal(ui.controller.currentState().draft.detached,true);assert.equal(ui.writes.length,1);
  await ui.controller.open();assert.equal(await ui.controller.selectSemanticTarget(ui.ids),false);assert.equal(await ui.controller.submitDraft(),false);assert.equal(ui.writes.length,1);
  assert.equal(ui.controller.currentState().semanticWritePending,true);
});

test('explicit uncertainty acknowledgement permits a fresh read without reissuing and never exposes old account draft',async t=>{
  const ui=await harness({command:async()=>{throw Error('ambiguous');}});t.after(()=>ui.controller.dispose());await ui.controller.selectSemanticTarget(ui.ids);
  ui.controller.setDraft('Private unsent-or-committed semantic text');await ui.controller.submitDraft();assert.equal(ui.writes.length,1);
  assert.equal(ui.controller.acknowledgeSemanticWriteUncertainty(''),false);assert.equal(ui.controller.currentState().semanticWritePending,true);
  ui.setActor('demo-blair');ui.controller.accountChanged();await turn();
  assert.equal(JSON.stringify(ui.controller.currentState()).includes('Private unsent-or-committed semantic text'),false);
  assert.equal(ui.controller.acknowledgeSemanticWriteUncertainty('ACKNOWLEDGE POSSIBLE SEMANTIC REPLY'),true);
  assert.equal(ui.controller.currentState().needsFreshRead,true);assert.equal(ui.controller.currentState().semanticWritePending,false);assert.equal(ui.writes.length,1);
  await ui.controller.open();assert.equal(ui.controller.currentState().needsFreshRead,false);assert.equal(ui.writes.length,1);assert.equal(await ui.controller.selectSemanticTarget(ui.ids),true);
});

test('exact bounded service rejection bytes prove noncommit without changing legacy error codes',async t=>{
  for(const [status,label] of [[400,'invalid-request'],[401,'unauthorized'],[403,'forbidden'],[404,'not-found'],[409,'conflict']]){
    const client=createLocalServiceClient({getToken:()=> 'synthetic-pairing-token-long-enough',fetchImpl:async()=>new Response(JSON.stringify({error:label}),{status,headers:{'content-type':'application/json'}})});
    const error=await client.command({generation:'generation',revision:1},{type:'reply',discussionId:'discussion-a',rootId:'root-a',replyToId:'reply-a',body:'Reply'},'demo-alex').catch(error=>error);
    assert.equal(isConfirmedCommandRejection(error),true);assert.equal(error.code,{400:'invalid-request',401:'unauthorized',409:'conflict'}[status]??'unavailable');
    const ui=await harness({command:async()=>{throw error;}});t.after(()=>ui.controller.dispose());await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Rejected append');
    assert.equal(await ui.controller.submitDraft(),false);assert.equal(ui.controller.currentState().semanticWritePending,false);assert.equal(ui.controller.currentState().draft.detached,true);
  }
  assert.equal(isConfirmedCommandRejection(new LocalServiceClientError('conflict')),false);
  for(const body of ['{"error":"conflict","extra":true}','{"error":"conflict","error":"conflict"}','not json']){
    const client=createLocalServiceClient({getToken:()=> 'synthetic-pairing-token-long-enough',fetchImpl:async()=>new Response(body,{status:409,headers:{'content-type':'application/json'}})});
    const error=await client.command({generation:'generation',revision:1},{type:'reply',discussionId:'discussion-a',rootId:'root-a',replyToId:'reply-a',body:'Reply'},'demo-alex').catch(error=>error);
    assert.equal(isConfirmedCommandRejection(error),false);
  }
});

test('confirmed late append requires a fresh read after foreground revocation',async t=>{
  const gate=deferred(),entered=deferred();const ui=await harness({command:async()=>{entered.resolve();return gate.promise;}});t.after(()=>ui.controller.dispose());
  await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('In flight');const pending=ui.controller.submitDraft();await entered.promise;ui.controller.invalidateContext();
  gate.resolve({version:ui.service.catalog().version,result:{contributionId:'accepted'}});assert.equal(await pending,false);
  assert.equal(ui.controller.currentState().needsFreshRead,true);assert.equal(ui.controller.currentState().semanticWritePending,false);
});

test('disposing during an ambiguous append drops private pending state even after late rejection',async()=>{
  const gate=deferred(),entered=deferred();const ui=await harness({command:async()=>{entered.resolve();return gate.promise;}});
  await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Disposed private pending text');const pending=ui.controller.submitDraft();await entered.promise;
  ui.controller.dispose();assert.equal(ui.controller.currentState().semanticWritePending,false);assert.equal(ui.controller.currentState().draft.body,'');
  gate.reject(Error('late ambiguous failure'));assert.equal(await pending,false);assert.equal(ui.controller.currentState().semanticWritePending,false);
  assert.equal(ui.controller.currentState().phase,'disconnected');assert.equal(ui.writes.length,1);assert.equal(await ui.controller.submitDraft(),false);
});

test('command beforeDispatch runs after delayed pairing and account credentials and forwards the witness',async()=>{
  const credentials=deferred();let current=true,fetches=0;
  const account='account-12345678-1234-4234-8234-123456789abc';
  const client=createLocalServiceClient({getToken:async()=> 'synthetic-pairing-token-long-enough',getAccountToken:()=>credentials.promise,fetchImpl:async()=>{fetches++;throw Error('unexpected fetch');}});
  const pending=client.command({generation:'generation',revision:1},{type:'reply',discussionId:'discussion-a',rootId:'root-a',replyToId:'reply-a',body:'Reply',originSourceId:null,
    semanticTarget:{nodeId:'games',topicId:'topic-a',rootRevision:3,targetRevision:2}},account,{beforeDispatch:()=>current});
  await turn();current=false;credentials.resolve('x'.repeat(43));await assert.rejects(pending,{code:'conflict'});assert.equal(fetches,0);
});

test('exact account authentication rejection releases ambiguity evidence without clearing device pairing',async()=>{
  const account='account-12345678-1234-4234-8234-123456789abc';let accounts=0,pairings=0;
  const client=createLocalServiceClient({getToken:()=> 'synthetic-pairing-token-long-enough',getAccountToken:()=> 'x'.repeat(43),
    onAccountUnauthorized:async()=>{accounts++;},onUnauthorized:async()=>{pairings++;},
    fetchImpl:async()=>new Response('{"error":"authentication-required"}',{status:401,headers:{'content-type':'application/json'}})});
  const error=await client.command({generation:'generation',revision:1},{type:'reply',discussionId:'discussion-a',rootId:'root-a',replyToId:'reply-a',body:'Reply'},account).catch(error=>error);
  assert.equal(error.code,'authentication-required');assert.equal(isConfirmedCommandRejection(error),true);assert.equal(accounts,1);assert.equal(pairings,0);
});

const sha=text=>createHash('sha256').update(text).digest('hex');
function semanticReview(ui){const state=ui.controller.currentState(),dto=ui.dto();return {
 body:'Generated exact answer',operationId:'semantic-generated-op',actorId:state.actorId,topicId:state.topicId,sourceId:state.sourceId,
 discussionId:ui.ids.discussionId,rootId:ui.ids.rootId,replyToId:ui.ids.targetId,followupTopicId:ui.ids.topicId,
 targetBinding:{rootBody:dto.root.body,targetBody:dto.root.replies[0].body},
 semanticPublication:{semanticTarget:{nodeId:ui.ids.nodeId,topicId:ui.ids.topicId,rootRevision:dto.rootRevision,targetRevision:dto.targetRevision},
 evidence:{sourceId:state.sourceId,sourceVersion:'1',operationId:'evidence-op',operationDigest:sha('operation'),sourceStamp:sha('stamp')},
 articleDigest:sha('Page B'),rootDigest:sha(dto.root.body),targetDigest:sha(dto.root.replies[0].body),expiresAt:Date.now()+60000}};}

test('semantic followup reader is ephemeral, native-bound and preserves a new unsent human draft',async t=>{
 const ui=await harness();t.after(()=>ui.controller.dispose());ui.controller.setDraft('Unsent private human draft');
 const before=ui.controller.currentState();const dto=await ui.controller.readSemanticFollowupTarget(ui.ids);
 assert.equal(dto.targetId,ui.ids.targetId);assert.deepEqual(ui.controller.currentState(),before);
 assert.equal(await ui.controller.readSemanticFollowupTarget(ui.ids,{expected:{rootRevision:99,targetRevision:2,rootBody:'Canonical root A',targetBody:'Canonical target A'}}),null);
 ui.setTab({url:'https://example.org/'});assert.equal(await ui.controller.readSemanticFollowupTarget(ui.ids),null);
 const saved=await harness({saved:true});t.after(()=>saved.controller.dispose());assert.equal(await saved.controller.readSemanticFollowupTarget(saved.ids),null);
});

test('confirmed semantic human handoff names only the returned accepted question ID',async t=>{
 const ui=await harness();t.after(()=>ui.controller.dispose());await ui.controller.selectSemanticTarget(ui.ids);ui.controller.setDraft('Question @AI');
 assert.equal(await ui.controller.submitDraft(),true);const accepted=ui.controller.currentState().createdPost;
 assert.deepEqual(accepted.semantic,{...ui.ids,targetId:'accepted-semantic-reply'});assert.equal(accepted.id,'accepted-semantic-reply');
 assert.equal(ui.controller.currentState().discussion.roots.some(root=>root.id===ui.ids.rootId),false);
});

test('semantic generated reply preserves Page B graph and unsent draft and sends the unchanged exact proof',async t=>{
 const ui=await harness();t.after(()=>ui.controller.dispose());ui.controller.setDraft('New unsent draft must stay private');
 const before=ui.controller.currentState(),review=semanticReview(ui);
 assert.equal(await ui.controller.shareInsight(review),true);assert.equal(ui.writes.length,1);
 const command=ui.writes[0].value;assert.equal(command.type,'share-insight-reply');assert.equal(command.topicId,ui.ids.topicId);
 assert.equal(command.originSourceId,null);assert.deepEqual(command.semanticPublication,review.semanticPublication);
 assert.equal(JSON.stringify(command).includes('New unsent draft'),false);
 const after=ui.controller.currentState();for(const key of ['sourceId','topicId','discussion','draft','resolution'])assert.deepEqual(after[key],before[key]);
});

test('semantic generated publication cannot rebase edited bodies, expired proof, other evidence Source or actor',async t=>{
 for(const change of [r=>{r.semanticPublication.rootDigest=sha('changed');},r=>{r.semanticPublication.semanticTarget.targetRevision++;},
   r=>{r.semanticPublication.expiresAt=1;},r=>{r.semanticPublication.evidence.sourceId='reserved-example-org';},r=>{r.actorId='demo-sam';}]){
  const ui=await harness();t.after(()=>ui.controller.dispose());const review=semanticReview(ui);change(review);
  assert.equal(await ui.controller.shareInsight(review),false);assert.equal(ui.writes.length,0);
 }
});
test('semantic exact reader drops a delayed response after actor revocation without exposing target bodies',async t=>{
 let release;const ui=await harness({semanticTarget:async(_request,_options,dto)=>{await new Promise(resolve=>{release=resolve;});return dto();}});
 t.after(()=>ui.controller.dispose());const pending=ui.controller.readSemanticFollowupTarget(ui.ids);await turn();
 ui.setActor('demo-sam');release();assert.equal(await pending,null);assert.equal(ui.controller.currentState().semanticSelection,null);
});

test('semantic generated ambiguous append retains one packet and requires explicit acknowledgement without automatic reissue',async t=>{
 const ui=await harness({command:async()=>{throw new Error('network');}});t.after(()=>ui.controller.dispose());
 const review=semanticReview(ui);assert.equal(await ui.controller.shareInsight(review),false);
 assert.equal(ui.controller.currentState().semanticWritePending,true);assert.equal(await ui.controller.shareInsight(review),false);
 assert.equal(ui.writes.length,1);assert.equal(ui.controller.acknowledgeSemanticWriteUncertainty('ACKNOWLEDGE POSSIBLE SEMANTIC REPLY'),true);
 assert.equal(ui.writes.length,1);assert.equal(ui.controller.currentState().needsFreshRead,true);
});
