// Explicit public Wikipedia capture library. No model, database or crawler state.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createPublicFetcher,PublicFetchError,PUBLIC_FETCH_POLICY} from '../../../src/crawler/public-fetch.js';
import {evaluateRobots,tdmRepUrlFor,parseTdmRepJson,matchTdmRep,
  parseTdmReservation,parseXRobotsDirectives} from '../../../src/crawler/robots.js';
import {captureStaticHtml} from '../../../src/crawler/static-capture.js';

import {parseRobotsWithKnownDenySpaceRepair} from '../hierarchical-public-capture-v2/robots-deny-space-repair.js';

import {pruneWikipediaTransportMetadata} from '../html-metadata-prune-v1/prune.js';

export const CAPTURE_NAMESPACE='hierarchy-real-root-public-capture/v3';
export const CAPTURE_LIMITS=Object.freeze({maxTraincalCases:96,maxTestCases:32,maxOrigins:5,
  maxWallMs:360000,minOriginDelayMs:2000,maxRequestMs:15000,maxResultBytes:4*1024*1024});
const HOSTS=new Set(['en.wikipedia.org','de.wikipedia.org','nl.wikipedia.org','fr.wikipedia.org','es.wikipedia.org']);
const handles=new WeakMap(),sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(new Error('Public capture refused'),{diagnosticCode:code});};
function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
function record(v,keys){
  if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail('manifest-shape');
  const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('manifest-shape');out[key]=d.value;}return out;
}
function dense(v,max){
  if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype)fail('manifest-shape');
  const n=Object.getOwnPropertyDescriptor(v,'length').value;if(n>max||Reflect.ownKeys(v).length!==n+1)fail('manifest-capacity');
  return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('manifest-shape');return d.value;});
}
function id(v){if(typeof v!=='string'||!v.length||v.length>160||v.trim()!==v||/[\u0000-\u001f\u007f]/u.test(v))fail('manifest-id');}
function pageUrl(raw){
  if(typeof raw!=='string'||raw.length>4096)fail('manifest-url');let u;try{u=new URL(raw);}catch{fail('manifest-url');}
  if(u.href!==raw||u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password||u.search||u.hash||
    !u.pathname.startsWith('/wiki/')||u.pathname.length<=6||/%(?:00|0a|0d|2f|5c)/iu.test(u.pathname)||raw.includes('\\'))fail('manifest-url');
  return u;
}
export function compileCaptureManifest(input){
  const a=record(input,['namespace','phase','cases']);
  if(a.namespace!==CAPTURE_NAMESPACE||!['traincal','test'].includes(a.phase))fail('manifest-namespace');
  const expected=a.phase==='traincal'?96:32,ids=new Set(),urls=new Set();
  const cases=dense(a.cases,expected).map(value=>{
    const c=record(value,['id','url']);id(c.id);pageUrl(c.url);
    if(ids.has(c.id)||urls.has(c.url))fail('manifest-duplicate');ids.add(c.id);urls.add(c.url);return c;
  });
  if(cases.length!==expected)fail('manifest-count');
  const manifest=freeze({namespace:a.namespace,phase:a.phase,cases});
  const manifestHash=sha(JSON.stringify(manifest)),handle=Object.freeze({});
  handles.set(handle,{manifest,manifestHash,pageUrls:urls,origins:new Set(cases.map(c=>new URL(c.url).origin))});return handle;
}
export function describeCaptureManifest(handle){
  const state=handles.get(handle);if(!state)fail('manifest-handle');
  return freeze({...state.manifest,manifestHash:state.manifestHash});
}
const EXCLUDED_TAGS=new Set(['table','nav','aside','header','footer','form','script','style','noscript','template','svg','canvas','iframe','object','embed','sup']);
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const CHROME_CLASS=/(?:^|\s)(?:infobox|sidebar|hatnote|shortdescription|mw-empty-elt|metadata|ambox|tmbox|ombox|fmbox|navbox|vertical-navbox|reflist|toc|noprint|mw-editsection)(?:\s|$)/iu;
// Small bounded tokenizer, not an HTML DOM or a browser visibility simulation.
function* tokens(html){
  let offset=0,count=0;
  while(offset<html.length){
    if(++count>100000)fail('candidate-token-capacity');
    if(html[offset]!=='<'){
      const next=html.indexOf('<',offset),end=next<0?html.length:next;yield html.slice(offset,end);offset=end;continue;
    }
    if(html.startsWith('<!--',offset)){
      const end=html.indexOf('-->',offset+4);if(end<0)fail('candidate-malformed-html');offset=end+3;continue;
    }
    let quote=null,end=offset+1;
    for(;end<html.length;end++){
      const c=html[end];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;
    }
    if(end>=html.length||quote)fail('candidate-malformed-html');yield html.slice(offset,end+1);offset=end+1;
  }
}
function attributes(source){
  if(source.length>16384)fail('candidate-attribute-capacity');
  const out=Object.create(null);let count=0;
  const regex=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;
  for(const m of source.matchAll(regex)){
    if(++count>128)fail('candidate-attribute-capacity');const name=m[1].toLowerCase();
    if(!Object.hasOwn(out,name))out[name]=m[2]??m[3]??m[4]??'';
  }return out;
}
function normalized(value){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return value.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z][a-z0-9]+));/giu,(_,numeric,named)=>{
    if(!numeric)return entities[named.toLowerCase()]??' ';
    const radix=numeric[0].toLowerCase()==='x'?16:10,n=Number.parseInt(radix===16?numeric.slice(1):numeric,radix);
    return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';
  }).normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]+/gu,' ').replace(/\s+/gu,' ').trim();
}
function prefixText(text){let value=text.slice(0,4096);if(/[\ud800-\udbff]$/u.test(value))value=value.slice(0,-1);return value;}
/** Diagnostic-only: first prose paragraphs in explicit Wikipedia content,
 * excluding tables/chrome, stopping at the first substantive section heading.
 * Never falls back to arbitrary whole-page or menu text. */
