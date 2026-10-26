// Pure declared-evidence checks; no browser, fetch, auth or native authority.
import { types } from 'node:util';
import { isGlobalPublicAddress } from '../../../../apps/local-service/src/crawler/public-fetch.js';
import { browserHeaderPolicy,validateBrowserSnapshot,ControlFatal,ControlUnavailable,collectOriginPolicies,safeRequestHeaders,checkedCases } from '../current-producer-final-v2/policy.js';
export { ControlFatal,ControlUnavailable,collectOriginPolicies,safeRequestHeaders };
export const CURRENT_REQUEST_FAILURE_TEXTS=Object.freeze(['net::ERR_NAME_NOT_RESOLVED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_CLOSED',
 'net::ERR_CONNECTION_TIMED_OUT','net::ERR_TIMED_OUT','net::ERR_ADDRESS_UNREACHABLE']);
/** Exact pinned-version human-readable API field allowlist, NOT a portable enum. */
export function browserRequestFailureReason(value){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;
 const d=Object.getOwnPropertyDescriptor(value,'errorText');if(!d?.enumerable||!Object.hasOwn(d,'value')||Reflect.ownKeys(value).length!==1)return null;
 return CURRENT_REQUEST_FAILURE_TEXTS.includes(d.value)?'browser-transport-unavailable':null;
}
import {digest,sha,freeze} from './manifest.js';
const invalid=()=>{throw new TypeError('Invalid Playwright DEV contract');};
function record(v,keys){if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)invalid();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=d.value;}return out;}
function text(v){if(typeof v!=='string'||!v.length||v.length>160||!v.isWellFormed())invalid();return v;}
function object(v){if(!v||typeof v!=='object'||types.isProxy(v))invalid();return v;}
const states=new WeakMap();
function state(h){const s=states.get(h);if(!s)invalid();return s;}
export function createDocumentGate(value){
 const a=record(value,['url','mainFrame','frameId','scope']);const scope=checkedCases(a.scope);if(!scope.some(c=>c.url===a.url))invalid();object(a.mainFrame);text(a.frameId);
 const h=Object.freeze({});states.set(h,{...a,scope,request:null,response:null,document:null,closed:false});return h;
}
export function reserveDocument(handle,value){
 const s=state(handle),a=record(value,['request','url','method','resourceType','frame']);object(a.request);object(a.frame);
 if(s.closed||s.request||a.url!==s.url||!['GET','HEAD'].includes(a.method)||a.resourceType!=='document'||a.frame!==s.mainFrame)return false;
 s.request=a.request;return true;
}
export function verifyResponse(handle,value){
 const s=state(handle),a=record(value,['request','url','status','headers','serverIp','tlsVerified','mimeType']);
 if(s.closed||!s.request||s.response||a.request!==s.request||a.url!==s.url)throw new ControlFatal('response-integrity');
 if(!isGlobalPublicAddress(a.serverIp)||a.tlsVerified!==true)throw new ControlFatal('response-integrity');
 if(!Number.isInteger(a.status)||a.status<200||a.status>=300||!['text/html','application/xhtml+xml'].includes(a.mimeType))throw new ControlUnavailable('document-response-refused');
 const headers=browserHeaderPolicy(a.headers);
 s.response=Object.freeze({status:a.status,frameId:s.frameId,exactFinalUrl:true,observedRemoteAddressPublic:true,ordinaryTlsSecure:true,
  requestIdentityScope:'same-playwright-request-object/v1',networkRequestIdCorrelated:false,...headers});return s.response;
}
export function bindDocument(handle,value){
 const s=state(handle),a=record(value,['frameId','loaderId','url']);text(a.frameId);text(a.loaderId);
 if(s.closed||!s.response||s.document||a.frameId!==s.frameId||a.url!==s.url)throw new ControlFatal('response-integrity');
 s.document=Object.freeze({...a});return s.document;
}
export function assertDocument(handle,value){
 const s=state(handle),a=record(value,['frameId','loaderId','url']);
 if(s.closed||!s.response||!s.document||a.frameId!==s.document.frameId||a.loaderId!==s.document.loaderId||a.url!==s.document.url)throw new ControlFatal('response-integrity');
 return true;
}
export function retainPairedSnapshot(handle,value){
 const s=state(handle),a=record(value,['capture','document','navigationId','documentId']);
 if(s.closed||!s.document||!s.response)throw new ControlFatal('response-integrity');text(a.navigationId);text(a.documentId);
 const result=validateBrowserSnapshot({expectedUrl:s.url,capture:a.capture,document:a.document,navigationId:a.navigationId,
  frameId:s.document.frameId,loaderId:s.document.loaderId,responseWitness:{...s.response,loaderId:s.document.loaderId}},s.scope);
 if(result.status!=='collected')return result;
 const {titlePrefix,bodyPrefix,...hashes}=result.capture;
 const {status,frameId,...responseRest}=s.response;
 const response=freeze({status,frameId,loaderId:s.document.loaderId,...responseRest});
 const witness=freeze({schema:'playwright-owned-document/v1',finalUrlHash:sha(s.url),frameId:s.document.frameId,loaderId:s.document.loaderId,
  navigationId:a.navigationId,documentId:a.documentId,response,dom:result.documentWitness,responseWitnessHash:digest(response),domWitnessHash:digest(result.documentWitness),
  networkRequestIdCorrelated:false,nativeAttestation:false});
 const c=record(a.capture,['contractVersion','status','url','title','text','extractorVersion']);
 return freeze({...result,capture:hashes,documentWitness:witness,pairedInput:{title:c.title,body:c.text,extractorVersion:c.extractorVersion,documentWitness:witness},
  pagePolicyHash:digest({schema:'browser-root-page-policy/v1',responseWitnessHash:witness.responseWitnessHash,domWitnessHash:witness.domWitnessHash})});
}
export function closeDocumentGate(handle){state(handle).closed=true;}

export function requestHeaders(value){return safeRequestHeaders(value);}


