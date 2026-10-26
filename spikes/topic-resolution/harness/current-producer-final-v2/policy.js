// Pure bounded final-batch policy. No scoring, owner state or fallback.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { createPublicFetcher, PublicFetchError, PUBLIC_FETCH_POLICY, isGlobalPublicAddress } from '../../../../apps/local-service/src/crawler/public-fetch.js';
import { evaluateRobots, parseXRobotsDirectives, parseTdmRepJson, matchTdmRep, parseTdmReservation, tdmRepUrlFor, CrawlerPolicyError } from '../../../../apps/local-service/src/crawler/robots.js';
import { captureStaticHtml } from '../../../../apps/local-service/src/crawler/static-capture.js';
import { parseRobotsWithKnownDenySpaceRepair } from '../../../../apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const UNAVAILABLE = new Set(['origin-policy-timeout', 'origin-policy-http-refused', 'origin-policy-malformed', 'origin-policy-budget',
  'origin-robots-denied', 'origin-tdm-reserved', 'article-timeout', 'article-http-refused', 'article-redirect-refused', 'article-transport-capacity',
  'page-header-restricted', 'page-header-malformed', 'static-policy-parse-unavailable', 'static-insufficient-text',
  'static-rights-ineligible', 'fresh-origin-ineligible', 'document-response-refused', 'document-dom-restricted', 'document-dom-capacity',
  'document-identity-unavailable', 'reader-unsupported', 'origin-transport-unavailable', 'article-transport-unavailable',
  'origin-representation-unavailable', 'article-representation-unavailable', 'browser-transport-unavailable']);
const FATAL = new Set(['invalid-contract', 'absolute-job-deadline', 'aborted', 'unhandled-transport', 'source-integrity', 'response-integrity',
  'request-capacity', 'callback-failed', 'protocol-failed', 'setup-deadline', 'navigation-transport-failure', 'unsettled-callbacks',
  'diagnostic-capacity']);