export function extractWikipediaLeadCandidate(html){
  if(typeof html!=='string'||!html||html.length>2*1024*1024)fail('candidate-html-capacity');
  const stack=[],paragraphs=[];let active=null,stopped=false,rawUnits=0;
  function finish(frame){
    if(active===frame){const text=normalized(active.raw);if(text.length>=80)paragraphs.push(text);active=null;}
  }
  for(const token of tokens(html)){
    if(stopped)break;
    if(token[0]!=='<'){
      if(active&&!stack.at(-1)?.blocked){rawUnits+=token.length;if(rawUnits>65536)fail('candidate-text-capacity');active.raw+=' '+token;}
      continue;
    }
    if(/^<!/u.test(token))continue;
    const m=/^<\s*(\/?)\s*([a-zA-Z][\w:-]*)([\s\S]*?)>$/u.exec(token);if(!m)continue;
    const closing=Boolean(m[1]),name=m[2].toLowerCase();
    if(closing){
      const index=stack.map(f=>f.name).lastIndexOf(name);if(index>=0)for(const frame of stack.splice(index).reverse())finish(frame);
      continue;
    }
    const a=attributes(m[3]),parent=stack.at(-1),content=Boolean(parent?.content)||a.id==='mw-content-text'||
      (a.class??'').split(/\s/u).includes('mw-parser-output')||(name==='section'&&a['data-mw-section-id']==='0');
    const blocked=Boolean(parent?.blocked)||EXCLUDED_TAGS.has(name)||CHROME_CLASS.test(a.class??'')||
      ['navigation','menu','complementary','dialog'].includes((a.role??'').toLowerCase())||Object.hasOwn(a,'hidden')||
      (a['aria-hidden']??'').toLowerCase()==='true'||/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?\s*(?:;|$)/iu.test(a.style??'');
    if(content&&!blocked&&/^h[2-6]$/u.test(name)&&paragraphs.length){stopped=true;break;}
    const frame={name,content,blocked,raw:''};
    if(!/\/\s*>$/u.test(token)&&!VOID.has(name)){
      if(stack.length>=256)fail('candidate-depth-capacity');stack.push(frame);
      if(name==='p'&&content&&!blocked){if(active)fail('candidate-nested-paragraph');active=frame;}
    }
    if(paragraphs.join(' ').length>=4096){stopped=true;break;}
  }
  const text=prefixText(paragraphs.join(' '));
  return {algorithm:'wikipedia-explicit-content-prose-lead/v1-diagnostic-only',status:text?'available':'unavailable',text,
    sha256:text?sha(text):null,characters:text.length,paragraphCount:paragraphs.length,
    noWholePageFallback:true,browserParityClaim:false,minimumParagraphCharacters:80};
}
function revisionMetadata(html,url){
  const ids=[...html.matchAll(/"wgRevisionId"\s*:\s*([1-9][0-9]{0,15})/gu)].map(m=>m[1]);
  const unique=[...new Set(ids)];const revisionId=unique.length===1?unique[0]:null;
  return {revisionId,revisionEvidence:revisionId?'literal-wgRevisionId-in-fetched-html':'unavailable-not-guessed',
    revisionUrl:revisionId?`${new URL(url).origin}/w/index.php?oldid=${revisionId}`:null,
    exactInputIdentity:'full-decoded-response-byte-SHA256-even-if-revision-id-unavailable'};
}

