// Closed real-provider research probe through normal authenticated Murmingle
// HTTP. ONE new own private conversation, removed only if all messages still
// belong to this invocation. No public posts, canonical writes or AI secrets.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {open,lstat,realpath} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import {createLocalServiceClient} from '../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {createLocalAiClient} from '../../../spikes/topic-resolution/browser/core/local-ai-client.js';
import {createAccountClient} from '../../../spikes/topic-resolution/browser/core/account-client.js';
import {buildInsightContext} from '../../../spikes/topic-resolution/browser/core/insight-context.js';
import {chooseListedModel} from './run-live-insight-qa.js';
import {capturePairedRecipeForTest} from './run-paired-live-ai-reply.js';
import {fetchPublicResource} from '../src/crawler/public-fetch.js';
import {buildRelationQuestion,parseRelationProposal,SYNTHETIC_RELATION_CANDIDATES,SYNTHETIC_RELATION_EXPECTED} from '../experiments/automatic-topic-discovery-v4/semantic-relation.js';
const URL_FIXED='https://www.leukerecepten.nl/recepten/kapsalon-maken/';
export const SYNTHETIC_RELATION_QUESTION=buildRelationQuestion(SYNTHETIC_RELATION_CANDIDATES);
const sha=s=>createHash('sha256').update(s).digest('hex');
const need=(v,code='invalid-response')=>{if(!v)throw Object.assign(new Error('Synthetic relation probe unavailable'),{code});};
const CODES=new Set(['unavailable','invalid-response','busy','timeout','authentication-required','account-not-named','context-unavailable',
 'stale-context','provider-unavailable','rate-limit','cancelled','cleanup-incomplete']);
