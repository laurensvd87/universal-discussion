import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicFetchError } from '../../../../apps/local-service/src/crawler/public-fetch.js';
import { sha, ControlFatal, ControlUnavailable, failureProjection, remaining, articleObservationDue,
  requestDecision, safeRequestHeaders, headerPolicy, browserHeaderPolicy, validateMainResponse, validateBrowserSnapshot,
  summarizeCapture, collectOriginPolicies, collectStaticControls, createDocumentRequestGate, closeDocumentRequestGate,
  admitDocumentRequest, admitDocumentResponse, matchesDocumentNetworkResponse, projectFetchRefusal, projectBrowserRefusal, browserTransportReason, classifyBrowserLoadingFailure } from './policy.js';
const CONTROLS=Object.freeze(['en','de','nl','fr'].map((language,i)=>Object.freeze({id:'fixture-'+i,groupId:'family-'+i,language,url:'https://'+language+'.wikipedia.org/wiki/Fixture'+i})));
const URLS=CONTROLS.map(c=>c.url),ORIGINS=URLS.map(u=>new URL(u).origin);
const scopedRequest=(v)=>requestDecision(v,CONTROLS), scopedResponse=v=>validateMainResponse(v,CONTROLS), scopedSnapshot=v=>validateBrowserSnapshot(v,CONTROLS);
const request = (url = URLS[0], method = 'GET', resourceType = 'Document') => ({ url, method, resourceType });
const headers = { xRobotsTag: [], tdmReservation: null };
const prose = 'Invented control material describes a bounded subject without using any real article text. '.repeat(5);
function response(url, text, extras = {}) { return { kind: 'content', finalUrl: url, status: 200, text, body: Buffer.from(text), headers, ...extras }; }
function seam(change = () => {}) {
  let now = 0; const seen = [], buffers = [];
  const api = { cases: CONTROLS, clock: () => now, sleep: async n => { now += n; }, advance: n => { now += n; },
    fetchPublic: async (url, options) => {
      seen.push({ url, options }); const override = change(url, options, api); if (override !== undefined) return await override;
      if (options.resourceKind === 'robots') return response(url, 'User-agent: *\nAllow: /');
      if (options.resourceKind === 'tdmrep') throw new PublicFetchError('http-status', { status: 404 });
      const r = response(url, `<html><head><title>Invented control</title></head><main><p>${prose}</p></main></html>`); buffers.push(r.body); return r;
    }, seen, buffers };
  return api;
}
function mainResponse() {
  return { expectedUrl: URLS[0], frameId: 'frame-1', loaderId: 'loader-1',
    paused: { url: URLS[0], status: 200, headers: [], networkId: 'request-1', frameId: 'frame-1' },
    network: { url: URLS[0], status: 200, requestId: 'request-1', frameId: 'frame-1', loaderId: 'loader-1', remoteAddress: '208.80.154.224', securityState: 'secure', mimeType: 'text/html' } };
}
function snapshot() { return { expectedUrl: URLS[0], frameId: 'frame-1', loaderId: 'loader-1', navigationId: 'nav-1',
  responseWitness: scopedResponse(mainResponse()), document: { url: URLS[0], canonicalUrl: URLS[0], robots: [], tdm: [], complete: true },
  capture: { contractVersion: 'page-content/1', status: 'collected', url: URLS[0], title: 'Invented title', text: prose, extractorVersion: 'main-text-prefix/v1' } }; }

