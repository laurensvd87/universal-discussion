// ADR179 fresh four-case origin policies. No page fetch/capture on import.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {createPublicFetcher,PublicFetchError,PUBLIC_FETCH_POLICY} from '../../../../../apps/local-service/src/crawler/public-fetch.js';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';
import {evaluateRobots,parseTdmRepJson,matchTdmRep,tdmRepUrlFor,CrawlerPolicyError} from '../../../../../apps/local-service/src/crawler/robots.js';
import {parseRobotsWithKnownDenySpaceRepair} from '../../../../../apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js';
import {ControlUnavailable,ControlFatal,failureProjection} from '../../current-producer-final-v2/policy.js';
const sha=v=>createHash('sha256').update(v).digest('hex');

const ORIGIN_FATAL=new Set(['invalid-contract','absolute-job-deadline','aborted','unhandled-transport','source-integrity','response-integrity','request-capacity','callback-failed','protocol-failed','setup-deadline','navigation-transport-failure','unsettled-callbacks','diagnostic-capacity']);
function exactRecord(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)invalid();const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=d.value;}return out;}
const DNS_CAUSES=new Set(['ENOTFOUND','EAI_AGAIN']);
const SOCKET_CAUSES=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','ERR_STREAM_PREMATURE_CLOSE']);
const DECODE_CAUSES=new Set(['ERR_BUFFER_TOO_LARGE','Z_DATA_ERROR','Z_BUF_ERROR']);
const UTF8_CAUSES=new Set(['ERR_ENCODING_INVALID_ENCODED_DATA']);
const CAUSE_CODES=new Set([...DNS_CAUSES,...SOCKET_CAUSES,...DECODE_CAUSES,...UTF8_CAUSES]);
const FETCH_CODES=new Set(['timeout','http-status','dns-failed','network-failed','response-aborted','body-too-large','headers-too-large','compression-ratio','content-type','content-encoding','character-encoding',
 'invalid-headers','content-length','remote-address','invalid-url','invalid-host','dns-invalid','dns-non-public','dns-pin','redirect-location','aborted']);
function ownData(v,k){if(!v||typeof v!=='object'||types.isProxy(v))return {valid:false};const d=Object.getOwnPropertyDescriptor(v,k);return d===undefined?{valid:true,present:false}:{valid:Object.hasOwn(d,'value'),present:true,value:d.value};}
function projectOriginRefusal(error,value){
 const c=exactRecord(value,['phase','batch','caseOrdinal','originOrdinal','stage']);
 if(!['static','browser'].includes(c.phase)||!Number.isInteger(c.batch)||c.batch<1||c.batch>24||!Number.isInteger(c.originOrdinal)||c.originOrdinal<1||c.originOrdinal>4||!['robots','tdmrep','page'].includes(c.stage))invalid();
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
 }else if(error&&!types.isProxy(error)&&genuine(error,ControlFatal)){errorFamily='control';const d=ownData(error,'code');if(d.valid&&ORIGIN_FATAL.has(d.value)){code=d.value;reason=d.value;}}
 return freeze({...c,disposition,errorFamily,code,causeCode,...(status===undefined?{}:{status}),reason});
}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const invalid=()=>{throw new ControlFatal('invalid-contract');};
const genuine=(e,C)=>!types.isProxy(e)&&types.isNativeError(e)&&Object.getPrototypeOf(e)===C.prototype;
function emitDiagnostic(sink,event){try{const r=sink(event);if(types.isPromise(r))Promise.prototype.then.call(r,()=>undefined,()=>undefined);}catch{}}
function checkedCases(value){if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length!==4||Reflect.ownKeys(value).length!==5)invalid();
 const ids=new Set(),urls=new Set();return Array.from({length:4},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();const raw=d.value;
 if(!raw||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==4)invalid();const c={};
 for(const k of ['id','groupId','url','language']){const p=Object.getOwnPropertyDescriptor(raw,k);if(!p?.enumerable||!Object.hasOwn(p,'value')||typeof p.value!=='string')invalid();c[k]=p.value;}
 if(!/^[A-Za-z0-9._:-]{1,160}$/u.test(c.id)||!c.groupId.length||c.groupId.length>160||c.url.length>2048||!['en','de','nl','fr','es'].includes(c.language))invalid();
 const u=new URL(c.url),p=inspectPageUrl(c.url);if(!p.supported||p.url!==c.url||u.protocol!=='https:'||u.href!==c.url||u.username||u.password||u.hash||ids.has(c.id)||urls.has(c.url))invalid();ids.add(c.id);urls.add(c.url);return c;});}
export async function collectOriginPolicies({ cases: input, fetchPublic = createPublicFetcher(), clock = () => performance.now(),
  sleep = ms => new Promise(r => setTimeout(r, ms)), signal, guard = () => {}, browser = false, batch=1, onDiagnostic=()=>{}, onStage=()=>{} } = {}) {
  const cases = checkedCases(input), started = clock(), limit = 60000, deadline = started + limit;
  if(!Number.isInteger(batch)||batch<1||batch>24)invalid();
  const originOrder=[...new Set(cases.map(c=>new URL(c.url).origin))];
  const last = new Map(), origins = new Map(), entries = new Map(), requests = [];
  const check = () => { guard();const n=clock();if(!Number.isFinite(n)||n<started)throw new ControlFatal('invalid-contract');if (signal?.aborted) throw new ControlFatal('aborted'); };
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
      const r = await fetchPublic(url, { resourceKind: kind, signal, timeoutMs: Math.min(5000, Math.max(1, Math.floor(deadline - clock()))) }); check();
      if (clock() >= deadline) { r?.body?.fill?.(0); throw new ControlUnavailable('origin-policy-budget'); }
      if (r.kind !== 'content' || r.finalUrl !== url || r.status !== 200 || typeof r.text !== 'string' || !Buffer.isBuffer(r.body)) { r?.body?.fill?.(0); throw new ControlUnavailable('origin-policy-http-refused'); }
      if(r.body.length>PUBLIC_FETCH_POLICY.maxDecompressedBytes||r.text.length>PUBLIC_FETCH_POLICY.maxDecompressedBytes){r.body.fill(0);throw new ControlFatal('response-integrity');}
      return r;
    } catch (e) {
      check(); if (genuine(e,ControlUnavailable)) throw e;
      const diagnostic=projectOriginRefusal(e,context);emitDiagnostic(onDiagnostic,diagnostic);
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