// Trusted transport/clock seam for offline tests. Production transport remains
// the existing public DNS-pinned HTTPS fetcher with its unchanged byte/MIME caps.
export async function collectPublicCaptures(handle,{fetchPublic=createPublicFetcher(),clock=()=>performance.now(),sleep=delay,signal}={}){
  const state=handles.get(handle);if(!state)fail('manifest-handle');
  if(typeof fetchPublic!=='function'||typeof clock!=='function'||typeof sleep!=='function')fail('capture-dependencies');
  const started=clock(),deadline=started+CAPTURE_LIMITS.maxWallMs,lastByOrigin=new Map(),policies=new Map(),requests=[],outcomes=[];
  const maxRequests=state.manifest.cases.length+2*state.origins.size;
  let failedCaseId=null,failedStage=null;
  function remaining(){const n=deadline-clock();if(n<=0||signal?.aborted)fail('absolute-capture-deadline');return n;}
  async function fetchOne(url,kind,crawlDelay=2000){
    const u=new URL(url);if(!state.origins.has(u.origin)||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port)fail('non-whitelisted-url');
    const policyUrl=kind==='robots'?u.origin+'/robots.txt':kind==='tdmrep'?tdmRepUrlFor(url):null;
    if(kind==='page'?!state.pageUrls.has(url):url!==policyUrl)fail('non-whitelisted-resource');
    if(requests.length>=maxRequests)fail('request-capacity');
    const pause=Math.max(0,(lastByOrigin.get(u.origin)??-Infinity)+Math.max(2000,crawlDelay)-clock());
    if(pause>=remaining())fail('origin-delay-exceeds-deadline');if(pause)await sleep(pause,undefined,{signal});remaining();
    lastByOrigin.set(u.origin,clock());const attempt={url,kind,startedOffsetMs:clock()-started};requests.push(attempt);
    let response;
    try{
      response=await fetchPublic(url,{resourceKind:kind,signal,timeoutMs:Math.min(15000,Math.max(1,Math.floor(remaining())))});
      remaining();
      if(response.kind!=='content')fail('redirect-refused-no-alias-expansion');
      if(response.finalUrl!==url||response.status!==200||typeof response.text!=='string'||!Buffer.isBuffer(response.body)||
        response.body.length>PUBLIC_FETCH_POLICY.maxDecompressedBytes||response.text.length>2*1024*1024)fail('transport-result-mismatch');
      attempt.status=200;return response;
    }catch(error){
      response?.body?.fill?.(0);
      if(error instanceof PublicFetchError&&error.code==='http-status'&&[404,410].includes(error.status)&&kind!=='page'){
        remaining();attempt.status=error.status;attempt.policyAbsent=true;return null;
      }throw error;
    }
  }
  async function policyFor(url){
    const origin=new URL(url).origin;if(policies.has(origin))return policies.get(origin);
    failedStage='robots';const robotsResponse=await fetchOne(origin+'/robots.txt','robots');let robotsText;
    let parsedRobots;
    try{robotsText=robotsResponse?.text??'';parsedRobots=parseRobotsWithKnownDenySpaceRepair({origin,text:robotsText,rawBytes:robotsResponse?.body??Buffer.alloc(0)});}
    finally{robotsResponse?.body?.fill?.(0);}
    const robots=parsedRobots.robots,tdmUrl=tdmRepUrlFor(url),tdmRobots=evaluateRobots(robots,tdmUrl);
    if(!tdmRobots.allowed)fail('tdm-policy-fetch-robots-denied');
    failedStage='tdm';const tdmResponse=await fetchOne(tdmUrl,'tdmrep',tdmRobots.crawlDelayMs);let tdmText;
    try{tdmText=tdmResponse?.text??null;}finally{tdmResponse?.body?.fill?.(0);}
    const policy={robots,tdm:tdmText===null?null:parseTdmRepJson(tdmText),robotsSha256:parsedRobots.receipt.rawRobotsSha256,
      robotsDecodedSha256:parsedRobots.receipt.decodedRobotsSha256,robotsCanonicalSha256:parsedRobots.receipt.canonicalRobotsSha256,
      robotsRepairId:parsedRobots.receipt.repairId,robotsRepairManifestHash:parsedRobots.receipt.repairManifestHash,
      robotsAbsent:robotsResponse===null,tdmAbsent:tdmResponse===null,tdmSha256:tdmText===null?null:sha(tdmText)};
    policies.set(origin,policy);return policy;
  }
  try{
    for(const c of state.manifest.cases){
      failedCaseId=c.id;failedStage='policy';remaining();
      const policy=await policyFor(c.url),robots=evaluateRobots(policy.robots,c.url);
      if(!robots.allowed)fail('page-robots-denied');
      const declared=policy.tdm===null?null:matchTdmRep(policy.tdm,c.url).reservation;
      if(declared===1)fail('tdm-document-reserved');
      failedStage='page';const response=await fetchOne(c.url,'page',robots.crawlDelayMs);
      try{
        failedStage='extractor';const headerRobots=parseXRobotsDirectives(response.headers.xRobotsTag);
        const pruned=pruneWikipediaTransportMetadata({html:response.text}),current=captureStaticHtml(pruned.html,c.url);
        const header=response.headers.tdmReservation===null?null:parseTdmReservation(response.headers.tdmReservation);
        if(response.headers.tdmReservation!==null&&header===null||current.directives.tdmReservationInvalid)fail('tdm-ambiguous');
        if([declared,header,current.directives.tdmReservation].includes(1))fail('tdm-reserved');
        if(headerRobots.blocked||current.directives.noindex)fail('indexing-disallowed');
        if(!current.eligible)fail('current-extractor-insufficient-text');
        const candidate=extractWikipediaLeadCandidate(pruned.html);remaining();
        outcomes.push({id:c.id,url:c.url,title:current.title,titleProvenance:'unchanged-static-extractor-title-or-hostname-fallback-not-gold-title',fetchedAt:new Date().toISOString(),htmlSha256:sha(response.body),
          decodedHtmlSha256:sha(response.text),metadataPrune:pruned.receipt,
          decodedHtmlCharacters:response.text.length,decodedHtmlBytes:response.body.length,compressedBytes:response.compressedBytes,
          mimeType:response.mimeType,contentEncoding:response.contentEncoding,...revisionMetadata(response.text,c.url),
          attribution:{publisher:'Wikipedia contributors',articleUrl:c.url,
            historyUrl:new URL(c.url).origin+'/w/index.php?title='+encodeURIComponent(decodeURIComponent(new URL(c.url).pathname.slice(6)))+'&action=history',
            license:'CC-BY-SA-4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',
            modification:'Bounded extraction and whitespace/entity normalization; full HTML not retained'},
          policy:{robotsSha256:policy.robotsSha256,robotsDecodedSha256:policy.robotsDecodedSha256,
            robotsCanonicalSha256:policy.robotsCanonicalSha256,robotsRepairId:policy.robotsRepairId,
            robotsRepairManifestHash:policy.robotsRepairManifestHash,robotsAbsent:policy.robotsAbsent,tdmAbsent:policy.tdmAbsent,tdmSha256:policy.tdmSha256,
            robotsAllowed:true,crawlDelayMs:robots.crawlDelayMs,tdmReservation:header??current.directives.tdmReservation??declared,
            nofollow:headerRobots.nofollow||current.directives.nofollow},
          current:{extractorVersion:current.extractorVersion,text:current.text,sha256:current.contentHash,characters:current.text.length},
          leadCandidate:candidate,currentPrefixEqualsCandidate:current.text===candidate.text,
          candidateOpening80OffsetInCurrent:candidate.text?current.text.indexOf(candidate.text.slice(0,80)):null});
      }finally{response.body.fill(0);}
    }
    failedCaseId=null;failedStage=null;
  }catch(error){
    const failureCode=/^[a-z0-9-]{1,80}$/u.test(error?.diagnosticCode??'')?error.diagnosticCode:
      error instanceof PublicFetchError?'public-fetch-'+error.code:'policy-or-capture-unavailable';
    return freeze({namespace:CAPTURE_NAMESPACE,phase:state.manifest.phase,manifestHash:state.manifestHash,status:'partial-failure',
      expectedCases:state.manifest.cases.length,completedCases:outcomes.length,failedCaseId,failedStage,failureCode,
      requests,outcomes,elapsedMs:clock()-started,noAutomaticRetry:true});
  }
  return freeze({namespace:CAPTURE_NAMESPACE,phase:state.manifest.phase,manifestHash:state.manifestHash,status:'complete',
    expectedCases:state.manifest.cases.length,completedCases:outcomes.length,failedCaseId,failedStage,failureCode:null,
    requests,outcomes,elapsedMs:clock()-started,noAutomaticRetry:true});
}