test('exact invented four-row scope and bounded literal read request policy', () => {
  assert.deepEqual(CONTROLS.map(c => c.language), ['en', 'de', 'nl', 'fr']); assert.equal(URLS.length, 4);
  for (const u of URLS) assert.equal(scopedRequest(request(u)), 'allowed');
  for (const u of ['https://en.wikipedia.org/wiki/Other', 'https://en.wikipedia.org/wiki/Tetris?x=1']) assert.equal(scopedRequest(request(u)), 'blocked-document');
  for (const u of ['http://en.wikipedia.org/wiki/Tetris', 'https://en.wikipedia.org.evil.invalid/', 'https://127.0.0.1/', 'https://localhost/', 'https://u:p@en.wikipedia.org/wiki/Tetris', 'https://en.wikipedia.org:444/']) assert.notEqual(scopedRequest(request(u)), 'allowed');
  for (const m of ['POST', 'OPTIONS', 'PUT', 'DELETE']) assert.equal(scopedRequest(request(URLS[0], m)), 'blocked-method-or-type');
  for (const t of ['Script','Stylesheet','XHR','Fetch','Other','Media', 'Image', 'Font', 'WebSocket', 'Worker', 'ServiceWorker']) assert.equal(scopedRequest(request(URLS[0], 'GET', t)), 'blocked-method-or-type');
  assert.equal(scopedRequest(request('https://en.wikipedia.org/w/load.php?modules=fixture', 'GET', 'Script')), 'blocked-method-or-type');
  assert.equal(scopedRequest(request('https://upload.wikimedia.org/a.js', 'GET', 'Script')), 'blocked-method-or-type');
});
test('encoded account routes, ambiguous encodings and telemetry stay blocked; headers strip credentials', () => {
  for (const p of ['/%73ignin', '/%6cogin', '/x%2Foauth', '/wiki/Special:UserLogin']) assert.equal(scopedRequest(request('https://en.wikipedia.org' + p)), 'blocked-account');
  for (const p of ['/%2573ignin', '/%GG', '/x%5Clogin']) assert.equal(scopedRequest(request('https://en.wikipedia.org' + p)), 'blocked-encoded-path');
  assert.equal(scopedRequest(request('https://en.wikipedia.org/gen_204')), 'blocked-telemetry');
  assert.deepEqual(safeRequestHeaders({ Cookie: 'discard', Authorization: 'discard', 'Proxy-Authorization': 'discard', Accept: 'text/html' }), [{ name: 'Accept', value: 'text/html' }]);
  assert.throws(() => safeRequestHeaders({ Accept: 'x\r\ny' }));
});
test('restricted browser blocks every external subresource and every cross-batch Document',()=>{
 for(const method of ['GET','HEAD'])for(const resourceType of ['Script','Stylesheet','XHR','Fetch','Other','Image','Media','Font','Worker','ServiceWorker','WebSocket'])
  assert.equal(scopedRequest(request(URLS[0],method,resourceType)),'blocked-method-or-type');
 assert.equal(scopedRequest(request('https://en.wikipedia.org/wiki/Fixture4')),'blocked-document');
 assert.equal(scopedRequest(request('https://outside.example/article')),'blocked-host');
});
const gateInput=()=>({expectedUrl:URLS[0],frameId:'known-main-frame',setupCompleted:true});
const documentRequest=()=>({url:URLS[0],method:'GET',resourceType:'Document',frameId:'known-main-frame',requestId:'fetch-request-1',networkId:'network-1'});
test('main-document gate reserves exactly one matching request synchronously before continuation',()=>{
 const gate=createDocumentRequestGate(gateInput()),request=documentRequest();
 assert.ok(Object.isFrozen(gate));
 const admitted=admitDocumentRequest(gate,request);assert.deepEqual(admitted,{fetchRequestId:'fetch-request-1',networkId:'network-1',frameId:'known-main-frame',url:URLS[0]});
 assert.equal(admitDocumentRequest(gate,request),false);
 assert.equal(admitDocumentRequest(gate,{...request,requestId:'reload-fetch',networkId:'reload-network'}),false);
 assert.ok(Object.isFrozen(admitted));
});
test('same-URL subframes, no network ID, wrong URL/method/type or pre-setup cannot consume admission',()=>{
 for(const change of [x=>x.frameId='same-url-iframe',x=>x.networkId='',x=>x.networkId=undefined,x=>x.requestId='',x=>x.url=URLS[1],x=>x.method='POST',x=>x.resourceType='Script']){
  const gate=createDocumentRequestGate(gateInput()),r=documentRequest();change(r);assert.equal(admitDocumentRequest(gate,r),false);
  assert.ok(admitDocumentRequest(gate,documentRequest()),'blocked request did not reserve slot');
 }
 for(const setupCompleted of [false,null,undefined,1])assert.throws(()=>createDocumentRequestGate({...gateInput(),setupCompleted}));
 assert.throws(()=>admitDocumentRequest(Object.freeze({}),documentRequest()));
});
test('own Network and Fetch response IDs bind admitted network/frame/url, without assuming Fetch ID equality',()=>{
 const gate=createDocumentRequestGate(gateInput()),r=documentRequest();admitDocumentRequest(gate,r);
 const response={url:r.url,frameId:r.frameId,networkId:r.networkId};
 for(const bad of [{...response,frameId:'iframe'},{...response,url:URLS[1]},{...response,networkId:'blocked-duplicate'}]){
  assert.equal(matchesDocumentNetworkResponse(gate,bad),false);
  assert.equal(admitDocumentResponse(gate,{...bad,requestId:'different-fetch-response-id'}),false);
 }
 assert.equal(matchesDocumentNetworkResponse(gate,response),true);
 assert.deepEqual(admitDocumentResponse(gate,{...response,requestId:'different-fetch-response-id'}),{fetchRequestId:r.requestId,fetchResponseId:'different-fetch-response-id',networkId:r.networkId});
 assert.equal(admitDocumentResponse(gate,{...response,requestId:'duplicate-response'}),false);
 closeDocumentRequestGate(gate);assert.equal(matchesDocumentNetworkResponse(gate,response),false);
 assert.equal(admitDocumentRequest(gate,documentRequest()),false);
 const late=createDocumentRequestGate(gateInput());closeDocumentRequestGate(late);assert.equal(admitDocumentRequest(late,documentRequest()),false);
});
test('gate schema rejects accessors and proxies without invoking untrusted callbacks',()=>{
 let calls=0;const gate=createDocumentRequestGate(gateInput()),p=new Proxy({},{get(){calls++;throw 0},ownKeys(){calls++;throw 0}});
 assert.throws(()=>admitDocumentRequest(p,documentRequest()));assert.throws(()=>admitDocumentRequest(gate,p));
 const r=documentRequest();Object.defineProperty(r,'networkId',{enumerable:true,get(){calls++;throw 0}});
 assert.throws(()=>admitDocumentRequest(gate,r));assert.equal(calls,0);
});
test('header reservations, scoped noindex and malformed duplicate TDM fail before retention', () => {
  assert.equal(headerPolicy(headers).tdmReservation, null);
  for (const x of ['noindex', 'noai', 'notrain', 'MurmingleTopicCrawler: none']) assert.throws(() => headerPolicy({ xRobotsTag: [x], tdmReservation: null }), e => e.code === 'page-header-restricted');
  for (const t of ['1', '', '01', '0, 1']) assert.throws(() => headerPolicy({ xRobotsTag: [], tdmReservation: t }));
  assert.throws(() => browserHeaderPolicy([{ name: 'TDM-Reservation', value: '0' }, { name: 'tdm-reservation', value: '0' }]));
  assert.throws(() => browserHeaderPolicy([{ name: 'X-Robots-Tag', value: 'a'.repeat(4097) }]));
});
test('response-before-snapshot requires matching own status, finalURL, request, frame and loader', () => {
  assert.equal(scopedResponse(mainResponse()).exactFinalUrl, true);
  for (const change of [x => x.network.loaderId = 'old-loader', x => x.network.frameId = 'subframe', x => x.paused.networkId = 'other-request',
    x => x.network.url = URLS[1], x => x.paused.url = URLS[1], x => x.network.status = 201, x => x.network.securityState = 'insecure', x => x.network.remoteAddress = '127.0.0.1', x => x.network.remoteAddress = '::1', x => x.network.remoteAddress = '10.0.0.1']) {
    const x = mainResponse(); change(x); assert.throws(() => scopedResponse(x), e => e instanceof ControlFatal);
  }
  const x = mainResponse(); x.network.status = x.paused.status = 403; assert.throws(() => scopedResponse(x), e => e.code === 'document-response-refused');
  for (const change of [s => s.responseWitness = null, s => s.loaderId = 'old', s => s.frameId = 'subframe']) { const s = snapshot(); change(s); assert.throws(() => scopedSnapshot(s)); }
});
test('snapshot DOM policies and exact document identity checked independently of response headers', () => {
  for (const change of [s => s.document.robots = ['noindex'], s => s.document.robots = ['notrain'], s => s.document.tdm = ['1'], s => s.document.tdm = ['garbage']]) {
    const s = snapshot(); change(s); assert.throws(() => scopedSnapshot(s), e => e.code === 'document-dom-restricted');
  }
  const a = snapshot(); a.document.complete = false; assert.throws(() => scopedSnapshot(a), e => e.code === 'document-dom-capacity');
  const b = snapshot(); b.document.url = URLS[1]; assert.throws(() => scopedSnapshot(b), e => e.code === 'document-identity-unavailable');
});
test('valid noisy reader output remains collected; only bounded metadata/prefix is retained', () => {
  const s = snapshot(); s.capture.text = 'Navigation and assorted unrelated text. '.repeat(20);
  const out = scopedSnapshot(s), serialized = JSON.stringify(out);
  assert.equal(out.status, 'collected'); assert.equal(out.capture.bodySha256, sha(s.capture.text)); assert.equal(out.capture.bodyPrefix.length, 160);
  assert.equal(serialized.includes(s.capture.text), false); assert.equal(serialized.includes('remoteAddress'), false);
  assert.ok(Object.isFrozen(out));
  s.capture = { contractVersion: 'page-content/1', status: 'unsupported', reason: 'missing-region' };
  assert.deepEqual(scopedSnapshot(s), { status: 'unavailable', reason: 'reader-unsupported', readerReason: 'missing-region' });
  assert.throws(() => summarizeCapture({ title: 'bad', text: '\ud800', extractorVersion: 'main-text-prefix/v1' }));
});
test('absolute article lease never extends for late DCL; global deadline and abort are fatal', () => {
  assert.equal(articleObservationDue({ started: 0, dclAt: 1000, now: 1000 }), 2000);
  assert.equal(articleObservationDue({ started: 0, dclAt: 17999, now: 19999 }), 0);
  for (const x of [{ started: 0, dclAt: 18001, now: 18001 }, { started: 0, dclAt: 1000, now: 20000 }]) assert.throws(() => articleObservationDue(x), e => e instanceof ControlUnavailable);
  assert.throws(() => remaining(10, 10), e => e instanceof ControlFatal && e.code === 'absolute-job-deadline');
  assert.throws(() => remaining(10, 0, { aborted: true }), e => e instanceof ControlFatal && e.code === 'aborted');
});
test('static collection uses unchanged extractor, four denominators, eight policy and four page requests', async () => {
  const x = seam(), r = await collectStaticControls(x);
  assert.equal(r.denominator, 4); assert.equal(r.eligibleCases, 4); assert.equal(r.collectedCases, 4); assert.equal(r.policyRequests.length, 8); assert.equal(r.pageRequests, 4);
  assert.deepEqual(r.cases.map(c => c.id), CONTROLS.map(c => c.id));
  for (const row of r.cases) { assert.equal(row.capture.extractorVersion, 'crawler-static-html-prefix/v1'); assert.equal(row.pagePolicy.domDirectivesChecked, true); }
  assert.ok(x.buffers.every(b => b.every(n => n === 0))); assert.ok(x.seen.every(r => r.options.timeoutMs <= 15000));
});
test('static insufficient parsed text stays browser eligible but parser failure cannot grant rights', async () => {
  const x = seam((u, o) => o.resourceKind === 'page' ? response(u, '<html><title>Short</title><main>x</main></html>') : undefined), r = await collectStaticControls(x);
  assert.equal(r.eligibleCases, 4); assert.equal(r.collectedCases, 0); assert.ok(r.cases.every(c => c.reason === 'static-insufficient-text'));
  const y = seam((u, o) => o.resourceKind === 'page' ? response(u, '<html><main data-mw="' + 'x'.repeat(17000) + '">' + prose + '</main>') : undefined), t = await collectStaticControls(y);
  assert.equal(t.eligibleCases, 0); assert.ok(t.cases.every(c => c.reason === 'static-policy-parse-unavailable' && !c.capture));
});
test('static header and DOM noindex/TDM refusals never become browser eligibility', async () => {
  for (const [meta, h] of [['<meta name="robots" content="noindex">', headers], ['<meta name="tdm-reservation" content="1">', headers], ['', { xRobotsTag: ['noai'], tdmReservation: null }]]) {
    const x = seam((u, o) => o.resourceKind === 'page' ? response(u, `<html><head>${meta}</head><main>${prose}</main></html>`, { headers: h }) : undefined), r = await collectStaticControls(x);
    assert.equal(r.eligibleCases, 0); assert.ok(r.cases.every(c => c.status === 'unavailable' && !c.capture));
  }
});
test('fresh browser policies <=8 requests <=5s and full spacing counted inside60s', async () => {
  const x = seam(), r = await collectOriginPolicies({ ...x, browser: true });
  assert.equal(r.entries.size, 4); assert.equal(r.requests.length, 8); assert.ok(r.elapsedMs >= 4000 && r.elapsedMs <= 60000);
  assert.ok(x.seen.every(q => q.options.timeoutMs <= 5000));
  for (const p of r.entries.values()) assert.equal(p.status,'eligible');
});
test('robots denial/malformed policy/timeouts are typed unavailable with no page request', async () => {
  for (const mode of ['denied', 'malformed', 'timeout']) {
    const x = seam((u, o) => { if (o.resourceKind !== 'robots') return; if (mode === 'timeout') throw new PublicFetchError('timeout'); return response(u, mode === 'denied' ? 'User-agent: *\nDisallow: /' : 'User-agent: *\nDisallow: /bad literal space'); });
    const r = await collectStaticControls(x); assert.equal(r.eligibleCases, 0); assert.equal(r.pageRequests, 0); assert.equal(r.cases.length, 4);
  }
});
test('crawl delay is never shortened to fit policy budget', async () => {
  const x = seam((u, o) => o.resourceKind === 'robots' ? response(u, 'User-agent: *\nAllow: /\nCrawl-delay: 61') : undefined);
  const r = await collectOriginPolicies({ ...x, browser: true }); assert.ok([...r.entries.values()].every(c => c.status === 'unavailable' && c.reason === 'origin-policy-budget'));
  assert.equal(x.seen.length, 4); assert.equal(x.clock(), 0);
});
test('ordinary page timeout unavailable; unknown transport, abort and global deadline stop instead', async () => {
  const x = seam((u, o) => { if (o.resourceKind === 'page') throw new PublicFetchError('timeout'); });
  assert.ok((await collectStaticControls(x)).cases.every(c => c.reason === 'article-timeout'));
  for (const code of ['dns-non-public', 'network-failed', 'aborted', 'content-length']) {
    const y = seam((u, o) => { if (o.resourceKind === 'page') throw new PublicFetchError(code); });
    await assert.rejects(collectStaticControls(y), e => failureProjection(e).kind === 'fatal');
  }
  const z = seam((u, o, a) => { if (o.resourceKind === 'page') { a.advance(999999); throw new PublicFetchError('timeout'); } });
  await assert.rejects(collectStaticControls({ ...z, guard: () => remaining(350000, z.clock()) }), e => e.code === 'absolute-job-deadline');
});
test('unknown errors and hostile inputs cannot leak arbitrary messages, getters or proxy traps', () => {
  let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
  assert.deepEqual(failureProjection(p), { kind: 'fatal', reason: 'unhandled-transport' });
  assert.deepEqual(failureProjection(new Error('private body/cookie/path')), { kind: 'fatal', reason: 'unhandled-transport' });
  assert.throws(() => scopedRequest(p));
  const a = request(); Object.defineProperty(a, 'url', { enumerable: true, get() { calls++; return URLS[0]; } }); assert.throws(() => scopedRequest(a));
  assert.equal(calls, 0); assert.throws(() => new ControlUnavailable('private cause')); assert.throws(() => new ControlFatal('private cause'));
});


