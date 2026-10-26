// Source-only ADR150 policy. No DNS, HTTP, browser, model or filesystem actions.
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {types} from 'node:util';
import {FIXED_CASES} from './native-adapter.js';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';
import {isGlobalPublicAddress} from '../../../../../apps/local-service/src/crawler/public-fetch.js';
import {browserHeaderPolicy} from '../../current-producer-final-v2/policy.js';

export const NATIVE_RESOURCE_ORIGINS=Object.freeze(['https://cdn.jsdelivr.net','https://cdnjs.cloudflare.com',
 'https://fonts.googleapis.com','https://fonts.gstatic.com','https://unpkg.com']);
export const NATIVE_DNS_HOSTS=Object.freeze([...new Set([...FIXED_CASES.map(c=>new URL(c.url).hostname),
 ...NATIVE_RESOURCE_ORIGINS.map(o=>new URL(o).hostname)])]);
export const NATIVE_NETWORK_LIMITS=Object.freeze({hosts:34,dnsRecordsPerHost:32,articleEvents:1024,urlUnits:2048,
 requestIdUnits:160,frameIdUnits:160,headers:64,headerBytes:16384});
export class NativeNetworkError extends TypeError{
 constructor(code){super('Native study network refused');this.name='NativeNetworkError';this.code=code;}
}
const fail=code=>{throw new NativeNetworkError(code);};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha=value=>createHash('sha256').update(value).digest('hex');
const states=new WeakMap(),gates=new WeakMap(),RESOURCE_TYPES=new Set(['Script','Stylesheet','Image','Font','XHR','Fetch']);
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail('contract');
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('contract');out[k]=d.value;}return out;
}
function dense(v,max){
 if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1)fail('contract');
 return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('contract');return d.value;});
}
function id(v){if(typeof v!=='string'||!v.length||v.length>160||!v.isWellFormed()||/[\p{Cc}\p{Cf}\p{White_Space}]/u.test(v))fail('contract');return v;}
function frozen(v){if(v&&typeof v==='object'){for(const child of Object.values(v))frozen(child);Object.freeze(v);}return v;}
function address(v){
 if(typeof v!=='string'||v.length>64||!isGlobalPublicAddress(v))fail('non-public-dns-or-peer');
 const family=isIP(v);return family===4?v:new URL('https://['+v+']/').hostname.slice(1,-1);
}
/** Validates ALL observed A/AAAA answers, chooses once, and never retries an IP. */
export function selectNativeDnsPin(input){
 const a=record(input,['host','answers']);if(!NATIVE_DNS_HOSTS.includes(a.host))fail('contract');
 const answers=dense(a.answers,32).map(value=>{const r=record(value,['address','family']);
  if(![4,6].includes(r.family)||isIP(r.address)!==r.family)fail('dns-contract');return {address:address(r.address),family:r.family};});
 if(!answers.length)fail('dns-contract');
 answers.sort((x,y)=>x.family-y.family||(x.address<y.address?-1:x.address>y.address?1:0));
 const unique=answers.filter((v,i)=>i===0||v.address!==answers[i-1].address||v.family!==answers[i-1].family);
 return frozen({host:a.host,address:unique[0].address,family:unique[0].family,
  pinHash:digest({host:a.host,address:unique[0].address,family:unique[0].family}),answerSetHash:digest(unique)});
}
/** Caller supplies completed owned DNS results, not untrusted JSON paths.
 * Pins are identity evidence only until actual browser peers are checked. */
