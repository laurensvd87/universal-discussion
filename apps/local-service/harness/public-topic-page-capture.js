// Bounded public-only capture for an explicit fixed-cohort diagnostic. No
// credentials, redirects, discovery, source/database writes or model calls.
import {createHash} from 'node:crypto';
import {fetchPublicResource,PublicFetchError} from '../src/crawler/public-fetch.js';
import {parseRobotsTxt,evaluateRobots,tdmRepUrlFor,parseTdmRepJson,matchTdmRep,parseTdmReservation,parseXRobotsDirectives} from '../src/crawler/robots.js';
import {captureStaticHtml,describeStaticCaptureFailure} from '../src/crawler/static-capture.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const errors=new WeakSet();
function refusal(code){const e=Object.assign(new Error('Public topic capture refused'),{code});errors.add(e);return e;}
const need=(value,code)=>{if(!value)throw refusal(code);};
export function publicTopicCaptureFailure(error){return errors.has(error)?error.code:null;}
export function createPublicTopicPageCapture({fetchPublic=fetchPublicResource,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 return async function capture(rawUrl,deadline){
  const url=new URL(rawUrl);need(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'public-url');
  let requests=0,last=null,lastClock=now();
  const check=()=>{const time=now();need(Number.isFinite(time)&&time>=lastClock&&time<deadline,'capture-deadline');lastClock=time;return time;};
  const wipe=response=>{if(Buffer.isBuffer(response?.body))response.body.fill(0);};
  async function request(target,resourceKind,delay=0){let time=check();const wait=last===null?0:Math.max(0,last+Math.max(5000,delay)-time);
   need(time+wait<deadline,'capture-deadline');if(wait){await sleep(wait);time=check();need(time>=last+Math.max(5000,delay),'capture-clock');}
   need(requests<3,'request-cap');requests++;last=time;
   const response=await fetchPublic(target,{resourceKind,timeoutMs:Math.min(15000,Math.floor(deadline-time))});
   try{check();return response;}catch(error){wipe(response);throw error;}
  }
  async function policy(target,kind,delay){let response;
   try{response=await request(target,kind,delay);need(response?.kind==='content'&&response.url===target&&response.finalUrl===target&&typeof response.text==='string','policy-unavailable');return response.text;}
   catch(error){if(error instanceof PublicFetchError&&[404,410].includes(error.status)&&error.code==='http-status')return null;throw error;}
   finally{wipe(response);}
  }
  const robotsText=await policy(url.origin+'/robots.txt','robots',0),robots=parseRobotsTxt(robotsText??'');
  const tdmUrl=tdmRepUrlFor(url.origin),tdmAccess=evaluateRobots(robots,tdmUrl);need(tdmAccess.allowed,'policy-denied');
  const tdmText=await policy(tdmUrl,'tdmrep',tdmAccess.crawlDelayMs),tdm=tdmText===null?null:parseTdmRepJson(tdmText);
  const access=evaluateRobots(robots,rawUrl);need(access.allowed,'policy-denied');let response;
  try{
   response=await request(rawUrl,'page',access.crawlDelayMs);
   need(response?.kind==='content'&&response.url===rawUrl&&response.finalUrl===rawUrl&&['text/html','application/xhtml+xml'].includes(response.mimeType)&&typeof response.text==='string'&&Buffer.isBuffer(response.body)&&response.headers,'document-unavailable');
   need(!parseXRobotsDirectives(response.headers.xRobotsTag).blocked,'policy-denied');
   let reservation=tdm===null?null:matchTdmRep(tdm,rawUrl).reservation;
   if(response.headers.tdmReservation!==null){const value=parseTdmReservation(response.headers.tdmReservation);need(value!==null,'policy-denied');reservation=value;}
   let captured;try{captured=captureStaticHtml(response.text,rawUrl);}catch(error){throw refusal('extractor-'+(describeStaticCaptureFailure(error)?.code??'unavailable'));}
   need(!captured.directives.tdmReservationInvalid,'policy-denied');if(captured.directives.tdmReservation!==null)reservation=captured.directives.tdmReservation;
   need(reservation!==1&&!captured.directives.noindex,'policy-denied');
   need(captured.eligible&&captured.contentHash!==null&&captured.text.length<=4096&&captured.title.length<=200,'document-insufficient');check();
   return {url:rawUrl,title:captured.title,body:captured.text,bodySha256:captured.contentHash,requests,
    evidenceSha256:sha(JSON.stringify({robots:sha(robotsText??''),tdm:tdmText===null?null:sha(tdmText),headers:response.headers,directives:captured.directives,reservation}))};
  }finally{wipe(response);}
 };
}
