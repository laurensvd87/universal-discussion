// Fresh fixed public probes only. Import does not fetch, encode, or open state.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {fetchPublicResource,PublicFetchError} from '../src/crawler/public-fetch.js';
import {parseRobotsTxt,evaluateRobots,tdmRepUrlFor,parseTdmRepJson,matchTdmRep,parseTdmReservation,parseXRobotsDirectives} from '../src/crawler/robots.js';
import {captureStaticHtml} from '../src/crawler/static-capture.js';
import {normalizeCrawlUrl} from '../src/crawler/url-policy.js';
import {PUBLIC_HIERARCHY_PROBES} from './hierarchy-public-probes.js';
import {RECIPE_CAL_PROBES,RECIPE_TEST_PROBES} from './hierarchy-recipe-corpus.js';
import {GTA_TRAIN_PROBES,GTA_CAL_PROBES,GTA_TEST_PROBES} from './hierarchy-gta-corpus.js';

const ORIGIN='https://en.wikipedia.org',MAX_REQUESTS=34,MAX_DURATION=240000,MIN_DELAY=5000;
const CODES=new Set(['already-attempted','deadline','aborted','clock-invalid','request-limit','robots-denied','policy-unavailable',
 'page-unavailable','redirect-refused','response-invalid','header-restricted','tdm-ambiguous','tdm-reserved','document-invalid','document-restricted','insufficient-text','pace-unavailable',
 'origin-paused','rate-limited','access-denied','upstream-unavailable','fetch-unavailable']);
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
export function createHierarchyPublicCapture({fetchPublic=fetchPublicResource,clock=Date.now,sleep=defaultSleep,signal,deadline}={}){
 if(typeof fetchPublic!=='function'||typeof clock!=='function'||typeof sleep!=='function')throw new TypeError('Invalid fixed public capture dependencies');
 const start=clock();if(!Number.isFinite(start)||start<0)throw new TypeError('Invalid fixed public capture clock');
 deadline??=start+MAX_DURATION;
 if(!Number.isFinite(deadline)||deadline<=start||deadline>start+MAX_DURATION||signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'))throw new TypeError('Invalid fixed public capture deadline or signal');
 const approved=[...PUBLIC_HIERARCHY_PROBES,...RECIPE_CAL_PROBES,...RECIPE_TEST_PROBES,...GTA_TRAIN_PROBES,...GTA_CAL_PROBES,...GTA_TEST_PROBES];
 const probes=new Map(approved.map(p=>[p.id,p]));
 if(probes.size!==64||probes.size!==approved.length||[...probes.values()].some(p=>normalizeCrawlUrl(p.url,undefined,[])!==p.url||new URL(p.url).origin!==ORIGIN))throw new TypeError('Invalid fixed probe source');
 const attempted=new Set();let chain=Promise.resolve(),policyPromise=null,requests=0,lastRequest=null,lastClock=start,originStopped=false;
 function check(){if(signal?.aborted)fail('aborted');const now=clock();if(!Number.isFinite(now)||now<lastClock)fail('clock-invalid');lastClock=now;if(now>=deadline)fail('deadline');return now;}
 async function request(url,resourceKind,delay=0){
  if(new URL(url).origin!==ORIGIN)fail('response-invalid');
  let now=check();const earliest=lastRequest===null?now:lastRequest+Math.max(MIN_DELAY,delay),wait=Math.max(0,earliest-now);
  if(now+wait>=deadline)fail('deadline');
  if(wait){try{await sleep(wait,signal);}catch{check();fail('pace-unavailable');}now=check();if(now<earliest)fail('pace-unavailable');}
  if(deadline-now<1)fail('deadline');if(requests>=MAX_REQUESTS)fail('request-limit');requests++;lastRequest=now;
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
 async function policy(){
  const robotsText=await policyText(ORIGIN+'/robots.txt','robots',0);
  let robots;try{robots=parseRobotsTxt(robotsText??'');}catch{fail('policy-unavailable');}
  const tdmUrl=tdmRepUrlFor(ORIGIN),allowed=evaluateRobots(robots,tdmUrl);
  if(!allowed.allowed)fail('policy-unavailable');
  const tdmText=await policyText(tdmUrl,'tdmrep',allowed.crawlDelayMs);
  let tdm=null;try{if(tdmText!==null)tdm=parseTdmRepJson(tdmText);}catch{fail('policy-unavailable');}
  return {robots,tdm,robotsSha256:sha(robotsText??''),tdmRepSha256:tdmText===null?null:sha(tdmText)};
 }
 async function collect(probe){
  let response;
  try{
   check();if(originStopped)fail('origin-paused');policyPromise??=policy();const originPolicy=await policyPromise;check();
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
   let capture;try{capture=captureStaticHtml(response.text,probe.url);}catch{fail('document-invalid');}
   if(capture.directives.tdmReservationInvalid)fail('tdm-ambiguous');
   if(capture.directives.tdmReservation!==null)reservation=capture.directives.tdmReservation;
   if(reservation===1)fail('tdm-reserved');if(capture.directives.noindex)fail('document-restricted');
   if(!capture.eligible||capture.contentHash===null)fail('insufficient-text');check();
   const responseSha256=sha(response.body),htmlTextSha256=sha(response.text),titleSha256=sha(capture.title),bodySha256=capture.contentHash;
   const rightsEvidenceHash=digest({robotsSha256:originPolicy.robotsSha256,tdmRepSha256:originPolicy.tdmRepSha256,
    headerPolicySha256:digest({xRobotsTag:response.headers.xRobotsTag,tdmReservation:response.headers.tdmReservation,tdmPolicy:response.headers.tdmPolicy}),
    documentDirectives:capture.directives,reservation});
   const sourceInputHash=digest({schema:'hierarchy-public-static-observation/v1',url:probe.url,extractorVersion:capture.extractorVersion,responseSha256,htmlTextSha256,titleSha256,bodySha256,rightsEvidenceHash});
   check();return Object.freeze({id:probe.id,url:probe.url,status:'available',title:capture.title,text:capture.text,
    extractorVersion:capture.extractorVersion,responseSha256,htmlTextSha256,titleSha256,bodySha256,rightsEvidenceHash,sourceInputHash,
    provenance:'fresh-public-crawler-static-html-paired-observation/v1',nativeObservation:false,productionValidated:false,assignmentAuthority:false});
  }catch(error){const stopped=originFailure(error);if(stopped)originStopped=true;return unavailable(probe,code(error)??stopped??'page-unavailable');}
  finally{wipe(response);}
 }
 function capture(probeId){
  if(arguments.length!==1||typeof probeId!=='string'||!probes.has(probeId))return Promise.reject(new TypeError('Invalid fixed public probe'));
  const probe=probes.get(probeId);if(attempted.has(probeId))return Promise.resolve(unavailable(probe,'already-attempted'));attempted.add(probeId);
  const result=chain.then(()=>collect(probe));chain=result.then(()=>{},()=>{});return result;
 }
 return Object.freeze({capture,snapshot:()=>Object.freeze({attempted:attempted.size,requests,maxRequests:MAX_REQUESTS,deadline,
  minimumOriginDelayMs:MIN_DELAY,pacing:'local-only-not-coordinated-with-live-crawler',originStopped,nativeObservation:false,productionValidated:false,assignmentAuthority:false})});
}