async function readPairing(){
 async function fixed(name,max){const absolute=fileURLToPath(new URL('../data/'+name,import.meta.url)),before=await lstat(absolute);
  need(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=max&&await realpath(absolute)===absolute,'authentication-required');
  const fd=await open(absolute,'r');let bytes;
  try{const s=await fd.stat();need(s.dev===before.dev&&s.ino===before.ino&&s.size===before.size);bytes=Buffer.alloc(before.size+1);const got=await fd.read(bytes,0,bytes.length,0);
   const end=await fd.stat();need(got.bytesRead===before.size&&end.size===before.size&&end.mtimeMs===before.mtimeMs);return new TextDecoder('utf8',{fatal:true}).decode(bytes.subarray(0,got.bytesRead));
  }finally{bytes?.fill(0);await fd.close();}}
 const token=(await fixed('pairing-recovery/pairing-token.txt',512)).trim(),{origin}=JSON.parse(await fixed('pairing.json',16384));
 need(/^[A-Za-z0-9._-]{32,256}$/u.test(token)&&typeof origin==='string'&&/^chrome-extension:\/\/[a-p]{32}$/u.test(origin),'authentication-required');return {token,origin};
}
function clients(pairing){let session=null,actor=null,requests=0;
 const fetchImpl=(url,options)=>{const target=new URL(url);need(target.origin==='http://127.0.0.1:4174'&&target.pathname.startsWith('/v1/')&&
  !target.search&&!target.hash&&!target.username&&!target.password&&++requests<=48);
  need(!Object.keys(options.headers).some(k=>['origin','x-demo-actor'].includes(k.toLowerCase())));
  return fetch(url,{...options,headers:{...options.headers,Origin:pairing.origin}});};
 const auth={fetchImpl,getToken:()=>pairing.token,getAccountToken:id=>id===actor?session:null};
 return {account:createAccountClient({fetchImpl,getPairingToken:()=>pairing.token}),local:createLocalServiceClient(auth),ai:createLocalAiClient(auth),
  bind(id,token){actor=id;session=token;},clear(){actor=null;session=null;}};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const REAL={readPairing,clients,now:Date.now,sleep,id:randomUUID,
 // Reuse the original fixed-URL policy/parser with REAL bounded public HTTP.
 // The trusted test seam itself confers no provenance or observation authority.
 capture:deadline=>capturePairedRecipeForTest({fetchPublic:fetchPublicResource,now:Date.now,sleep,deadline})};
async function run(p,fakePorts){
 const started=p.now(),deadline=started+120000,phases=[];let stage='pairing',failure=null,io=null,session=null,actor=null,sourceId=null,topicId=null,
  conversationId=null,messageId=null,model=null,proposal=null,evidence=null,providerStarted=false,providerCompleted=false,answerHash=null;
 const counts={privateConversationsCreated:0,providerStarts:0,resultReads:0,publicPosts:0,correct:0,total:8};
 const cleanup={conversationRemoved:false,sessionLoggedOut:false,foreignOrAdditionalMessagesPreventedRemoval:false};
 const mark=name=>{stage=name;phases.push({stage:name,elapsedMs:p.now()-started});};
 const work=async fn=>{need(p.now()<deadline,'timeout');const value=await fn();need(p.now()<deadline,'timeout');return value;};
 const selection=()=>work(()=>io.local.selection({sourceId,topicId}));
 const read=()=>io.local.privateConversation('read',{conversationId,after:null,limit:3},actor);
 const ownEnvelope=value=>value?.conversation?.id===conversationId&&value.conversation.visibility==='private'&&value.conversation.sourceId===sourceId&&
  value.conversation.sourceUrl===URL_FIXED&&value.next===null&&Array.isArray(value.messages);
 const ownHuman=value=>{const human=value.messages.find(m=>m.id===messageId);need(human&&human.actorType==='human'&&human.replyToId===null&&human.body===SYNTHETIC_RELATION_QUESTION);return human;};
 try{
  io=p.clients(await work(()=>p.readPairing()));mark('provider-status');const status=await work(()=>io.ai.status());need(status.connected&&status.planEnabled&&!status.pending,'unavailable');
  mark('fixed-source');const found=await work(()=>io.local.urlSelection({url:URL_FIXED})),sources=found.catalog.sources.filter(s=>s.url===URL_FIXED&&s.provenance==='owner-local-page-embedding/v1');
  need(sources.length===1);sourceId=sources[0].id;topicId=sources[0].topicId;
  mark('fresh-public-evidence');const captured=await work(()=>p.capture(deadline));need(captured?.url===URL_FIXED&&typeof captured.text==='string'&&captured.text.length>=200&&captured.text.length<=4096&&
   sha(captured.text)===captured.bodySha256&&/^[a-f0-9]{64}$/u.test(captured.rightsEvidenceSha256));
  evidence={bodySha256:captured.bodySha256,rightsEvidenceSha256:captured.rightsEvidenceSha256,characters:captured.text.length};
  mark('account-session');const signed=await work(async()=>{const value=await io.account.signInChatGPT();
   // Retain our new capability before checking the outer deadline so a late
   // successful response still reaches logout in finally.
   session=value.session.accessToken;actor='account-'+value.account.id;io.bind(actor,session);return value;});
  need(signed.account.state==='active'&&typeof signed.account.username==='string'&&signed.account.username.length>=3,'account-not-named');
  const account=await work(()=>io.account.me(session));need('account-'+account.id===actor&&account.state==='active','authentication-required');
  need(await work(()=>io.ai.resumable(actor))===null,'busy');mark('model-list');model=chooseListedModel(await work(()=>io.ai.models()),'auto');
  mark('private-create');const created=await work(async()=>{const value=await io.local.privateConversation('create',{operationId:p.id(),body:SYNTHETIC_RELATION_QUESTION,sourceId,sourceUrl:URL_FIXED},actor);
   need(value?.replayed===false&&typeof value.conversationId==='string'&&typeof value.messageId==='string');
   conversationId=value.conversationId;messageId=value.messageId;counts.privateConversationsCreated=1;return value;});
  const initial=await work(read);need(ownEnvelope(initial)&&initial.messages.length===1);ownHuman(initial);
  const current=await selection(),context=buildInsightContext({...current,related:null,sourceId,topicId,includeDiscussion:false,sourceLimit:6});
  mark('provider-start');providerStarted=true;counts.providerStarts++;
  await work(()=>io.local.privateConversation('generate',{conversationId,messageId,expectedRevision:created.revision,
   generation:{model,context,articleText:captured.text,allowWebResearch:false,expected:current.catalog.version}},actor));
  mark('provider-result');let completed=null;
  for(let i=0;i<24;i++){
   counts.resultReads++;const value=await work(read);need(ownEnvelope(value));const human=ownHuman(value);
   if(human.generation?.state==='failed')throw Object.assign(new Error('Provider failed'),{code:CODES.has(human.generation.error)?human.generation.error:'provider-unavailable'});
   if(human.generation?.state==='completed'){
    const answer=value.messages.find(m=>m.id===human.generation.answerId);need(value.messages.length===2&&answer?.actorType==='agent'&&answer.replyToId===messageId&&
     answer.insight?.operatorId===actor&&answer.insight?.model===model&&answer.citations.length===0);
    completed=answer;providerCompleted=true;break;
   }
   need(value.messages.length===1&&human.generation?.state==='running');await work(()=>p.sleep(1500));
  }
  need(completed,'timeout');answerHash=sha(completed.body);mark('relation-validation');proposal=parseRelationProposal(SYNTHETIC_RELATION_CANDIDATES,completed.body);
  counts.correct=Object.entries(SYNTHETIC_RELATION_EXPECTED).filter(([id,want])=>proposal.relations[id]===want).length;
 }catch(error){failure={stage,code:CODES.has(error?.code)?error.code:'invalid-response'};}
 finally{
  if(io&&session){
   if(conversationId&&messageId)try{
    const current=await read();need(ownEnvelope(current));const human=ownHuman(current);need(current.messages.length===1||current.messages.length===2);
    if(current.messages.length===2){const answer=current.messages.find(m=>m.id!==messageId);need(providerStarted&&human.generation?.state==='completed'&&human.generation.answerId===answer?.id&&
     answer.actorType==='agent'&&answer.replyToId===messageId&&answer.insight?.operatorId===actor&&answer.insight?.model===model);
     if(answerHash!==null)need(sha(answer.body)===answerHash);
    }
    const removed=await io.local.privateConversation('delete',{conversationId},actor);need(removed?.deleted===true);cleanup.conversationRemoved=true;
   }catch{cleanup.foreignOrAdditionalMessagesPreventedRemoval=true;failure??={stage:'private-cleanup',code:'cleanup-incomplete'};}
   try{await io.account.logout(session);cleanup.sessionLoggedOut=true;}catch{failure??={stage:'session-cleanup',code:'cleanup-incomplete'};}
  }
  io?.clear();session=null;actor=null;
 }
 return {schema:'synthetic-topic-relation-provider-probe/v1',status:failure?'failed':counts.correct===counts.total?'passed':'quality-failed',failure,model,counts,
  relations:proposal?.relations??null,proposedEdges:proposal?.edges??null,answerSha256:answerHash,evidence,cleanup,phases,providerCompleted,elapsedMs:p.now()-started,
  scope:{fakePorts,syntheticCasesOnly:true,storedBrowsingCohortUsed:false,normalServiceHttp:!fakePorts,publicCanonicalWrites:false,privateConversationTemporary:true,
   privateOperationReceiptMetadataMayRemain:true,providerRequestAttempted:!fakePorts&&providerStarted,webResearch:false,rawProviderCredentialsRead:false,
   automaticBackgroundProviderEnabled:false,topicPublication:false,representativeMatchingQuality:false,liveMatcherChanged:false}};
}
let actualUsed=false;
export async function runSyntheticTopicRelationProbe(){need(arguments.length===0&&!actualUsed);actualUsed=true;return run(REAL,false);}
export async function runSyntheticTopicRelationProbeForTest(p){need(arguments.length===1&&p&&Object.keys(p).sort().join(',')===Object.keys(REAL).sort().join(',')&&Object.values(p).every(v=>typeof v==='function'));return run(p,true);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--run-synthetic-private-probe')process.exitCode=2;
 else runSyntheticTopicRelationProbe().then(result=>{process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='passed')process.exitCode=1;},()=>{process.stderr.write('Synthetic topic relation probe unavailable.\n');process.exitCode=1;});
}