export function compileNativeDnsPins(input){
 const a=record(input,['rows']),rows=dense(a.rows,34);if(rows.length!==34)fail('contract');
 const pins=new Map(),view=[];
 rows.forEach((value,i)=>{
  const r=record(value,['host','status','answers']);if(r.host!==NATIVE_DNS_HOSTS[i])fail('contract');
  if(r.status==='unavailable'){
   if(dense(r.answers,32).length)fail('contract');view.push({host:r.host,status:r.status});
  }else if(r.status==='pinned'){
   const pin=selectNativeDnsPin({host:r.host,answers:r.answers});pins.set(r.host,pin);
   view.push({host:r.host,status:r.status,family:pin.family,pinHash:pin.pinHash,answerSetHash:pin.answerSetHash});
  }else fail('contract');
 });
 const argument='--host-resolver-rules='+[...pins.values()].map(p=>'MAP '+p.host+' '+(p.family===6?'['+p.address+']':p.address)).concat('MAP * ~NOTFOUND').join(', ');
 const handle=Object.freeze({});states.set(handle,{pins,argument,description:frozen({schema:'native-browser-dns-pins/v1',hosts:view,
  pinned:pins.size,resolverRulesHash:sha(argument),deterministicSelection:'IPv4-preferred-then-canonical-lexical-first',fallbackAllowed:false,
  browserFlagHonouredProven:false,completeOsEgressIsolation:false})});return handle;
}
function dns(handle){if(!states.has(handle))fail('contract');return states.get(handle);}
export function describeNativeDnsPins(handle){return dns(handle).description;}
export function nativeHostResolverArgument(handle){return dns(handle).argument;}
export function nativeHostPinned(handle,host){if(!NATIVE_DNS_HOSTS.includes(host))fail('contract');return dns(handle).pins.has(host);}
export function verifyNativeSelectedPeer(handle,host,peer){
 const selected=dns(handle).pins.get(host);if(!selected)fail('unavailable-dns-host');
 if(address(peer)!==selected.address||isIP(peer)!==selected.family)fail('peer-pin-mismatch');
 return frozen({selectedPublicPinMatched:true,pinHash:selected.pinHash});
}
export function createNativeArticleNetworkGate(input){
 const a=record(input,['dnsPins','caseUrl','frameId']);dns(a.dnsPins);id(a.frameId);
 if(!FIXED_CASES.some(c=>c.url===a.caseUrl))fail('contract');
 const handle=Object.freeze({});gates.set(handle,{...a,origin:new URL(a.caseUrl).origin,requests:new Set(),main:null,response:null,
  events:0,blocked:{},closed:false,navigationLoaderVerified:false});return handle;
}
function gate(handle){if(!gates.has(handle))fail('contract');return gates.get(handle);}
function blocked(s,reason){s.blocked[reason]=(s.blocked[reason]??0)+1;return frozen({action:'abort',reason,mainDocument:false});}
export function admitNativePageRequest(handle,input){
 const s=gate(handle),r=record(input,['requestId','networkId','frameId','url','method','resourceType','authorizationPresent']);
 if(s.closed)fail('retired-article');if(++s.events>1024)fail('article-event-capacity');
 id(r.requestId);if(s.requests.has(r.requestId))fail('duplicate-request');s.requests.add(r.requestId);
 if(typeof r.authorizationPresent!=='boolean')fail('contract');
 if(r.authorizationPresent)return blocked(s,'credential-header');
 if(typeof r.url!=='string'||r.url.length>2048||!r.url.isWellFormed())return blocked(s,'url-policy');
 if(!['GET','HEAD'].includes(r.method))return blocked(s,'method');
 if(r.frameId!==s.frameId)return blocked(s,'frame');
 const policy=inspectPageUrl(r.url);if(!policy.supported||policy.url!==r.url)return blocked(s,'url-policy');
 const url=new URL(r.url),host=url.hostname;
 if(!NATIVE_DNS_HOSTS.includes(host)||!dns(s.dnsPins).pins.has(host))return blocked(s,'unpinned-host');
 if(r.resourceType==='Document'){
  if(s.main||r.url!==s.caseUrl)return blocked(s,'main-navigation');id(r.networkId);
  s.main=frozen({requestId:r.requestId,networkId:r.networkId,frameId:r.frameId,url:r.url});
  return frozen({action:'continue',reason:'exact-main-document',mainDocument:true});
 }
 if(!RESOURCE_TYPES.has(r.resourceType))return blocked(s,'resource-type');
 if(url.origin!==s.origin&&!NATIVE_RESOURCE_ORIGINS.includes(url.origin))return blocked(s,'resource-origin');
 return frozen({action:'continue',reason:'bounded-render-resource',mainDocument:false});
}
/** ONE main response, same Fetch/Network IDs/frame and selected pin.
 * The observed response loader is only a reservation until independently checked.
 * Headers are parsed only in RAM. Browser/native document IDs are NOT correlated here. */
export function admitNativeMainResponse(handle,input){
 const s=gate(handle),a=record(input,['paused','network']),p=record(a.paused,['url','status','headers','networkId','frameId','requestId']),
  n=record(a.network,['url','status','requestId','frameId','loaderId','remoteAddress','securityState','mimeType']);
 if(s.closed||s.response||!s.main||p.url!==s.caseUrl||n.url!==s.caseUrl||p.frameId!==s.frameId||n.frameId!==s.frameId||
  p.networkId!==s.main.networkId||n.requestId!==s.main.networkId||p.status!==n.status)fail('main-response-identity');
 id(p.requestId);id(n.loaderId);
 if(!Number.isInteger(p.status)||p.status<200||p.status>=300)fail('main-response-unavailable');
 if(!['text/html','application/xhtml+xml'].includes(n.mimeType))fail('main-response-unavailable');
 if(n.securityState!=='secure')fail('main-tls-unverified');
 const peer=verifyNativeSelectedPeer(s.dnsPins,new URL(s.caseUrl).hostname,n.remoteAddress);
 const policy=browserHeaderPolicy(p.headers);
 s.response=frozen({schema:'native-main-response-journey/v1',finalUrlHash:sha(s.caseUrl),status:p.status,frameId:s.frameId,loaderId:n.loaderId,
  fetchRequestId:s.main.requestId,fetchResponseId:p.requestId,networkRequestId:s.main.networkId,requestUrlExact:true,ordinaryTlsSecure:true,
  ...peer,headerPolicyHash:digest(policy),navigationLoaderVerified:false,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false});
 return s.response;
}
/** Caller must obtain this loader independently from its actual navigation and
 * matching current frame/lifecycle, not copy it from the response itself. */
export function verifyNativeNavigationLoader(handle,input){
 const s=gate(handle),n=record(input,['url','frameId','loaderId']);id(n.frameId);id(n.loaderId);
 if(s.closed||!s.response||s.navigationLoaderVerified||n.url!==s.caseUrl||n.frameId!==s.frameId||n.loaderId!==s.response.loaderId)fail('navigation-loader-mismatch');
 s.navigationLoaderVerified=true;s.response=frozen({...s.response,navigationLoaderVerified:true});return s.response;
}
export function describeNativeArticleNetworkGate(handle){const s=gate(handle);return frozen({schema:'native-article-network-gate/v1',
 events:s.events,blocked:{...s.blocked},mainAdmitted:s.main!==null,responseAdmitted:s.response!==null,navigationLoaderVerified:s.navigationLoaderVerified,closed:s.closed,
 restrictedNetworkRendering:true,unrestrictedBrowserParity:false,completeOsEgressIsolation:false});}
export function closeNativeArticleNetworkGate(handle){gate(handle).closed=true;}