test('shared-origin policies fetched once, URL-specific robots applied, and pages remain spaced',async()=>{
 const same=CONTROLS.map((c,i)=>({...c,url:'https://en.wikipedia.org/'+(i===1?'private/':'public/')+i}));
 const x=seam((u,o)=>o.resourceKind==='robots'?response(u,'User-agent: *\nDisallow: /private/\nAllow: /public/'):undefined);
 const inputs=[],progress=[];const r=await collectStaticControls({...x,cases:same,onInput:x=>inputs.push(x),onProgress:x=>progress.push(x)});
 assert.equal(r.policyRequests.length,2);assert.equal(r.pageRequests,3);assert.equal(r.cases[1].rightsTransportEligible,false);
 assert.equal(inputs.length,3);assert.equal(progress.length,4);assert.ok(inputs.every(i=>i.body===prose.trim()));
 assert.equal(x.seen.filter(s=>s.options.resourceKind==='robots').length,1);
});
test('unknown origin refusal cached without repeated requests and no raw input retained',async()=>{
 const same=CONTROLS.map((c,i)=>({...c,url:'https://en.wikipedia.org/public/'+i}));
 const x=seam((u,o)=>{if(o.resourceKind==='robots')throw new PublicFetchError('timeout');});
 const r=await collectStaticControls({...x,cases:same,onInput:()=>assert.fail('retention forbidden')});
 assert.equal(r.policyRequests.length,1);assert.equal(r.pageRequests,0);assert.equal(r.cases.length,4);
});
const pageContext=()=>({phase:'static',batch:2,caseOrdinal:5,originOrdinal:2,stage:'page'});
const policyContext=()=>({phase:'browser',batch:2,caseOrdinal:null,originOrdinal:2,stage:'robots'});
const cause=code=>Object.assign(new Error('private cause message'),{code});
test('finite genuine fetch errors map only exact own code/cause combinations to refusal',()=>{
 const variants=[
  ['timeout',undefined],['http-status',{status:503}],['response-aborted',undefined],['body-too-large',undefined],
  ['headers-too-large',undefined],['compression-ratio',undefined],['content-type',undefined],
  ...['ENOTFOUND','EAI_AGAIN'].map(code=>['dns-failed',{cause:cause(code)}]),
  ...['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','ERR_STREAM_PREMATURE_CLOSE'].map(code=>['network-failed',{cause:cause(code)}]),
  ['content-encoding',undefined],...['ERR_BUFFER_TOO_LARGE','Z_DATA_ERROR','Z_BUF_ERROR'].map(code=>['content-encoding',{cause:cause(code)}]),
  ['character-encoding',undefined],['character-encoding',{cause:cause('ERR_ENCODING_INVALID_ENCODED_DATA')}]];
 for(const [code,details]of variants){
  const e=new PublicFetchError(code,details),d=projectFetchRefusal(e,pageContext());
  assert.equal(d.disposition,'unavailable',code);assert.equal(d.code,code);assert.equal(d.caseOrdinal,5);assert.ok(Object.isFrozen(d));
  assert.equal(projectFetchRefusal(e,policyContext()).disposition,'unavailable',code);
 }
 for(const status of [404,410])assert.equal(projectFetchRefusal(new PublicFetchError('http-status',{status}),policyContext()).disposition,'policy-absence');
 assert.equal(projectFetchRefusal(new PublicFetchError('http-status',{status:404}),pageContext()).disposition,'unavailable');
});
test('security/framing/TLS/unknown/invalid combinations never become ordinary unavailable',()=>{
 const errors=[
  ...['dns-non-public','dns-invalid','dns-pin','remote-address','invalid-url','invalid-host','invalid-headers','content-length','redirect-location','aborted','arbitrary-private-code'].map(code=>new PublicFetchError(code)),
  ...['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_WRONG_VERSION_NUMBER','ERR_PRIVATE_UNKNOWN'].map(code=>new PublicFetchError('network-failed',{cause:cause(code)})),
  new PublicFetchError('network-failed'),new PublicFetchError('dns-failed'),new PublicFetchError('dns-failed',{cause:cause('ECONNRESET')}),
  new PublicFetchError('content-encoding',{cause:cause('ERR_PRIVATE_UNKNOWN')}),new PublicFetchError('character-encoding',{cause:cause('Z_DATA_ERROR')}),
  new PublicFetchError('content-type',{cause:cause('ECONNRESET')}),new PublicFetchError('http-status'),new PublicFetchError('http-status',{status:200}),
  new TypeError('private'),{code:'timeout'}];
 for(const e of errors){const d=projectFetchRefusal(e,pageContext());assert.equal(d.disposition,'fatal');assert.equal(JSON.stringify(d).includes('private'),false);}
});
test('error/accessor/proxy and prototype traps do not run during diagnostic projection',()=>{
 let calls=0;const proxy=new Proxy({},{get(){calls++;throw 0},getPrototypeOf(){calls++;throw 0},ownKeys(){calls++;throw 0}});
 const errors=[proxy,Object.create(proxy)];
 for(const key of ['code','cause','status']){const e=new PublicFetchError('content-type');Object.defineProperty(e,key,{get(){calls++;throw 0}});errors.push(e);}
 const nested={};Object.defineProperty(nested,'code',{get(){calls++;throw 0}});
 errors.push(new PublicFetchError('network-failed',{cause:proxy}),new PublicFetchError('network-failed',{cause:nested}));
 for(const e of errors)assert.equal(projectFetchRefusal(e,pageContext()).disposition,'fatal');assert.equal(calls,0);
});
test('external policy refusal caches actual origin/resource with null case and grants no page input',async()=>{
 const seen=[];
 const x=seam((u,o)=>{if(o.resourceKind==='robots')throw new PublicFetchError('dns-failed',{cause:cause('EAI_AGAIN')});});
 const r=await collectStaticControls({...x,batch:2,onDiagnostic:d=>seen.push(d)});
 assert.equal(r.cases.length,4);assert.equal(r.eligibleCases,0);assert.equal(r.pageRequests,0);assert.equal(seen.length,4);
 assert.deepEqual(seen.map(d=>d.originOrdinal),[1,2,3,4]);assert.ok(seen.every(d=>d.caseOrdinal===null&&d.stage==='robots'&&d.disposition==='unavailable'));
});
test('representation/transport refusal blocks browser eligibility, unlike clean insufficient text',async()=>{
 for(const [code,details]of [['content-encoding',undefined],['headers-too-large',undefined],['network-failed',{cause:cause('ECONNRESET')}],['response-aborted',undefined]]){
  const events=[],x=seam((u,o)=>{if(o.resourceKind==='page')throw new PublicFetchError(code,details);});
  const r=await collectStaticControls({...x,batch:2,onInput:()=>assert.fail('refusal retained input'),onDiagnostic:d=>events.push(d)});
  assert.equal(r.eligibleCases,0);assert.equal(r.collectedCases,0);assert.ok(r.cases.every(c=>!c.rightsTransportEligible));
  assert.deepEqual(events.filter(e=>e.stage==='page').map(e=>e.caseOrdinal),[5,6,7,8]);
 }
});
test('global deadline/abort wins over an allowed last-page refusal; no later context is attempted',async()=>{
 const aborted={aborted:false};let pages=0;
 const x=seam((u,o)=>{if(o.resourceKind==='page'&&++pages===4){aborted.aborted=true;throw new PublicFetchError('content-encoding',{cause:cause('ERR_BUFFER_TOO_LARGE')});}});
 await assert.rejects(collectStaticControls({...x,signal:aborted}),e=>e.code==='aborted');assert.equal(pages,4);
 const z=seam((u,o,a)=>{if(o.resourceKind==='page'){a.advance(999999);throw new PublicFetchError('network-failed',{cause:cause('ECONNRESET')});}});
 await assert.rejects(collectStaticControls({...z,guard:()=>remaining(350000,z.clock())}),e=>e.code==='absolute-job-deadline');
});
test('diagnostic sync/async observer failures neither change disposition nor leak raw errors',async()=>{
 for(const onDiagnostic of [()=>{throw Error('private sink');},()=>Promise.reject(Error('private sink async'))]){
  const x=seam((u,o)=>{if(o.resourceKind==='page')throw new PublicFetchError('network-failed',{cause:cause('ECONNRESET')});});
  const r=await collectStaticControls({...x,onDiagnostic});assert.equal(r.eligibleCases,0);assert.equal(r.cases.length,4);
 }
 await new Promise(resolve=>setImmediate(resolve));
});
test('only exact reviewed Chrome enums project transport refusal; TLS/unknown/substrings stay fatal',()=>{
 const context={phase:'browser',batch:2,caseOrdinal:5,originOrdinal:1,stage:'browser-document'};
 for(const code of ['ERR_NAME_NOT_RESOLVED','ERR_CONNECTION_RESET','ERR_CONNECTION_REFUSED','ERR_CONNECTION_CLOSED','ERR_CONNECTION_TIMED_OUT','ERR_TIMED_OUT','ERR_ADDRESS_UNREACHABLE']){
  assert.equal(browserTransportReason('net::'+code),'browser-transport-unavailable');assert.equal(projectBrowserRefusal('net::'+code,context).disposition,'unavailable');
 }
 for(const text of ['net::ERR_CERT_DATE_INVALID','net::ERR_SSL_PROTOCOL_ERROR','net::ERR_ABORTED','prefix net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_RESET suffix','private unknown']){
  const d=projectBrowserRefusal(text,context);assert.equal(d.disposition,'fatal');assert.equal(d.code,'other');assert.equal(JSON.stringify(d).includes(text),false);
 }
});
test('browser loading failure must correlate own current admission; late/blocked cannot change a new observation',()=>{
 const a={expectedSession:'session',session:'session',expectedFrame:'main-frame',admission:{fetchRequestId:'fetch',networkId:'own-network',frameId:'main-frame',url:URLS[0]},
  requestId:'own-network',resourceType:'Document',errorText:'net::ERR_CONNECTION_RESET',teardown:false,deliberatelyBlocked:false};
 assert.equal(classifyBrowserLoadingFailure(a).disposition,'unavailable');
 for(const change of [x=>x.session='other',x=>x.requestId='previous-network',x=>x.admission.frameId='iframe',x=>x.admission=null,x=>x.resourceType='Other']){
  const x=structuredClone(a);change(x);assert.equal(classifyBrowserLoadingFailure(x).disposition,'fatal');
 }
 for(const flag of ['teardown','deliberatelyBlocked'])assert.equal(classifyBrowserLoadingFailure({...a,requestId:'previous-network',[flag]:true}).disposition,'ignored');
 for(const errorText of ['net::ERR_CERT_DATE_INVALID','net::ERR_SSL_PROTOCOL_ERROR','unknown'])assert.equal(classifyBrowserLoadingFailure({...a,errorText}).disposition,'fatal');
 let calls=0;const x=structuredClone(a);Object.defineProperty(x,'errorText',{enumerable:true,get(){calls++;throw 0}});
 assert.throws(()=>classifyBrowserLoadingFailure(x));assert.equal(calls,0);
});
