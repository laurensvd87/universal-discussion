// Fresh fixed public probes only. Import does not fetch, encode, or open state.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {fetchPublicResource,PublicFetchError} from '../src/crawler/public-fetch.js';
import {parseRobotsTxt,evaluateRobots,tdmRepUrlFor,parseTdmRepJson,matchTdmRep,parseTdmReservation,parseXRobotsDirectives} from '../src/crawler/robots.js';
import {captureStaticHtml,diagnoseStaticHtml} from '../src/crawler/static-capture.js';
import {normalizeCrawlUrl} from '../src/crawler/url-policy.js';
import {PUBLIC_HIERARCHY_PROBES} from './hierarchy-public-probes.js';
import {RECIPE_CAL_PROBES,RECIPE_TEST_PROBES} from './hierarchy-recipe-corpus.js';
import {GTA_TRAIN_PROBES,GTA_CAL_PROBES,GTA_TEST_PROBES} from './hierarchy-gta-corpus.js';
import childCorpus from './hierarchy-child-corpus.json' with {type:'json'};
import diversityCorpus from './hierarchy-child-diversity-corpus.json' with {type:'json'};
import {ADDITIONAL_CHILD_TEST_PROBES} from './hierarchy-child-additional-test-corpus.js';
import {AUTOMATIC_TOPIC_DEVELOPMENT,AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT,AUTOMATIC_TOPIC_METADATA_DEVELOPMENT} from './automatic-topic-development-corpus.js';
import {AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT} from './automatic-topic-comparison-corpus.js';
import {GENERAL_WEB_SUBJECT_PROBES,GENERAL_WEB_CAPTURE_REPAIR_PROBES} from './general-web-subject-corpus.js';

const ORIGIN='https://en.wikipedia.org',MAX_REQUESTS=34,MAX_DURATION=240000,MIN_DELAY=5000;
// Closed development TRAIN/CAL batch. TEST IDs/URLs are deliberately absent.
const CHILD_TRAIN_CAL=Object.freeze([
 ['child-train-01','https://savethekoala.com/about-koalas/koalas-diet-digestion/'],
 ['child-train-02','https://savethekoala.com/about-koalas/distribution/'],
 ['child-cal-01','https://www.qld.gov.au/environment/plants-animals/animals/living-with/koalas/koala-information/koala-facts'],
 ['child-cal-02','https://www.qld.gov.au/environment/plants-animals/animals/living-with/koalas/helping-koalas-in-the-community/koala-breeding-season'],
 ['child-cal-03','https://www.qld.gov.au/environment/plants-animals/animals/living-with/koalas/koala-rescue-and-rehabilitation/sick%2C-injured%2C-orphaned-or-dead-koalas'],
 ['child-cal-04','https://www.qld.gov.au/environment/plants-animals/animals/discovering-wildlife/possum/common-brushtail-possum'],
 ['child-cal-05','https://github.com/oklai/koala'],
 ['child-cal-06','https://au-koala.gorgias.help/en-US/What-does-the-Koala-Warranty-cover-and-for-how-long-8100194'],
 ['child-cal-07','https://www.worldothello.org/about/about-othello/othello-rules/official-rules/english'],
 ['child-cal-08','https://www.qld.gov.au/environment/plants-animals/animals/discovering-wildlife/platypus'],
 ['child-cal-09','https://www.qld.gov.au/environment/plants-animals/animals/discovering-wildlife/possum/lemuroid-ringtail-possum'],
].map(([id,url])=>Object.freeze({id,url})));
const CHILD_DIAGNOSIS=Object.freeze([CHILD_TRAIN_CAL[0],CHILD_TRAIN_CAL[2]]);
// New observations after the unused-attribute parser repair. Original failed
// observations are retained; this collector cannot access TRAIN or TEST.
const CHILD_CAL_REPAIR=Object.freeze(CHILD_TRAIN_CAL.filter(p=>['child-cal-01','child-cal-02','child-cal-03','child-cal-04','child-cal-08','child-cal-09'].includes(p.id)));
const CHILD_TEST=Object.freeze(childCorpus.freshCandidates.filter(p=>p.split==='test').map(({id,url})=>Object.freeze({id,url})));
const KOALA_TRAIN_SUPPLEMENT=Object.freeze([Object.freeze({id:'koala-supplement-train-01',url:'https://www.wildlife.vic.gov.au/our-wildlife/koalas'})]);
const KOALA_ADDITIONAL_TRAIN=Object.freeze([
 {id:'koala-additional-train-02',url:'https://www.zoo-leipzig.de/tier/koala/'},
 {id:'koala-additional-train-03',url:'https://australiazoo.com.au/wildlife/our-animals/koalas/'},
].map(p=>Object.freeze(p)));
const CODES=new Set(['already-attempted','deadline','aborted','clock-invalid','request-limit','robots-denied','policy-unavailable',
 'page-unavailable','redirect-refused','response-invalid','header-restricted','tdm-ambiguous','tdm-reserved','document-invalid','document-restricted','insufficient-text','pace-unavailable',
 'origin-paused','rate-limited','access-denied','upstream-unavailable','fetch-unavailable']);