export class ControlUnavailable extends Error { constructor(code) { if (!UNAVAILABLE.has(code)) throw new TypeError('Invalid unavailable code'); super('Fixed control unavailable'); this.code = code; } }
export class ControlFatal extends Error { constructor(code) { if (!FATAL.has(code)) throw new TypeError('Invalid fatal code'); super('Fixed control fatal'); this.code = code; } }
const invalid = () => { throw new ControlFatal('invalid-contract'); };
function genuine(v,ctor){return Boolean(v&&typeof v==='object'&&!types.isProxy(v)&&types.isNativeError(v)&&Object.getPrototypeOf(v)===ctor.prototype);}
export function record(v, fields) {
  if (!v || typeof v !== 'object' || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype || Reflect.ownKeys(v).length !== fields.length) invalid();
  const out = {}; for (const key of fields) { const d = Object.getOwnPropertyDescriptor(v, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid(); out[key] = d.value; } return out;
}
function dense(v, max) {
  if (!Array.isArray(v) || types.isProxy(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > max || Reflect.ownKeys(v).length !== v.length + 1) invalid();
  return Array.from({ length: v.length }, (_, i) => { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid(); return d.value; });
}
function text(v, max) { if (typeof v !== 'string' || !v.isWellFormed() || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)) invalid(); return v; }
export function failureProjection(error) {
  if (error && !types.isProxy(error) && (genuine(error,ControlUnavailable) || genuine(error,ControlFatal))) {
    const d = Object.getOwnPropertyDescriptor(error, 'code');
    if (d && Object.hasOwn(d, 'value') && (genuine(error,ControlUnavailable) ? UNAVAILABLE : FATAL).has(d.value)) return freeze({ kind: genuine(error,ControlUnavailable) ? 'unavailable' : 'fatal', reason: d.value });
  }
  return freeze({ kind: 'fatal', reason: 'unhandled-transport' });
}
export function remaining(deadline, now, signal) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) invalid();
  if (signal?.aborted) throw new ControlFatal('aborted');
  const ms = deadline - now; if (ms <= 0) throw new ControlFatal('absolute-job-deadline'); return ms;
}
export function articleObservationDue({ started, dclAt, now }) {
  for (const x of [started, dclAt, now]) if (!Number.isFinite(x) || x < 0) invalid();
  if (dclAt < started || now < dclAt) invalid();
  if (dclAt - started > 18000 || now >= started + 20000) throw new ControlUnavailable('article-timeout');
  return Math.max(0, dclAt + 2000 - now);
}
export function requestDecision(value, scope) {
  const URLS = checkedCases(scope).map(c => c.url), ORIGINS = URLS.map(u => new URL(u).origin);
  const a = record(value, ['url', 'method', 'resourceType']);
  if (typeof a.url !== 'string' || a.url.length > 4096 || !a.url.isWellFormed() || !['GET', 'HEAD'].includes(a.method) || a.resourceType !== 'Document') return 'blocked-method-or-type';
  let u; try { u = new URL(a.url); } catch { return 'blocked-url'; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !ORIGINS.includes(u.origin)) return 'blocked-host';
  let path; try { path = decodeURIComponent(u.pathname).normalize('NFKC'); } catch { return 'blocked-encoded-path'; }
  if (/[%\\?#\p{Cc}\p{Cf}\p{White_Space}]/u.test(path)) return 'blocked-encoded-path';
  if (/\/(?:signin|login|logout|accounts?|oauth|authorize)(?:\/|$)|(?:^|:)UserLogin(?:$|[/?])/iu.test(path) || /(?:^|&)(?:action|title)=(?:login|logout|Special%3AUserLogin)(?:&|$)/iu.test(u.search.slice(1))) return 'blocked-account';
  if (/\/(?:api\/stats|gen_204|generate_204|beacon|event)(?:\/|$)/iu.test(path)) return 'blocked-telemetry';
  if (a.resourceType === 'Document' && !URLS.includes(u.href)) return 'blocked-document';
  return 'allowed';
}
const documentGates = new WeakMap();
function documentId(v) { text(v,160); if(!v || /[\p{Cc}\p{Cf}\p{White_Space}]/u.test(v))invalid(); return v; }
export function createDocumentRequestGate(value) {
  const a=record(value,['expectedUrl','frameId','setupCompleted']);text(a.expectedUrl,2048);documentId(a.frameId);
  if(a.setupCompleted!==true)invalid();
  let u;try{u=new URL(a.expectedUrl);}catch{invalid();}
  if(u.href!==a.expectedUrl||u.protocol!=='https:'||u.username||u.password||u.port||u.hash)invalid();
  const handle=Object.freeze({});documentGates.set(handle,{...a,active:true,admission:null,responseSeen:false});return handle;
}
function gateState(handle){if(!handle||types.isProxy(handle)||!documentGates.has(handle))invalid();return documentGates.get(handle);}
export function closeDocumentRequestGate(handle){gateState(handle).active=false;}
export function admitDocumentRequest(handle,value){
  const state=gateState(handle),a=record(value,['url','method','resourceType','frameId','requestId','networkId']);
  if(!state.active||state.admission||a.resourceType!=='Document'||!['GET','HEAD'].includes(a.method)||a.url!==state.expectedUrl||a.frameId!==state.frameId)return false;
  try{documentId(a.requestId);documentId(a.networkId);}catch{return false;}
  // Synchronous reservation precedes Fetch.continueRequest and any awaited RPC.
  state.admission=freeze({fetchRequestId:a.requestId,networkId:a.networkId,frameId:a.frameId,url:a.url});
  return state.admission;
}
export function matchesDocumentNetworkResponse(handle,value){
  const state=gateState(handle),a=record(value,['url','frameId','networkId']),admitted=state.admission;
  return Boolean(state.active&&admitted&&a.url===admitted.url&&a.frameId===admitted.frameId&&a.networkId===admitted.networkId);
}
export function admitDocumentResponse(handle,value){
  const state=gateState(handle),a=record(value,['url','frameId','networkId','requestId']);
  if(state.responseSeen||!matchesDocumentNetworkResponse(handle,{url:a.url,frameId:a.frameId,networkId:a.networkId}))return false;
  try{documentId(a.requestId);}catch{return false;}
  state.responseSeen=true;
  return freeze({fetchRequestId:state.admission.fetchRequestId,fetchResponseId:a.requestId,networkId:a.networkId});
}
export function safeRequestHeaders(input) {
  if (!input || typeof input !== 'object' || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length > 64) invalid();
  let bytes = 0; const out = [];
  for (const name of Reflect.ownKeys(input)) {
    if (typeof name !== 'string' || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/iu.test(name)) invalid();
    const d = Object.getOwnPropertyDescriptor(input, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    const value = text(d.value, 8192); if (/[\r\n]/u.test(value) || (bytes += Buffer.byteLength(name + value)) > 16384) invalid();
    if (!/^(?:cookie|authorization|proxy-authorization)$/iu.test(name)) out.push({ name, value });
  } return out;
}
export function headerPolicy(value) {
  const a = record(value, ['xRobotsTag', 'tdmReservation']);
  try {
    const xs = dense(a.xRobotsTag, 32); let n = 0;
    for (const x of xs) { text(x, 4096); if ((n += Buffer.byteLength(x)) > 4096 || /[\r\n]/u.test(x)) throw new ControlUnavailable('page-header-malformed'); }
    if (a.tdmReservation !== null) text(a.tdmReservation, 32);
    const robots = parseXRobotsDirectives(xs), tdm = a.tdmReservation === null ? null : parseTdmReservation(a.tdmReservation);
    if (a.tdmReservation !== null && tdm === null) throw new ControlUnavailable('page-header-malformed');
    if (robots.blocked || tdm === 1) throw new ControlUnavailable('page-header-restricted');
    return freeze({ nofollow: robots.nofollow, tdmReservation: tdm, headersSha256: sha(JSON.stringify(a)) });
  } catch (e) { if (genuine(e,ControlUnavailable)) throw e; throw new ControlUnavailable('page-header-malformed'); }
}
export function browserHeaderPolicy(headers) {
  const xs = []; let tdm = null, bytes = 0;
  for (const row of dense(headers, 64)) {
    const a = record(row, ['name', 'value']); text(a.name, 256); text(a.value, 8192);
    if (/[\r\n]/u.test(a.name + a.value) || (bytes += Buffer.byteLength(a.name + a.value)) > 16384) throw new ControlUnavailable('page-header-malformed');
    if (a.name.toLowerCase() === 'x-robots-tag') xs.push(a.value);
    if (a.name.toLowerCase() === 'tdm-reservation') { if (tdm !== null) throw new ControlUnavailable('page-header-malformed'); tdm = a.value; }
  } return headerPolicy({ xRobotsTag: xs, tdmReservation: tdm });
}
export function validateMainResponse(value, scope) {
  const URLS = checkedCases(scope).map(c => c.url);
  const a = record(value, ['expectedUrl', 'frameId', 'loaderId', 'paused', 'network']);
  if (!URLS.includes(a.expectedUrl)) invalid(); text(a.frameId, 128); text(a.loaderId, 128);
  if (!a.frameId || !a.loaderId) throw new ControlFatal('response-integrity');
  const p = record(a.paused, ['url', 'status', 'headers', 'networkId', 'frameId']);
  const n = record(a.network, ['url', 'status', 'requestId', 'frameId', 'loaderId', 'remoteAddress', 'securityState', 'mimeType']);
  if (p.url !== a.expectedUrl || n.url !== a.expectedUrl || p.frameId !== a.frameId || n.frameId !== a.frameId || n.loaderId !== a.loaderId || !p.networkId || p.networkId !== n.requestId || n.status !== p.status) throw new ControlFatal('response-integrity');
  if (!Number.isInteger(p.status) || p.status < 200 || p.status >= 300) throw new ControlUnavailable('document-response-refused');
  if (!isGlobalPublicAddress(n.remoteAddress) || n.securityState !== 'secure') throw new ControlFatal('response-integrity');
  if (!['text/html', 'application/xhtml+xml'].includes(n.mimeType)) throw new ControlUnavailable('document-response-refused');
  const h = browserHeaderPolicy(p.headers);
  return freeze({ status: p.status, frameId: a.frameId, loaderId: a.loaderId, networkRequestId: n.requestId, exactFinalUrl: true, observedRemoteAddressPublic: true, ordinaryTlsSecure: true, ...h });
}
export function summarizeCapture(value) {
  const a = record(value, ['title', 'text', 'extractorVersion']); text(a.title, 200); text(a.text, 4096);
  if (!a.text.trim() || !['main-text-prefix/v1', 'article-container-prefix/v1', 'crawler-static-html-prefix/v1'].includes(a.extractorVersion)) invalid();
  const prefix = s => { let v = s.slice(0, 160); if (!v.isWellFormed()) v = v.slice(0, -1); return v; };
  return freeze({ titlePrefix: prefix(a.title), titleCharacters: a.title.length, titleSha256: sha(a.title), bodyPrefix: prefix(a.text), bodyCharacters: a.text.length, bodySha256: sha(a.text), extractorVersion: a.extractorVersion });
}
export function validateBrowserSnapshot(value, scope) {
  const URLS = checkedCases(scope).map(c => c.url);
  const a = record(value, ['expectedUrl', 'capture', 'document', 'responseWitness', 'frameId', 'loaderId', 'navigationId']);
  if (!URLS.includes(a.expectedUrl) || !a.navigationId || !a.responseWitness || a.responseWitness.frameId !== a.frameId || a.responseWitness.loaderId !== a.loaderId || a.responseWitness.exactFinalUrl !== true) throw new ControlFatal('response-integrity');
  const d = record(a.document, ['url', 'canonicalUrl', 'robots', 'tdm', 'complete']);
  if (d.complete !== true) throw new ControlUnavailable('document-dom-capacity');
  if (d.url !== a.expectedUrl) throw new ControlUnavailable('document-identity-unavailable');
  text(d.canonicalUrl, 2048); const xs = dense(d.robots, 32), ts = dense(d.tdm, 32);
  try { headerPolicy({ xRobotsTag: xs, tdmReservation: null }); for (const v of ts) if (v !== '0') throw new Error(); }
  catch { throw new ControlUnavailable('document-dom-restricted'); }
  const status = a.capture && !types.isProxy(a.capture) && Object.getOwnPropertyDescriptor(a.capture, 'status');
  if (!status || !Object.hasOwn(status, 'value')) invalid();
  if (status.value === 'unsupported') {
    const c = record(a.capture, ['contractVersion', 'status', 'reason']);
    if (c.contractVersion !== 'page-content/1' || !['document-mismatch', 'missing-region', 'capture-budget', 'rights-restricted', 'invalid-content', 'capture-time-budget', 'capture-node-budget', 'capture-head-budget', 'capture-attribute-budget', 'capture-failed'].includes(c.reason)) invalid();
    return freeze({ status: 'unavailable', reason: 'reader-unsupported', readerReason: c.reason });
  }
  const c = record(a.capture, ['contractVersion', 'status', 'url', 'title', 'text', 'extractorVersion']);
  if (c.contractVersion !== 'page-content/1' || c.status !== 'collected' || c.url !== a.expectedUrl || c.extractorVersion === 'crawler-static-html-prefix/v1') invalid();
  return freeze({ status: 'collected', reason: null, capture: summarizeCapture({ title: c.title, text: c.text, extractorVersion: c.extractorVersion }),
    documentWitness: { frameId: a.frameId, loaderId: a.loaderId, navigationId: a.navigationId, exactDocumentUrl: true,
      canonicalUrlSha256: d.canonicalUrl ? sha(d.canonicalUrl) : null, canonicalEqualsExpected: d.canonicalUrl === a.expectedUrl, domDirectivesChecked: true }, responseWitness: a.responseWitness });
}
const DNS_CAUSES=new Set(['ENOTFOUND','EAI_AGAIN']);
const SOCKET_CAUSES=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','ERR_STREAM_PREMATURE_CLOSE']);
const DECODE_CAUSES=new Set(['ERR_BUFFER_TOO_LARGE','Z_DATA_ERROR','Z_BUF_ERROR']);
const UTF8_CAUSES=new Set(['ERR_ENCODING_INVALID_ENCODED_DATA']);
const CAUSE_CODES=new Set([...DNS_CAUSES,...SOCKET_CAUSES,...DECODE_CAUSES,...UTF8_CAUSES]);
const FETCH_CODES=new Set(['timeout','http-status','dns-failed','network-failed','response-aborted','body-too-large','headers-too-large','compression-ratio','content-type','content-encoding','character-encoding',
 'invalid-headers','content-length','remote-address','invalid-url','invalid-host','dns-invalid','dns-non-public','dns-pin','redirect-location','aborted']);
function ownData(v,k){if(!v||typeof v!=='object'||types.isProxy(v))return {valid:false};const d=Object.getOwnPropertyDescriptor(v,k);return d===undefined?{valid:true,present:false}:{valid:Object.hasOwn(d,'value'),present:true,value:d.value};}
export function projectFetchRefusal(error,value){
 const c=record(value,['phase','batch','caseOrdinal','originOrdinal','stage']);
 if(!['static','browser'].includes(c.phase)||!Number.isInteger(c.batch)||c.batch<1||c.batch>8||!Number.isInteger(c.originOrdinal)||c.originOrdinal<1||c.originOrdinal>4||!['robots','tdmrep','page'].includes(c.stage))invalid();
 if(c.stage==='page'?(c.phase!=='static'||!Number.isInteger(c.caseOrdinal)||c.caseOrdinal<(c.batch-1)*4+1||c.caseOrdinal>c.batch*4):c.caseOrdinal!==null)invalid();
 let errorFamily='other',code='other',causeCode=null,status,disposition='fatal',reason='unhandled-transport';
 if(error&&!types.isProxy(error)&&genuine(error,PublicFetchError)){
  errorFamily='public-fetch';const d=ownData(error,'code'),cause=ownData(error,'cause'),s=ownData(error,'status');
  if(d.valid&&d.present&&FETCH_CODES.has(d.value))code=d.value;
  let validCause=cause.valid,rawCause=null;
  if(cause.present){const nested=ownData(cause.value,'code');validCause=validCause&&nested.valid&&nested.present&&typeof nested.value==='string';rawCause=nested.value;causeCode=validCause&&CAUSE_CODES.has(rawCause)?rawCause:'other';}
  if(s.valid&&s.present&&Number.isInteger(s.value)&&s.value>=100&&s.value<=599)status=s.value;
  const absentCause=validCause&&!cause.present;
  const allowed=(code==='timeout'&&absentCause)||(code==='http-status'&&absentCause&&status!==undefined&&status!==200)||
   (code==='dns-failed'&&validCause&&DNS_CAUSES.has(rawCause))||(code==='network-failed'&&validCause&&SOCKET_CAUSES.has(rawCause))||
   (['response-aborted','body-too-large','headers-too-large','compression-ratio','content-type'].includes(code)&&absentCause)||
   (code==='content-encoding'&&validCause&&(!cause.present||DECODE_CAUSES.has(rawCause)))||
   (code==='character-encoding'&&validCause&&(!cause.present||UTF8_CAUSES.has(rawCause)));
  if(allowed&&s.valid){
   disposition='unavailable';const page=c.stage==='page';
   reason=code==='timeout'?(page?'article-timeout':'origin-policy-timeout'):code==='http-status'?(page?'article-http-refused':'origin-policy-http-refused'):
    ['dns-failed','network-failed','response-aborted'].includes(code)?(page?'article-transport-unavailable':'origin-transport-unavailable'):
    code==='body-too-large'&&page?'article-transport-capacity':page?'article-representation-unavailable':'origin-representation-unavailable';
   if(!page&&code==='http-status'&&[404,410].includes(status)){disposition='policy-absence';reason=null;}
  }
 }else if(error&&!types.isProxy(error)&&genuine(error,ControlFatal)){errorFamily='control';const d=ownData(error,'code');if(d.valid&&FATAL.has(d.value)){code=d.value;reason=d.value;}}
 return freeze({...c,disposition,errorFamily,code,causeCode,...(status===undefined?{}:{status}),reason});
}
// Observation never grants input or changes failure disposition. Native Promise
// rejections are consumed without evaluating arbitrary thenables/accessors.
function emitDiagnostic(sink,event){try{const result=sink(event);if(types.isPromise(result))Promise.prototype.then.call(result,undefined,()=>{});}catch{}}
export function browserTransportReason(errorText){
 return typeof errorText==='string'&&['net::ERR_NAME_NOT_RESOLVED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_TIMED_OUT','net::ERR_TIMED_OUT','net::ERR_ADDRESS_UNREACHABLE'].includes(errorText)?'browser-transport-unavailable':null;
}
export function projectBrowserRefusal(errorText,value){
 const c=record(value,['phase','batch','caseOrdinal','originOrdinal','stage']);
 if(c.phase!=='browser'||c.stage!=='browser-document'||!Number.isInteger(c.batch)||c.batch<1||c.batch>8||
  !Number.isInteger(c.caseOrdinal)||c.caseOrdinal<(c.batch-1)*4+1||c.caseOrdinal>c.batch*4||!Number.isInteger(c.originOrdinal)||c.originOrdinal<1||c.originOrdinal>4)invalid();
 const reason=browserTransportReason(errorText);
 return freeze({...c,disposition:reason?'unavailable':'fatal',errorFamily:'chrome-network',code:reason?errorText.slice(5):'other',causeCode:null,reason:reason??'unhandled-transport'});
}
export function classifyBrowserLoadingFailure(value){
 const a=record(value,['expectedSession','session','expectedFrame','admission','requestId','resourceType','errorText','teardown','deliberatelyBlocked']);
 if(typeof a.teardown!=='boolean'||typeof a.deliberatelyBlocked!=='boolean')invalid();
 if(a.teardown||a.deliberatelyBlocked)return freeze({disposition:'ignored',reason:'own-teardown-or-blocked'});
 let admitted=null;if(a.admission!==null)admitted=record(a.admission,['fetchRequestId','networkId','frameId','url']);
 if(!admitted||typeof a.expectedSession!=='string'||!a.expectedSession||typeof a.expectedFrame!=='string'||!a.expectedFrame||
  a.session!==a.expectedSession||a.requestId!==admitted.networkId||admitted.frameId!==a.expectedFrame||a.resourceType!=='Document')
  return freeze({disposition:'fatal',reason:'response-integrity'});
 const reason=browserTransportReason(a.errorText);
 return freeze({disposition:reason?'unavailable':'fatal',reason:reason??'unhandled-transport'});
}

export function checkedCases(value) {
  const cases = dense(value, 4); if (cases.length !== 4) invalid();
  const ids = new Set(), urls = new Set();
  return freeze(cases.map(raw => {
    const c = record(raw, ['id', 'groupId', 'url', 'language']);
    text(c.id, 160); text(c.groupId, 160); text(c.url, 2048);
    let u; try { u = new URL(c.url); } catch { invalid(); }
    if (u.href !== c.url || u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash ||
      !/^[a-z0-9.-]+$/u.test(u.hostname) || ids.has(c.id) || urls.has(c.url) || !['en','de','fr','es','nl'].includes(c.language)) invalid();
    ids.add(c.id); urls.add(c.url); return c;
  }));
}
export async function collectOriginPolicies({ cases: input, fetchPublic = createPublicFetcher(), clock = () => performance.now(),
  sleep = ms => new Promise(r => setTimeout(r, ms)), signal, guard = () => {}, browser = false, batch=1, onDiagnostic=()=>{}, onStage=()=>{} } = {}) {
  const cases = checkedCases(input), started = clock(), limit = browser ? 60000 : 240000, deadline = started + limit;
  if(!Number.isInteger(batch)||batch<1||batch>8)invalid();
  const originOrder=[...new Set(cases.map(c=>new URL(c.url).origin))];
  const last = new Map(), origins = new Map(), entries = new Map(), requests = [];
  const check = () => { guard(); if (signal?.aborted) throw new ControlFatal('aborted'); };
  async function fetchOne(url, kind, crawlDelay = 2000) {
    check(); const origin = new URL(url).origin, pause = Math.max(0, (last.get(origin) ?? -Infinity) + Math.max(2000, crawlDelay) - clock());
    if (clock() + pause >= deadline) throw new ControlUnavailable('origin-policy-budget');
    if (pause) await sleep(pause); check();
    if (clock() >= deadline) throw new ControlUnavailable('origin-policy-budget');
    if (requests.length >= 8) throw new ControlFatal('request-capacity');
    last.set(origin, clock()); requests.push({ origin, kind });
    const context=freeze({phase:browser?'browser':'static',batch,caseOrdinal:null,originOrdinal:originOrder.indexOf(origin)+1,stage:kind});
    emitDiagnostic(onStage,context);
    try {
      const r = await fetchPublic(url, { resourceKind: kind, signal, timeoutMs: Math.min(browser ? 5000 : 15000, Math.max(1, Math.floor(deadline - clock()))) }); check();
      if (clock() >= deadline) { r?.body?.fill?.(0); throw new ControlUnavailable('origin-policy-budget'); }
      if (r.kind !== 'content' || r.finalUrl !== url || r.status !== 200 || typeof r.text !== 'string' || !Buffer.isBuffer(r.body)) { r?.body?.fill?.(0); throw new ControlUnavailable('origin-policy-http-refused'); }
      return r;
    } catch (e) {
      check(); if (genuine(e,ControlUnavailable)) throw e;
      const diagnostic=projectFetchRefusal(e,context);emitDiagnostic(onDiagnostic,diagnostic);
      if(diagnostic.disposition==='policy-absence')return null;
      if(diagnostic.disposition==='unavailable')throw new ControlUnavailable(diagnostic.reason);
      throw new ControlFatal(diagnostic.reason);
    }
  }
  for (const c of cases) {
    const origin = new URL(c.url).origin; check();
    if (!origins.has(origin)) {
      try {
        const rr = await fetchOne(origin + '/robots.txt', 'robots'); let parsed;
        try { parsed = parseRobotsWithKnownDenySpaceRepair({ origin, text: rr?.text ?? '', rawBytes: rr?.body ?? Buffer.alloc(0) }); }
        finally { rr?.body?.fill(0); }
        const tdmUrl = tdmRepUrlFor(c.url), tr = evaluateRobots(parsed.robots, tdmUrl);
        if (!tr.allowed) throw new ControlUnavailable('origin-robots-denied');
        const td = await fetchOne(tdmUrl, 'tdmrep', tr.crawlDelayMs); let tdm = null, tdmHash = null;
        try { if (td) { tdmHash = sha(td.text); tdm = parseTdmRepJson(td.text); } } finally { td?.body?.fill(0); }
        origins.set(origin, { parsed, tdm, tdmHash, robotsAbsent: rr === null, tdmAbsent: td === null });
      } catch (e) {
        check(); if (genuine(e,CrawlerPolicyError)) e = new ControlUnavailable('origin-policy-malformed');
        const p = failureProjection(e); if (p.kind !== 'unavailable') throw e;
        origins.set(origin, { status: 'unavailable', reason: p.reason });
      }
    }
    const cached = origins.get(origin);
    if (cached.status === 'unavailable') { entries.set(c.url, cached); continue; }
    try {
      const robots = evaluateRobots(cached.parsed.robots, c.url), reservation = cached.tdm ? matchTdmRep(cached.tdm, c.url).reservation : null;
      if (!robots.allowed) throw new ControlUnavailable('origin-robots-denied');
      if (reservation === 1) throw new ControlUnavailable('origin-tdm-reserved');
      const receipt = freeze({ origin, ...cached.parsed.receipt, robotsAbsent: cached.robotsAbsent, tdmAbsent: cached.tdmAbsent,
        tdmSha256: cached.tdmHash, robotsAllowed: true, crawlDelayMs: robots.crawlDelayMs, tdmDocumentReservation: reservation });
      entries.set(c.url, { status: 'eligible', receipt, receiptSha256: sha(JSON.stringify(receipt)) });
    } catch (e) { check(); const p = failureProjection(e); if (p.kind !== 'unavailable') throw e; entries.set(c.url, { status: 'unavailable', reason: p.reason }); }
  }
  let readyAt = clock();
  for (const [url,p] of entries) if (p.status === 'eligible') {
    const due = last.get(new URL(url).origin) + Math.max(2000,p.receipt.crawlDelayMs);
    if (due >= deadline) entries.set(url,{status:'unavailable',reason:'origin-policy-budget'}); else readyAt = Math.max(readyAt,due);
  }
  if (readyAt > clock()) await sleep(readyAt-clock()); check();
  if (clock() >= deadline) for (const [url,p] of entries) if (p.status === 'eligible') entries.set(url,{status:'unavailable',reason:'origin-policy-budget'});
  const elapsedMs = clock()-started; let spacingMs = 0;
  return { entries, requests, elapsedMs, async beforePage(url) {
    check(); const p = entries.get(url); if (!p || p.status !== 'eligible') invalid();
    const origin = new URL(url).origin, pause = Math.max(0,last.get(origin)+Math.max(2000,p.receipt.crawlDelayMs)-clock());
    if ((browser ? elapsedMs : 0)+spacingMs+pause >= (browser ? 60000 : 60000)) throw new ControlUnavailable('origin-policy-budget');
    if (pause) { await sleep(pause); spacingMs += pause; } check(); last.set(origin,clock()); return pause;
  }, get spacingMs() { return spacingMs; } };
}
export async function collectStaticControls({ cases: input, fetchPublic = createPublicFetcher(), clock = () => performance.now(),
  sleep = ms => new Promise(r => setTimeout(r,ms)), signal, guard = () => {}, onInput = () => {}, onProgress = () => {}, batch=1,onDiagnostic=()=>{},onStage=()=>{} } = {}) {
  const inputCases = checkedCases(input), policies = await collectOriginPolicies({ cases: inputCases, fetchPublic, clock, sleep, signal, guard,batch,onDiagnostic,onStage });
  const originOrder=[...new Set(inputCases.map(c=>new URL(c.url).origin))];
  const cases = []; let pageRequests = 0;
  for (const c of inputCases) {
    guard(); if (signal?.aborted) throw new ControlFatal('aborted');
    const p = policies.entries.get(c.url), row = { ...c, rightsTransportEligible:false,status:'unavailable',reason:p.reason ?? null };
    if (p.status !== 'eligible') { cases.push(row); onProgress(freeze({...row})); continue; }
    let response;
    const context=freeze({phase:'static',batch,caseOrdinal:(batch-1)*4+inputCases.indexOf(c)+1,originOrdinal:originOrder.indexOf(new URL(c.url).origin)+1,stage:'page'});
    try {
      await policies.beforePage(c.url); guard(); if (signal?.aborted) throw new ControlFatal('aborted');
      emitDiagnostic(onStage,context);
      pageRequests++; response = await fetchPublic(c.url,{resourceKind:'page',signal,timeoutMs:15000}); guard();
      if (response.kind !== 'content') throw new ControlUnavailable('article-redirect-refused');
      if (response.finalUrl !== c.url || response.status !== 200 || !Buffer.isBuffer(response.body) ||
        response.body.length > PUBLIC_FETCH_POLICY.maxDecompressedBytes || typeof response.text !== 'string') throw new ControlFatal('response-integrity');
      const h = headerPolicy({xRobotsTag:response.headers.xRobotsTag,tdmReservation:response.headers.tdmReservation}); let current;
      try { current = captureStaticHtml(response.text,c.url); } catch(e) { if (!(e instanceof TypeError)) throw e; throw new ControlUnavailable('static-policy-parse-unavailable'); }
      if (current.directives.tdmReservationInvalid) throw new ControlUnavailable('static-policy-parse-unavailable');
      if (current.directives.noindex || current.directives.tdmReservation === 1) throw new ControlUnavailable('page-header-restricted');
      guard(); if(signal?.aborted) throw new ControlFatal('aborted');
      const pagePolicy = {...h,domDirectivesChecked:true};
      Object.assign(row,{rightsTransportEligible:true,originPolicy:p.receipt,originPolicyHash:p.receiptSha256,
        htmlSha256:sha(response.body),decodedHtmlSha256:sha(response.text),pagePolicy,
        status:current.eligible?'collected':'unavailable',reason:current.eligible?null:'static-insufficient-text'});
      if(current.eligible) {
        row.capture = summarizeCapture({title:current.title,text:current.text,extractorVersion:current.extractorVersion});
        const responseWitness = {finalUrlHash:sha(c.url),status:response.status,htmlSha256:row.htmlSha256,
          decodedHtmlSha256:row.decodedHtmlSha256,pagePolicyHash:sha(JSON.stringify(pagePolicy))};
        row.responseWitnessHash=sha(JSON.stringify(responseWitness));
        onInput({id:c.id,groupId:c.groupId,url:c.url,title:current.title,body:current.text,extractorVersion:current.extractorVersion,
          documentWitness:{kind:'static-response',finalUrlHash:sha(c.url),responseWitnessHash:row.responseWitnessHash},
          originPolicyHash:p.receiptSha256,pagePolicyHash:responseWitness.pagePolicyHash});
      }
    } catch(e) {
      guard(); if(signal?.aborted) throw new ControlFatal('aborted');
      if(genuine(e,ControlUnavailable))row.reason=e.code;
      else{const diagnostic=projectFetchRefusal(e,context);emitDiagnostic(onDiagnostic,diagnostic);
       if(diagnostic.disposition!=='unavailable')throw new ControlFatal(diagnostic.reason);row.reason=diagnostic.reason;}
    } finally { response?.body?.fill?.(0); }
    cases.push(row); onProgress(freeze({...row}));
  }
  return freeze({cases,policyRequests:policies.requests,policyElapsedMs:policies.elapsedMs,spacingMs:policies.spacingMs,pageRequests,
    denominator:4,eligibleCases:cases.filter(r=>r.rightsTransportEligible).length,collectedCases:cases.filter(r=>r.status==='collected').length});
}
