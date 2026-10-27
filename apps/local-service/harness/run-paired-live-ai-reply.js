// Explicit --run only: uses the already-running local service. Never restores,
// reconnects or reads provider credentials. No IO on import.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {open,lstat,realpath} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {types} from 'node:util';
import {createAccountClient} from '../../../spikes/topic-resolution/browser/core/account-client.js';
import {createLocalServiceClient} from '../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {createLocalAiClient} from '../../../spikes/topic-resolution/browser/core/local-ai-client.js';
import {buildInsightContext} from '../../../spikes/topic-resolution/browser/core/insight-context.js';
import {formatInsightCitations} from '../../../spikes/topic-resolution/browser/core/insight-citations.js';
import {chooseListedModel} from './run-live-insight-qa.js';
import {fetchPublicResource,PublicFetchError} from '../src/crawler/public-fetch.js';
import {parseRobotsTxt,evaluateRobots,tdmRepUrlFor,parseTdmRepJson,matchTdmRep,parseTdmReservation,parseXRobotsDirectives} from '../src/crawler/robots.js';
import {captureStaticHtml} from '../src/crawler/static-capture.js';

export const PAIRED_REPLY_QUESTION='[Murmingle integration test] @AI, was ist eine Kapsalon? Bitte antworte in einem kurzen Satz auf Deutsch.';
const URL_FIXED='https://www.leukerecepten.nl/recepten/kapsalon-maken/';
const DATA=fileURLToPath(new URL('../data/',import.meta.url));
const fail=code=>Object.assign(new Error('Paired live reply probe unavailable'),{code});
const need=(value,code='invalid-response')=>{if(!value)throw fail(code);};
const CODES=new Set(['busy','timeout','invalid-response','unavailable','pairing-required','authentication-required','forbidden','conflict','not-found','unauthorized','rate-limit','model-unavailable','provider-unavailable','cancelled','unsupported-capability','account-not-named','cleanup-failed','public-policy-unavailable','public-policy-denied','public-document-unavailable']);
const DETAILS=new Set(['response-no-final','response-incomplete','response-refusal','response-empty-output','response-web-citation','response-excerpt-citation','response-failed','response-http-400']);
function ownCode(error,key,allowed){if(!error||typeof error!=='object'||types.isProxy(error))return null;const d=Object.getOwnPropertyDescriptor(error,key);return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&allowed.has(d.value)?d.value:null;}
function freeze(v){if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;}
async function fixedRead(name,max){
 const filename=path.join(DATA,...name.split('/')),before=await lstat(filename);need(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=max&&await realpath(filename)===filename);
 const file=await open(filename,'r');try{const original=await file.stat();need(original.dev===before.dev&&original.ino===before.ino&&original.size===before.size);const raw=Buffer.alloc(max+1);try{
  let n=0;while(n<raw.length){const step=await file.read(raw,n,raw.length-n,null);if(!step.bytesRead)break;n+=step.bytesRead;}
  const after=await file.stat(),last=await lstat(filename);need(n===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&last.ino===before.ino&&last.dev===before.dev&&!last.isSymbolicLink());
  return new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(0,n));
 }finally{raw.fill(0);}}finally{await file.close();}
}
async function readPairing(){const text=await fixedRead('pairing-recovery/pairing-token.txt',512),config=JSON.parse(await fixedRead('pairing.json',16384));const token=text.trim(),origin=config.origin;
 need(/^[A-Za-z0-9._-]{32,256}$/u.test(token)&&typeof origin==='string'&&/^chrome-extension:\/\/[a-p]{32}$/u.test(origin),'pairing-required');return {token,origin};}