export const HIERARCHY_CHILD_DIAGNOSIS_REASONS=Object.freeze([...CODES,'eligible']);
const errors=new WeakMap();
const fail=code=>{const error=new Error('Fixed public capture unavailable');errors.set(error,code);throw error;};
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>sha(JSON.stringify(value));
function code(error){return error&&typeof error==='object'&&!types.isProxy(error)&&errors.has(error)?errors.get(error):null;}
function missing(error){
 if(!error||typeof error!=='object'||types.isProxy(error)||!(error instanceof PublicFetchError))return false;
 const c=Object.getOwnPropertyDescriptor(error,'code'),s=Object.getOwnPropertyDescriptor(error,'status');
 return c&&Object.hasOwn(c,'value')&&c.value==='http-status'&&s&&Object.hasOwn(s,'value')&&[404,410].includes(s.value);
}
function originFailure(error){
 if(!error||typeof error!=='object'||types.isProxy(error)||!(error instanceof PublicFetchError))return null;
 const c=Object.getOwnPropertyDescriptor(error,'code'),s=Object.getOwnPropertyDescriptor(error,'status');
 const value=c&&Object.hasOwn(c,'value')?c.value:null,status=s&&Object.hasOwn(s,'value')?s.value:null;
 if(value==='http-status'){
  if(status===429)return 'rate-limited';
  if(status===401||status===403)return 'access-denied';
  if(Number.isInteger(status)&&status>=500)return 'upstream-unavailable';
 }
 return ['timeout','network-failed','dns-failed','dns-invalid','dns-non-public','dns-pin','remote-address'].includes(value)?'fetch-unavailable':null;
}
function wipe(response){if(response&&Buffer.isBuffer(response.body))response.body.fill(0);}
function unavailable(probe,reason){if(!CODES.has(reason))reason='page-unavailable';return Object.freeze({id:probe.id,url:probe.url,status:'unavailable',reason});}
function defaultSleep(milliseconds,signal){
 return new Promise((resolve,reject)=>{
  let timer;
  const finish=()=>{signal?.removeEventListener?.('abort',abort);resolve();};
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener?.('abort',abort);reject(new Error('Capture aborted'));};
  timer=setTimeout(finish,milliseconds);signal?.addEventListener?.('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}

/** Dependencies are trusted seams. Actual collection uses the normal public
 * fetcher and its DNS/TLS/response limits; no URL/header/state override exists.
 */
export function createHierarchyPublicCapture(dependencies={}){return createCapture(dependencies,false);}
export function createHierarchyChildTrainCalCapture(dependencies={}){return createCapture(dependencies,true);}
export function createHierarchyChildDiagnosisCapture(dependencies={}){return createCapture(dependencies,true,true);}
export function createHierarchyChildCalibrationRepairCapture(dependencies={}){return createCapture(dependencies,true,false,true);}
export function createHierarchyChildEvaluationCapture(dependencies={}){return createCapture(dependencies,true,false,false,true);}
export function createHierarchyChildDiversityCapture(phase,dependencies={}){
 if(!['development','test'].includes(phase))throw new TypeError('Invalid fixed diversity phase');
 return createCapture(dependencies,true,false,false,false,phase);
}
export function createHierarchyKoalaTrainingSupplementCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,true);}
export function createHierarchyKoalaAdditionalTrainingCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'additional');}
export function createHierarchyChildAdditionalBoardTestCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'board-test');}
export function createAutomaticTopicDevelopmentCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'automatic-development');}
export function createAutomaticTopicAdditionalDevelopmentCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'automatic-development-additional');}
export function createAutomaticTopicMetadataDevelopmentCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'automatic-development-metadata');}
export function createAutomaticTopicComparisonDevelopmentCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'automatic-development-comparison');}
export function createGeneralWebSubjectScreenCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'general-web-subject-screen');}
export function createGeneralWebSubjectRepairCapture(dependencies={}){return createCapture(dependencies,true,false,false,false,null,'general-web-capture-repair');}
function createCapture({fetchPublic=fetchPublicResource,clock=Date.now,sleep=defaultSleep,signal,deadline},child,diagnosis=false,calibrationRepair=false,evaluation=false,diversityPhase=null,koalaSupplement=false){
 if(typeof fetchPublic!=='function'||typeof clock!=='function'||typeof sleep!=='function')throw new TypeError('Invalid fixed public capture dependencies');
 const start=clock();if(!Number.isFinite(start)||start<0)throw new TypeError('Invalid fixed public capture clock');
 deadline??=start+MAX_DURATION;
 if(!Number.isFinite(deadline)||deadline<=start||deadline>start+MAX_DURATION||signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'))throw new TypeError('Invalid fixed public capture deadline or signal');
 const supplemental=koalaSupplement?new Map([
  [true,{probes:KOALA_TRAIN_SUPPLEMENT,count:1,requests:3}],
  ['additional',{probes:KOALA_ADDITIONAL_TRAIN,count:2,requests:6}],
  ['board-test',{probes:ADDITIONAL_CHILD_TEST_PROBES,count:2,requests:4}],
  ['automatic-development',{probes:AUTOMATIC_TOPIC_DEVELOPMENT,count:6,requests:16}],
  ['automatic-development-additional',{probes:AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT,count:4,requests:12}],
  ['automatic-development-metadata',{probes:AUTOMATIC_TOPIC_METADATA_DEVELOPMENT,count:4,requests:12}],
  ['automatic-development-comparison',{probes:AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT,count:12,requests:28}],
  ['general-web-subject-screen',{probes:GENERAL_WEB_SUBJECT_PROBES,count:12,requests:34}],
  ['general-web-capture-repair',{probes:GENERAL_WEB_CAPTURE_REPAIR_PROBES,count:6,requests:10}],
 ]).get(koalaSupplement):null;
 if(koalaSupplement&&!supplemental)throw new TypeError('Invalid fixed probe source');
 const approved=supplemental?supplemental.probes:diversityPhase?diversityCorpus[diversityPhase]:child?(evaluation?CHILD_TEST:calibrationRepair?CHILD_CAL_REPAIR:diagnosis?CHILD_DIAGNOSIS:CHILD_TRAIN_CAL):[...PUBLIC_HIERARCHY_PROBES,...RECIPE_CAL_PROBES,...RECIPE_TEST_PROBES,...GTA_TRAIN_PROBES,...GTA_CAL_PROBES,...GTA_TEST_PROBES];
 const origins=new Set(child?approved.map(p=>new URL(p.url).origin):[ORIGIN]);
 const probes=new Map(approved.map(p=>[p.id,p]));
 if(probes.size!==(supplemental?supplemental.count:diversityPhase?(diversityPhase==='development'?7:11):child?(evaluation?14:calibrationRepair?6:diagnosis?2:11):64)||probes.size!==approved.length||[...probes.values()].some(p=>normalizeCrawlUrl(p.url,undefined,[])!==p.url||!origins.has(new URL(p.url).origin)))throw new TypeError('Invalid fixed probe source');
 const maxRequests=supplemental?supplemental.requests:calibrationRepair?8:diagnosis?6:MAX_REQUESTS;
 const unavailableRow=(probe,reason,parserDiagnostic=null)=>{
  if(!diagnosis)return unavailable(probe,reason);
  const observed=['document-invalid','insufficient-text'].includes(reason)?parserDiagnostic:null;
  return Object.freeze({id:probe.id,status:observed?'diagnosed':'unavailable',reason:CODES.has(reason)?reason:'page-unavailable',parserDiagnostic:observed});
 };
 const attempted=new Set(),policies=new Map(),stoppedOrigins=new Set();let chain=Promise.resolve(),requests=0,lastRequest=null,lastClock=start;
 function check(){if(signal?.aborted)fail('aborted');const now=clock();if(!Number.isFinite(now)||now<lastClock)fail('clock-invalid');lastClock=now;if(now>=deadline)fail('deadline');return now;}
 async function request(url,resourceKind,delay=0){
  if(!origins.has(new URL(url).origin))fail('response-invalid');
  let now=check();const earliest=lastRequest===null?now:lastRequest+Math.max(MIN_DELAY,delay),wait=Math.max(0,earliest-now);
  if(now+wait>=deadline)fail('deadline');
  if(wait){
   for(let waits=0;now<earliest&&waits<3;waits++){
    const remaining=earliest-now+(waits?1:0);if(now+remaining>=deadline)fail('deadline');
    try{await sleep(remaining,signal);}catch{check();fail('pace-unavailable');}now=check();
   }
   if(now<earliest)fail('pace-unavailable');
  }
  if(deadline-now<1)fail('deadline');if(requests>=maxRequests)fail('request-limit');requests++;lastRequest=now;
  let response;
  try{response=await fetchPublic(url,{resourceKind,signal,timeoutMs:Math.min(15000,Math.floor(deadline-now))});check();return response;}
  catch(error){wipe(response);throw error;}
 }
 async function policyText(url,kind,delay){
  let response;
  try{
   response=await request(url,kind,delay);
   if(!response||response.kind!=='content'||response.url!==url||response.finalUrl!==url||typeof response.text!=='string')fail('policy-unavailable');
   return response.text;
  }catch(error){if(missing(error))return null;fail(code(error)??'policy-unavailable');}
  finally{wipe(response);}
 }
 async function policy(origin){
  const robotsText=await policyText(origin+'/robots.txt','robots',0);
  let robots;try{robots=parseRobotsTxt(robotsText??'');}catch{fail('policy-unavailable');}
  const tdmUrl=tdmRepUrlFor(origin),allowed=evaluateRobots(robots,tdmUrl);
  if(!allowed.allowed)fail('policy-unavailable');
  const tdmText=await policyText(tdmUrl,'tdmrep',allowed.crawlDelayMs);
  let tdm=null;try{if(tdmText!==null)tdm=parseTdmRepJson(tdmText);}catch{fail('policy-unavailable');}
  return {robots,tdm,robotsSha256:sha(robotsText??''),tdmRepSha256:tdmText===null?null:sha(tdmText)};
 }
 async function collect(probe){
  let response,parserDiagnostic=null;const origin=new URL(probe.url).origin;
  try{
   check();if(stoppedOrigins.has(origin))fail('origin-paused');if(!policies.has(origin))policies.set(origin,policy(origin));const originPolicy=await policies.get(origin);check();
   const robots=evaluateRobots(originPolicy.robots,probe.url);if(!robots.allowed)fail('robots-denied');
   response=await request(probe.url,'page',robots.crawlDelayMs);
   if(response?.kind==='redirect')fail('redirect-refused');
   if(!response||response.kind!=='content'||response.url!==probe.url||response.finalUrl!==probe.url||
    !['text/html','application/xhtml+xml'].includes(response.mimeType)||typeof response.text!=='string'||!Buffer.isBuffer(response.body)||!response.headers)fail('response-invalid');
   let headerRobots;try{headerRobots=parseXRobotsDirectives(response.headers.xRobotsTag);}catch{fail('response-invalid');}
   if(headerRobots.blocked)fail('header-restricted');
   let reservation=originPolicy.tdm===null?null:matchTdmRep(originPolicy.tdm,probe.url).reservation;
   // Preserve the normal crawler's document/header/origin TDM precedence.
   if(response.headers.tdmReservation!==null){const header=parseTdmReservation(response.headers.tdmReservation);if(header===null)fail('tdm-ambiguous');reservation=header;}
   let capture;try{capture=captureStaticHtml(response.text,probe.url);}catch{
    if(diagnosis)try{parserDiagnostic=diagnoseStaticHtml(response.text,probe.url);}catch{/* Unknown parser exceptions expose no metadata. */}
    fail('document-invalid');
   }
   if(capture.directives.tdmReservationInvalid)fail('tdm-ambiguous');
   if(capture.directives.tdmReservation!==null)reservation=capture.directives.tdmReservation;
   if(reservation===1)fail('tdm-reserved');if(capture.directives.noindex)fail('document-restricted');
   if(diagnosis)parserDiagnostic=diagnoseStaticHtml(response.text,probe.url);
   if(!capture.eligible||capture.contentHash===null)fail('insufficient-text');check();
   if(diagnosis)return Object.freeze({id:probe.id,status:'diagnosed',reason:'eligible',parserDiagnostic});
   const responseSha256=sha(response.body),htmlTextSha256=sha(response.text),titleSha256=sha(capture.title),bodySha256=capture.contentHash;
   const rightsEvidenceHash=digest({robotsSha256:originPolicy.robotsSha256,tdmRepSha256:originPolicy.tdmRepSha256,
    headerPolicySha256:digest({xRobotsTag:response.headers.xRobotsTag,tdmReservation:response.headers.tdmReservation,tdmPolicy:response.headers.tdmPolicy}),
    documentDirectives:capture.directives,reservation});
   const sourceInputHash=digest({schema:'hierarchy-public-static-observation/v1',url:probe.url,extractorVersion:capture.extractorVersion,responseSha256,htmlTextSha256,titleSha256,bodySha256,rightsEvidenceHash});
   check();return Object.freeze({id:probe.id,url:probe.url,status:'available',title:capture.title,text:capture.text,
    extractorVersion:capture.extractorVersion,responseSha256,htmlTextSha256,titleSha256,bodySha256,rightsEvidenceHash,sourceInputHash,
    provenance:'fresh-public-crawler-static-html-paired-observation/v1',nativeObservation:false,productionValidated:false,assignmentAuthority:false});
  }catch(error){const stopped=originFailure(error);if(stopped)stoppedOrigins.add(origin);return unavailableRow(probe,code(error)??stopped??'page-unavailable',parserDiagnostic);}
  finally{wipe(response);}
 }
 function capture(probeId){
  if(arguments.length!==1||typeof probeId!=='string'||!probes.has(probeId))return Promise.reject(new TypeError('Invalid fixed public probe'));
  const probe=probes.get(probeId);if(attempted.has(probeId))return Promise.resolve(unavailableRow(probe,'already-attempted'));attempted.add(probeId);
  const result=chain.then(()=>collect(probe));chain=result.then(()=>{},()=>{});return result;
 }
 return Object.freeze({capture,snapshot:()=>Object.freeze({attempted:attempted.size,requests,maxRequests,deadline,
  minimumOriginDelayMs:MIN_DELAY,pacing:'local-only-not-coordinated-with-live-crawler',originStopped:stoppedOrigins.size>0,nativeObservation:false,productionValidated:false,assignmentAuthority:false})});
}