function clients(pairing){let session=null,actorId=null;
 const fetchImpl=(url,options)=>{const target=new URL(url);need(target.origin==='http://127.0.0.1:4174'&&target.pathname.startsWith('/v1/')&&!target.search&&!target.hash&&!target.username&&!target.password);
  need(!Object.keys(options.headers).some(key=>['origin','x-demo-actor'].includes(key.toLowerCase())));return fetch(url,{...options,headers:{...options.headers,Origin:pairing.origin}});};
 const auth={fetchImpl,getToken:()=>pairing.token,getAccountToken:id=>id===actorId?session:null};
 return {account:createAccountClient({fetchImpl,getPairingToken:()=>pairing.token}),local:createLocalServiceClient(auth),ai:createLocalAiClient(auth),
  bind(id,token){actorId=id;session=token;},clear(){session=null;actorId=null;}};
}
const sha=value=>createHash('sha256').update(value).digest('hex');
// One literal public URL, no redirects/discovery/Source writes or ML. Normal
// public fetch retains its DNS/TLS/byte limits; parser caps are unchanged.
async function captureRecipe({fetchPublic,now,sleep,deadline}){
 const origin=new URL(URL_FIXED).origin;let requests=0,last=null,lastClock=now();
 const check=()=>{const time=now();need(Number.isFinite(time)&&time>=lastClock&&time<deadline,'timeout');lastClock=time;return time;};
 const wipe=response=>{if(Buffer.isBuffer(response?.body))response.body.fill(0);};
 async function request(url,resourceKind,delay=0){let time=check();const wait=last===null?0:Math.max(0,last+Math.max(5000,delay)-time);need(time+wait<deadline,'timeout');if(wait){await sleep(wait);time=check();need(time>=last+Math.max(5000,delay),'timeout');}need(requests<3,'public-policy-unavailable');requests++;last=time;
  let response;try{response=await fetchPublic(url,{resourceKind,timeoutMs:Math.min(15000,Math.floor(deadline-time))});check();return response;}catch(error){wipe(response);throw error;}}
 async function policy(url,kind,delay){let response;try{response=await request(url,kind,delay);need(response?.kind==='content'&&response.url===url&&response.finalUrl===url&&typeof response.text==='string','public-policy-unavailable');return response.text;}
  catch(error){if(error&&typeof error==='object'&&!types.isProxy(error)&&error instanceof PublicFetchError){const s=Object.getOwnPropertyDescriptor(error,'status'),c=Object.getOwnPropertyDescriptor(error,'code');if(s&&Object.hasOwn(s,'value')&&[404,410].includes(s.value)&&c&&Object.hasOwn(c,'value')&&c.value==='http-status')return null;}throw fail(ownCode(error,'code',CODES)??'public-policy-unavailable');}finally{wipe(response);}}
 const robotsText=await policy(origin+'/robots.txt','robots',0);let robots;try{robots=parseRobotsTxt(robotsText??'');}catch{throw fail('public-policy-unavailable');}
 const tdmUrl=tdmRepUrlFor(origin),tdmAccess=evaluateRobots(robots,tdmUrl);need(tdmAccess.allowed,'public-policy-denied');
 const tdmText=await policy(tdmUrl,'tdmrep',tdmAccess.crawlDelayMs);let tdm=null;try{if(tdmText!==null)tdm=parseTdmRepJson(tdmText);}catch{throw fail('public-policy-unavailable');}
 const pageAccess=evaluateRobots(robots,URL_FIXED);need(pageAccess.allowed,'public-policy-denied');let response;
 try{
  response=await request(URL_FIXED,'page',pageAccess.crawlDelayMs);
  need(response?.kind==='content'&&response.url===URL_FIXED&&response.finalUrl===URL_FIXED&&['text/html','application/xhtml+xml'].includes(response.mimeType)&&typeof response.text==='string'&&Buffer.isBuffer(response.body)&&response.headers,'public-document-unavailable');
  need(!parseXRobotsDirectives(response.headers.xRobotsTag).blocked,'public-policy-denied');
  let reservation=tdm===null?null:matchTdmRep(tdm,URL_FIXED).reservation;
  if(response.headers.tdmReservation!==null){const value=parseTdmReservation(response.headers.tdmReservation);need(value!==null,'public-policy-denied');reservation=value;}
  let captured;try{captured=captureStaticHtml(response.text,URL_FIXED);}catch{throw fail('public-document-unavailable');}
  need(!captured.directives.tdmReservationInvalid,'public-policy-denied');if(captured.directives.tdmReservation!==null)reservation=captured.directives.tdmReservation;
  need(reservation!==1&&!captured.directives.noindex,'public-policy-denied');need(captured.eligible&&captured.contentHash!==null&&captured.text.length<=4096,'public-document-unavailable');check();
  return {text:captured.text,url:URL_FIXED,characters:captured.text.length,bodySha256:captured.contentHash,requests,rightsEvidenceSha256:sha(JSON.stringify({robots:sha(robotsText??''),tdm:tdmText===null?null:sha(tdmText),headers:{xRobotsTag:response.headers.xRobotsTag,tdmReservation:response.headers.tdmReservation,tdmPolicy:response.headers.tdmPolicy},document:captured.directives,reservation}))};
 }finally{wipe(response);}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const REAL={readPairing,clients,capture:deadline=>captureRecipe({fetchPublic:fetchPublicResource,now:Date.now,sleep,deadline}),now:()=>Date.now(),sleep,id:()=>randomUUID()};
async function run(p,testComposition){
 const started=p.now(),deadline=started+180000;let phase='pairing',failure=null,io=null,session=null,actor=null,rootId=null,sourceId=null,topicId=null,operationId=null,attemptedJob=false,consumed=false,model=null,body=null;
 let publicationAttempted=false,publishedReplyId=null,publishedBody=null,evidence=null;
 const cleanup={cancelAttempted:false,jobCancelled:false,rootWithdrawn:false,sessionLoggedOut:false};
 const counts={providerStarts:0,resultReads:0,rootsCreated:0,repliesStored:0},language={germanRequested:true,germanMarkers:false,shortAnswer:false};
 const phases=[];
 const stage=name=>{phase=name;const now=p.now();phases.push({stage:name,elapsedMs:Math.max(0,now-started)});};
 const check=()=>need(p.now()<deadline,'timeout');
 async function work(fn){check();const result=await fn();check();return result;}
 async function selection(){return work(()=>io.local.selection({sourceId,topicId}));}
 async function verifyAccount(){const current=await work(()=>io.account.me(session));need(current.state==='active'&&current.username!==null&&'account-'+current.id===actor,'authentication-required');}
 try{
  const pairing=await work(()=>p.readPairing());io=p.clients(pairing);
  stage('provider-status');const status=await work(()=>io.ai.status());need(status.connected&&status.planEnabled,'unavailable');need(status.pending===false,'busy');
  stage('canonical-source');const found=await work(()=>io.local.urlSelection({url:URL_FIXED}));
  const sources=found.catalog.sources.filter(s=>s.url===URL_FIXED&&s.provenance==='owner-local-page-embedding/v1');need(sources.length===1&&sources[0].topicId);sourceId=sources[0].id;topicId=sources[0].topicId;
  let current=await selection();
  stage('public-static-evidence');const captured=await work(()=>p.capture(deadline));
  need(captured?.url===URL_FIXED&&typeof captured.text==='string'&&captured.text.length>=200&&captured.text.length<=4096&&captured.characters===captured.text.length&&captured.bodySha256===sha(captured.text)&&/^[a-f0-9]{64}$/u.test(captured.rightsEvidenceSha256)&&Number.isInteger(captured.requests)&&captured.requests>=1&&captured.requests<=3,'public-document-unavailable');
  let article=captured.text;evidence={characters:captured.characters,bodySha256:captured.bodySha256,rightsEvidenceSha256:captured.rightsEvidenceSha256,requests:captured.requests};
  stage('account-session');const signed=await work(async()=>{const value=await io.account.signInChatGPT();session=value.session.accessToken;actor='account-'+value.account.id;io.bind(actor,session);return value;});
  need(signed.account.state==='active'&&typeof signed.account.username==='string'&&signed.account.username.length>=3,'account-not-named');await verifyAccount();
  stage('existing-job');need(await work(()=>io.ai.resumable(actor))===null,'busy');
  stage('listed-model');model=chooseListedModel(await work(()=>io.ai.models()),'auto');
  current=await selection();await verifyAccount();
  stage('question-create');await work(async()=>{const created=await io.local.command(current.catalog.version,{type:'create-root',topicId,body:PAIRED_REPLY_QUESTION,originSourceId:sourceId},actor);rootId=created.result.contributionId;counts.rootsCreated=1;});
  current=await selection();const root=current.discussion.roots.find(r=>r.id===rootId);need(root?.state==='visible'&&root.body===PAIRED_REPLY_QUESTION&&root.authorId===actor);
  const context=buildInsightContext({...current,related:null,sourceId,topicId,includeDiscussion:false,sourceLimit:6});await verifyAccount();
  stage('provider-start');operationId=p.id();attemptedJob=true;counts.providerStarts++;
  await work(()=>io.ai.start({operationId,model,context,articleText:article,allowWebResearch:false,includeRelatedSources:false,expected:current.catalog.version,followupQuestionId:rootId},actor));article=null;
  stage('provider-result');const pollDeadline=Math.min(deadline,p.now()+120000);let outcome=null;
  for(let i=0;i<60;i++){
   need(p.now()<pollDeadline,'timeout');counts.resultReads++;const result=await work(()=>io.ai.result(operationId,actor));need(result.operationId===operationId);
   if(result.state==='failed'){const error=fail(CODES.has(result.error)?result.error:'provider-unavailable');if(DETAILS.has(result.detail))error.detail=result.detail;throw error;}
   if(result.state==='completed'){outcome=result;break;}need(result.state==='running');await work(()=>p.sleep(Math.min(2000,Math.max(0,pollDeadline-p.now()))));
  }
  need(outcome,'timeout');body=formatInsightCitations(outcome.result.body,outcome.result.citations);need(outcome.result.model===model);
  language.germanMarkers=/\b(?:ist|ein|eine|und|das|der|die|Gericht|Pommes|Fleisch)\b/u.test(outcome.result.body);language.shortAnswer=outcome.result.body.split(/\s+/u).length<=160;
  stage('publication');await verifyAccount();current=await selection();
  publicationAttempted=true;
  const published=await work(async()=>{const result=await io.local.command(current.catalog.version,{type:'share-insight-reply',topicId,discussionId:current.discussion.discussionId,rootId,replyToId:rootId,body,operationId,originSourceId:sourceId,
   ...(outcome.semanticPublication?{semanticPublication:outcome.semanticPublication}:{})},actor);publishedReplyId=result.result.contributionId;publishedBody=body;consumed=true;return result;});
  stage('stored-read');current=await selection();const stored=current.discussion.roots.find(r=>r.id===rootId),reply=stored?.replies.find(r=>r.id===published.result.contributionId);
  need(stored?.body===PAIRED_REPLY_QUESTION&&reply?.rootId===rootId&&reply.replyToId===rootId&&reply.state==='visible'&&reply.actorType==='agent'&&reply.body===body);counts.repliesStored=1;
 }catch(error){const code=ownCode(error,'code',CODES)??'unavailable';failure={stage:phase,code:phase==='provider-start'&&code==='conflict'?'busy':code,detail:ownCode(error,'detail',DETAILS)};}
 finally{
  // Only capabilities issued/IDs created by THIS invocation. No cleanup retry.
  if(io&&session){
   if(attemptedJob&&!consumed){cleanup.cancelAttempted=true;try{await io.ai.cancel(operationId,actor);cleanup.jobCancelled=true;}catch{/* Unknown job/authorization remains finite. */}}
   if(rootId)try{const fresh=await io.local.selection({sourceId,topicId});const own=fresh.discussion.roots.find(r=>r.id===rootId);
    need(own?.state==='visible'&&own.edited===false&&own.body===PAIRED_REPLY_QUESTION&&own.authorId===actor&&Array.isArray(own.replies),'conflict');
    need(!publicationAttempted||publishedReplyId!==null,'conflict');
    if(publishedReplyId===null)need(own.replies.length===0,'conflict');
    else need(own.replies.length===1&&own.replies.every(r=>r.id===publishedReplyId&&r.state==='visible'&&r.edited===false&&r.actorType==='agent'&&r.body===publishedBody&&r.rootId===rootId&&r.replyToId===rootId&&r.origin?.sourceId===sourceId),'conflict');
    await io.local.command(fresh.catalog.version,{type:'withdraw',contributionId:rootId},actor);cleanup.rootWithdrawn=true;
   }catch{failure??={stage:'root-cleanup',code:'cleanup-failed',detail:null};}
   try{await io.account.logout(session);cleanup.sessionLoggedOut=true;}catch{failure??={stage:'session-cleanup',code:'cleanup-failed',detail:null};}
  }
  io?.clear();session=null;actor=null;body=null;publishedBody=null;
 }
 return freeze({schema:'paired-live-ai-reply-proof/v1',status:failure?'failed':'passed',failure,model,counts,language,evidence,cleanup,phases,elapsedMs:Math.max(0,p.now()-started),testComposition,
  scope:{normalRunningService:!testComposition,normalAccountSession:!testComposition,evidenceBasis:'fresh-public-static-same-url-context',freshCapture:!testComposition,sourceOriginalObservationMatch:false,nativeDocumentAttestation:false,browser:false,providerRequestAttempted:!testComposition&&counts.providerStarts===1,qualityAcceptance:false,otherPostsModified:false}});
}
let actualUsed=false;
export async function runPairedLiveAiReply(){need(arguments.length===0&&!actualUsed);actualUsed=true;return run(REAL,false);}
export async function runPairedLiveAiReplyForTest(ports){need(arguments.length===1&&ports&&typeof ports==='object'&&!types.isProxy(ports)&&Object.keys(ports).sort().join()===Object.keys(REAL).sort().join()&&Object.values(ports).every(v=>typeof v==='function'));return run(ports,true);}
// Fixed-URL production policy/parser with trusted fake transport only.
export async function capturePairedRecipeForTest(ports){need(arguments.length===1);return captureRecipe(ports);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==1||args[0]!=='--run'){process.stdout.write(JSON.stringify({schema:'paired-live-ai-reply-proof/v1',status:'refused',code:'explicit-run-required'})+'\n');process.exitCode=1;}
 else runPairedLiveAiReply().then(proof=>{process.stdout.write(JSON.stringify(proof)+'\n');if(proof.status!=='passed')process.exitCode=1;},()=>{process.stdout.write(JSON.stringify({schema:'paired-live-ai-reply-proof/v1',status:'failed',code:'unavailable'})+'\n');process.exitCode=1;});
}
