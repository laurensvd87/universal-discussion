// Default inert. ADR143 fixed final32 collection only, no scoring or model imports.
import { types } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile, stat, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isGlobalPublicAddress } from '../../../../apps/local-service/src/crawler/public-fetch.js';
import { sha, freeze, record, ControlUnavailable, ControlFatal, failureProjection,
  remaining, articleObservationDue, requestDecision, safeRequestHeaders, browserHeaderPolicy,
  validateMainResponse, validateBrowserSnapshot, collectOriginPolicies, collectStaticControls, checkedCases,
  createDocumentRequestGate, closeDocumentRequestGate, admitDocumentRequest, admitDocumentResponse, matchesDocumentNetworkResponse } from './policy.js';
import { projectBrowserRefusal, classifyBrowserLoadingFailure } from './policy.js';
import { BATCHES, CANDIDATE_SHA256, validateCandidateStructure, fixedBatch, buildInputPacket, validateInputPacket, validateProducerProfile, dense } from './manifest.js';
import { TARGET_PRODUCER_SOURCE_KEYS, buildTargetProducerProfiles } from './producer-profiles.js';
import { validateArtifactReuseReceipt, ARTIFACT_REUSE_DEPENDENCY_PINS } from './artifact-reuse.js';
export { requestDecision } from './policy.js';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../../../..');
const READER = resolve(REPO, 'spikes/topic-resolution/browser/chromium/page-content-reader.js');
const READER_SHA = 'c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f';
const invalid = () => { throw new ControlFatal('invalid-contract'); };
const BASE = 'spikes/topic-resolution/harness/current-producer-final-v2/';
export const OLD_FIT_SOURCE_PATHS=freeze({
  "fit.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
  "contracts.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
  "protocol.json": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
  "supervise.py": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
  "manifest.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
  "methods.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
  "methods.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
  "README.md": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
  "producer-profiles.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "producer-profiles.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
  "../builder-scoped-root-rank-candidate-v1/scorer.js": "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
  "../../../src/domain/hierarchical-e5-paired-input.js": "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
  "../../../src/domain/hierarchical-e5-paired-linear-heads.js": "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
  "../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
  "../hierarchical-e5-broad-heads-v1/vector-packet.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
  "../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js": "spikes/topic-resolution/harness/deny-external-capabilities.js"
});
export const OLD_TARGET_SOURCE_PATHS=freeze({
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/run.mjs": "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs",
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/policy.js": "spikes/topic-resolution/harness/current-producer-final-v1/policy.js",
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js": "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/protocol.json": "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json",
  "../../../../../spikes/topic-resolution/browser/core/page-content-policy.js": "spikes/topic-resolution/browser/core/page-content-policy.js",
  "../../../../../apps/local-service/src/crawler/public-fetch.js": "apps/local-service/src/crawler/public-fetch.js",
  "../../../../../apps/local-service/src/crawler/robots.js": "apps/local-service/src/crawler/robots.js",
  "../../../../../apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js": "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
  "../../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "../../../../../apps/local-service/src/crawler/static-capture.js": "apps/local-service/src/crawler/static-capture.js",
  "../../../../../spikes/topic-resolution/browser/chromium/page-content-reader.js": "spikes/topic-resolution/browser/chromium/page-content-reader.js"
});
export const SOURCE_FILES = freeze(Object.fromEntries([
  "spikes/topic-resolution/harness/current-producer-final-v2/run.mjs",
  "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/manifest.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/supervise.py",
  "spikes/topic-resolution/harness/current-producer-final-v2/run.test.mjs",
  "spikes/topic-resolution/harness/current-producer-final-v2/policy.test.mjs",
  "spikes/topic-resolution/harness/current-producer-final-v2/manifest.test.mjs",
  "spikes/topic-resolution/harness/current-producer-final-v2/protocol.json",
  "spikes/topic-resolution/harness/current-producer-final-v2/README.md",
  "spikes/topic-resolution/browser/chromium/page-content-reader.js",
  "spikes/topic-resolution/browser/core/page-content-policy.js",
  "apps/local-service/src/crawler/public-fetch.js",
  "apps/local-service/src/crawler/robots.js",
  "apps/local-service/src/crawler/static-capture.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
  "decisions/ADR-143-current-producer-transfer-gate.md",
  "spikes/topic-resolution/harness/current-producer-controls-v1/run.mjs",
  "spikes/topic-resolution/harness/current-producer-controls-v1/policy.js",
  "spikes/topic-resolution/harness/current-producer-controls-v1/supervise.py",
  "spikes/topic-resolution/harness/current-producer-controls-v1/run.test.mjs",
  "spikes/topic-resolution/harness/current-producer-controls-v1/policy.test.mjs",
  "spikes/topic-resolution/harness/current-producer-controls-v1/protocol.json",
  "spikes/topic-resolution/harness/current-producer-controls-v1/README.md",
  "spikes/topic-resolution/harness/current-producer-controls-v1/freeze.json",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-static/result.json",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-static/supervisor.json",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/result.json",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/supervisor.json",
  "apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json",
  "apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json",
  "spikes/topic-resolution/harness/current-producer-final-v2/artifact-reuse.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/artifact-reuse.test.js",
  "decisions/ADR-145-typed-transport-and-fixed-artifact-reobservation.md",
  "apps/local-service/data/hierarchy-current-producer-artifact-reuse-adr145.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
  "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
  "spikes/topic-resolution/browser/embedding/embedding-contract.js",
  "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
  "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
  "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
  "spikes/topic-resolution/harness/deny-external-capabilities.js",
  "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs",
  "spikes/topic-resolution/harness/current-producer-final-v1/policy.js",
  "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json"
].map(name => [name,resolve(REPO,name)])));
const DEPENDENCY_PINS = freeze({
  "spikes/topic-resolution/browser/chromium/page-content-reader.js": "c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f",
  "spikes/topic-resolution/browser/core/page-content-policy.js": "c0ac60a80f0661d99aadc3b76aeb7b4fe1f28b8032e8271ef9ef8124baad073e",
  "apps/local-service/src/crawler/public-fetch.js": "37c4619d61f015cbf3be00a0e5b748f313bafc3103e33bb0a825e79546d8bf71",
  "apps/local-service/src/crawler/robots.js": "6e29a2b0e2e55d9bafcf6eb6f9ca401fd8b067e9675c3208867cd99d159dc0e2",
  "apps/local-service/src/crawler/static-capture.js": "592a0c739de05ffa3fdd139b62dbe23b95fad4b4735faeca6c5bd278c3654b96",
  "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js": "8b44edb35842f79899dff32505f4668e1f61978d4a2a5728257f834bd2ec85c2",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js": "fb02fe8c556d1e5e356510e15d9110f5e069b02ecd5ecca427dfa7b22110f2dc",
  "spikes/topic-resolution/harness/current-producer-controls-v1/freeze.json": "962a3248668c734123269b68254e9c359c126e808b549c19cc3f946a2f89f14b",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-static/result.json": "4a3fedd0b07a1b964176ac00a8631d5ad23e06615a54608b6c58ceb1b88e01ab",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-static/supervisor.json": "31a0f28d5e57b1a9c5cd1dbc405a2b51d51e89137c668f0fcea75380ac4fc644",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/result.json": "3c2dcfe4d400e28d25510c6ad436adb86960668acd99fcc1249eb0d562b857f7",
  "spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/supervisor.json": "d322943e79fe8f9a11e5da41dbddf9e48fc97b09415750ec28bc10b5327a5a7f",
  "apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json": "d6843c87347a111277c04baf65062cf246ccd75fc883631d8c69e31563288052",
  "apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json": "a138f586f3590bf4b3c3158a2902d4187967f40de38703a981eae72335db8101"
});
const CANDIDATE = 'apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json', LABEL_SEAL = 'apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json', SELECTION = 'apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json';
const REUSE_RECEIPT='apps/local-service/data/hierarchy-current-producer-artifact-reuse-adr145.json';
export const MAIN_SETUP_PLAN = freeze([
  { stage: 'auto-attach-page', method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true } },
  { stage: 'network-enable', method: 'Network.enable', params: {} },
  { stage: 'service-worker-bypass', method: 'Network.setBypassServiceWorker', params: { bypass: true } },
  { stage: 'cache-disable', method: 'Network.setCacheDisabled', params: { cacheDisabled: true } },
  { stage: 'block-websockets', method: 'Network.setBlockedURLs', params: { urls: ['ws://*', 'wss://*'] } },
  { stage: 'enable-service-workers', method: 'ServiceWorker.enable', params: {} },
  { stage: 'stop-service-workers', method: 'ServiceWorker.stopAllWorkers', params: {} },
  { stage: 'fetch-enable', method: 'Fetch.enable', params: { patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }] } },
  { stage: 'page-enable', method: 'Page.enable', params: {} },
  { stage: 'lifecycle-enable', method: 'Page.setLifecycleEventsEnabled', params: { enabled: true } },
  { stage: 'resume-page', method: 'Runtime.runIfWaitingForDebugger', params: {} },
]);
const STAGES = freeze({ ...Object.fromEntries(MAIN_SETUP_PLAN.map(p => [p.stage, p.method])),
  'deny-downloads': 'Browser.setDownloadBehavior', 'reset-permissions': 'Browser.resetPermissions',
  'empty-permissions': 'Browser.grantPermissions', 'auto-attach-browser': 'Target.setAutoAttach',
  'create-blank-target': 'Target.createTarget', 'close-extra-target': 'Target.closeTarget',
  'continue-request': 'Fetch.continueRequest', 'continue-response': 'Fetch.continueResponse', 'block-request': 'Fetch.failRequest',
  'dismiss-dialog': 'Page.handleJavaScriptDialog', 'navigate': 'Page.navigate', 'stop-loading': 'Page.stopLoading',
  'frame-tree': 'Page.getFrameTree', 'isolated-world': 'Page.createIsolatedWorld', 'snapshot': 'Runtime.evaluate', 'close-browser': 'Browser.close' });
const METHODS = new Set(Object.values(STAGES));
let firstFailure = null, closeDiagnostic = null;
export class ControlProtocolError extends Error {
  constructor(method, code) { if (!METHODS.has(method) || !Number.isInteger(code) || code < -2147483648 || code > 2147483647) invalid();
    super('Reviewed CDP command rejected'); this.method = method; this.code = code; }
}
export function projectProtocolFailure(value) {
  const a = record(value, ['stage', 'method', 'code']);
  if (!Object.hasOwn(STAGES, a.stage) || STAGES[a.stage] !== a.method || a.code !== null && (!Number.isInteger(a.code) || a.code < -2147483648 || a.code > 2147483647)) invalid();
  return freeze({ stage: a.stage, method: a.method, code: a.code, reason: a.code === null ? 'transport-or-validation-failure' : 'cdp-command-rejected' });
}
export function publicNavigationCommand(setupCompleted, url, scope) {
  if (setupCompleted !== true || !checkedCases(scope).some(c=>c.url===url)) invalid(); return freeze({ method: 'Page.navigate', params: { url } });
}
function pipe(executable, profile) {
  const child = spawn(executable, ['--headless=new', '--remote-debugging-pipe', '--no-startup-window',
    '--no-first-run', '--no-default-browser-check', '--deny-permission-prompts', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-domain-reliability', '--disable-sync', '--disable-quic',
    '--disable-client-side-phishing-detection', '--safebrowsing-disable-auto-update', '--disable-default-apps',
    '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication,ServiceWorker',
    '--autoplay-policy=user-gesture-required', `--user-data-dir=${profile}`],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let serial = 0, buffer = Buffer.alloc(0), ended = false;
  const pending = new Map(), listeners = new Map();
  const broken = () => { ended = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('CDP unavailable')); } pending.clear(); };
  child.on('error', broken); child.on('exit', broken);
  const input = child.stdio[3], output = child.stdio[4];
  input.on('error', broken); output.on('error', broken); output.on('end', broken);
  output.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 4 * 1024 * 1024) { broken(); child.kill(); return; }
    let end;
    while ((end = buffer.indexOf(0)) !== -1) {
      const bytes = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
      let message; try { message = JSON.parse(bytes.toString('utf8')); } catch { broken(); child.kill(); return; }
      if (message.id) {
        const p = pending.get(message.id); if (!p) continue;
        pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(Number.isInteger(message.error.code) && message.error.code >= -2147483648 && message.error.code <= 2147483647
          ? new ControlProtocolError(p.method, message.error.code) : Error('Invalid CDP code')); else p.resolve(message.result);
      } else if (message.method) for (const fn of listeners.get(message.method) ?? []) fn(message.params, message.sessionId);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      if (!METHODS.has(method) || ended || pending.size >= 128) return Promise.reject(Error('CDP capacity/unavailable'));
      return new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP deadline')); }, 10000);
        pending.set(id, { resolve, reject, timer, method });
        input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0', error => { if (error) broken(); });
      });
    },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => listeners.get(name)?.delete(fn); },
    async close() {
      await this.send('Browser.close').catch(error => {
        closeDiagnostic = projectProtocolFailure({ stage: 'close-browser', method: 'Browser.close', code: error instanceof ControlProtocolError ? error.code : null });
      }); child.kill(); broken(); input.destroy(); output.destroy(); listeners.clear();
    },
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function absent(path) { try { await lstat(path); invalid(); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
async function bytes(path, max = 1024 * 1024) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max || resolve(await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()) throw new ControlFatal('source-integrity');
  const b = await readFile(path); if (b.length > max) throw new ControlFatal('source-integrity'); return b;
}

async function sourceBuffers() {
  const buffers={},hashes={};
  for(const [name,path] of Object.entries(SOURCE_FILES)){buffers[name]=await bytes(path,4*1024*1024);hashes[name]=sha(buffers[name]);}
  for(const [name,pin] of Object.entries(DEPENDENCY_PINS)) if(hashes[name]!==pin) throw new ControlFatal('source-integrity');
  for(const [name,pin] of Object.entries(ARTIFACT_REUSE_DEPENDENCY_PINS))if(!Object.hasOwn(SOURCE_FILES,name)||hashes[name]!==pin)throw new ControlFatal('source-integrity');
  const devBase='spikes/topic-resolution/harness/current-producer-controls-v1/';
  const devFreeze=JSON.parse(buffers[devBase+'freeze.json']);
  for(const name of ['run.mjs','policy.js','supervise.py','run.test.mjs','policy.test.mjs','protocol.json','README.md'])
    if(devFreeze.sourceHashes[name]!==hashes[devBase+name])throw new ControlFatal('source-integrity');
  const protocol=JSON.parse(buffers[BASE+'protocol.json']);
  if(protocol.schema!=='current-producer-final-protocol/v2'||JSON.stringify(protocol.batches)!==JSON.stringify(BATCHES)) invalid();
  const candidates=JSON.parse(buffers[CANDIDATE]),cases=validateCandidateStructure(candidates),seal=JSON.parse(buffers[LABEL_SEAL]);
  if(seal.schema!=='hierarchy-current-producer-label-seal/v1'||seal.candidateSha256!==CANDIDATE_SHA256||
    seal.labelsFrozenBeforeFinalInputs!==true||seal.rootReviewed!==true||seal.independentlyReviewed!==true||seal.noFinalInputsRead!==true||
    seal.caseCount!==32||seal.rootCount!==16||seal.casesPerRoot!==2||JSON.stringify(seal.caseIds)!==JSON.stringify(BATCHES.flat())) invalid();
  const labelProjection=candidates.cases.map(c=>({id:c.id,entityGroup:c.entityGroup,publicUrl:c.publicUrl,language:c.language,expectedRootId:c.expectedRootId,supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown}));
  if(sha(JSON.stringify(labelProjection))!==seal.labelIdentityHash) invalid();
  const targetSet=buildTargetProducerProfiles(Object.fromEntries(TARGET_PRODUCER_SOURCE_KEYS.map(k=>[k,hashes[k]])));
  const selection=JSON.parse(buffers[SELECTION]);
  const fitBase='apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/';
  const oldFitFreeze=JSON.parse(buffers[fitBase+'freeze.json']);
  const oldSourceHashes=Object.fromEntries(Object.entries(OLD_FIT_SOURCE_PATHS).map(([key,path])=>[key,hashes[path]]));
  const oldTargetHashes=Object.fromEntries(Object.entries(OLD_TARGET_SOURCE_PATHS).map(([key,path])=>[key,hashes[path]]));
  if(JSON.stringify(oldFitFreeze.sourceHashes)!==JSON.stringify(oldSourceHashes)||JSON.stringify(oldFitFreeze.targetSourceHashes)!==JSON.stringify(oldTargetHashes))throw new ControlFatal('source-integrity');
  validateFitterCompletion(oldFitFreeze,JSON.parse(buffers[fitBase+'output/supervisor.json']),selection,
    {receiptSha256:hashes[SELECTION],freezeSha256:hashes[fitBase+'freeze.json']});
  const reuseReceipt=validateArtifactReuseReceipt({receipt:JSON.parse(buffers[REUSE_RECEIPT]),oldProof:{
    freezeBytes:buffers[fitBase+'freeze.json'],supervisorBytes:buffers[fitBase+'output/supervisor.json'],selectionReceiptBytes:buffers[SELECTION],
    sourceHashes:oldSourceHashes},next:{targetProfiles:targetSet.targetProfiles,profileRecipeHash:targetSet.recipeHash,
    protocolSha256:hashes[BASE+'protocol.json'],candidateSha256:hashes[CANDIDATE],labelSealSha256:hashes[LABEL_SEAL]}});
  const frozenBytes=await bytes(resolve(HERE,'freeze.json'),65536),frozen=JSON.parse(frozenBytes);
  record(frozen,['schema','sourceHashes','protocolSha256','candidateSha256','labelSealSha256','artifactReuseReceiptSha256','targetProfiles','freezeHash']);
  const {freezeHash,...material}=frozen;
  if(frozen.schema!=='current-producer-final-freeze/v2'||sha(JSON.stringify(material))!==freezeHash||
    frozen.protocolSha256!==hashes[BASE+'protocol.json']||frozen.candidateSha256!==hashes[CANDIDATE]||
    frozen.labelSealSha256!==hashes[LABEL_SEAL]||frozen.artifactReuseReceiptSha256!==hashes[REUSE_RECEIPT]||
    JSON.stringify(frozen.targetProfiles)!==JSON.stringify(targetSet.targetProfiles)||JSON.stringify(frozen.sourceHashes)!==JSON.stringify(hashes)) throw new ControlFatal('source-integrity');
  return {buffers,hashes,freezeHash,freezeSha256:sha(frozenBytes),cases,targetProfiles:targetSet.targetProfiles,reuseReceipt};
}
export function validateFitterCompletion(fitterFreeze,fitterSupervisor,selection,identity){
  // Bound descriptor copies before inspecting any externally supplied property.
  let count=0;
  function copy(v,depth=0){
    if(++count>4096||depth>8)invalid();
    if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
    if(typeof v==='string'){if(v.length>8192||!v.isWellFormed())invalid();return v;}
    if(Array.isArray(v))return dense(v,512).map(x=>copy(x,depth+1));
    if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)invalid();
    const keys=Reflect.ownKeys(v);if(keys.length>512||keys.some(k=>typeof k!=='string'))invalid();
    const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();
      Object.defineProperty(out,k,{value:copy(d.value,depth+1),enumerable:true});}return out;
  }
  const f=copy(fitterFreeze),s=copy(fitterSupervisor),r=copy(selection),i=record(identity,['receiptSha256','freezeSha256']);
  for(const h of Object.values(i))if(typeof h!=='string'||!/^[a-f0-9]{64}$/u.test(h))invalid();
  if(!f.sourceHashes||Array.isArray(f.sourceHashes)||typeof f.sourceHashes!=='object'||!Object.keys(f.sourceHashes).length||
    Object.values(f.sourceHashes).some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/u.test(h)))invalid();
  const {freezeHash,...material}=f;
  if(f.schema!=='current-producer-root-fit-freeze/v1'||sha(JSON.stringify(material))!==freezeHash||freezeHash!==r.freezeHash||
    f.protocolSha256!==r.protocolSha256||f.sourceHashes?.['protocol.json']!==f.protocolSha256||
    s.schema!=='current-producer-root-fit-supervisor/v1'||s.phase!=='fit-current'||s.reason!==null||s.cleanupReason!==null||s.exitCode!==0||
    s.ownTreeCleanupConfirmed!==true||s.sourceHashesRechecked!==true||s.resultSha256!==i.receiptSha256||
    s.freezeSha256!==i.freezeSha256||r.freezeFileSha256!==i.freezeSha256||JSON.stringify(s.sourceHashes)!==JSON.stringify(f.sourceHashes))invalid();
  return true;
}
async function recheckSources(initial){
  for(const [name,path] of Object.entries(SOURCE_FILES))if(sha(await bytes(path,4*1024*1024))!==initial.hashes[name])throw new ControlFatal('source-integrity');
  if(sha(await bytes(resolve(HERE,'freeze.json'),65536))!==initial.freezeSha256)throw new ControlFatal('source-integrity');
}
async function handshake(phase) {
  if (process.platform !== 'win32' || process.env.MURMINGLE_CURRENT_PRODUCER_FINAL_V2_SUPERVISED !== phase) invalid();
  const wanted = `CURRENT_PRODUCER_FINAL_JOB_ASSIGNED_V2:${phase}\n`;
  await new Promise((accept, reject) => {
    let value = '', done = false;
    const finish = e => { if (done) return; done = true; clearTimeout(timer); process.stdin.off('data', data); process.stdin.off('end', end); process.stdin.pause(); e ? reject(e) : accept(); };
    const data = chunk => { value += chunk.toString('utf8'); if (value.length > wanted.length) finish(new ControlFatal('source-integrity')); else if (value === wanted) finish(); };
    const end = () => finish(new ControlFatal('source-integrity'));
    const timer = setTimeout(() => finish(new ControlFatal('setup-deadline')), 5000);
    process.stdin.on('data', data); process.stdin.on('end', end); process.stdin.resume();
  });
}
async function executable() {
  for (const path of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    try { if ((await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink()) return path; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  } throw new ControlFatal('source-integrity');
}

export function batchOutput(phase,batch){
  if(!['static','browser'].includes(phase)||!Number.isInteger(batch)||batch<1||batch>8)invalid();
  return resolve(HERE,'output-'+phase+'-'+String(batch).padStart(2,'0'));
}
export function fatalCaseStatuses(value){
  const a=record(value,['ids','completedIds','failureContext','batch']),ids=dense(a.ids,4),completed=dense(a.completedIds,4);
  if(!Number.isInteger(a.batch)||a.batch<1||a.batch>8||JSON.stringify(ids)!==JSON.stringify(BATCHES[a.batch-1])||
    JSON.stringify(completed)!==JSON.stringify(ids.slice(0,completed.length)))invalid();
  const c=record(a.failureContext,['phase','batch','caseOrdinal','originOrdinal','stage']);
  if(!['static','browser'].includes(c.phase)||c.batch!==a.batch||!['robots','tdmrep','page','browser-document','browser-setup','batch-start'].includes(c.stage)||
    c.originOrdinal!==null&&(!Number.isInteger(c.originOrdinal)||c.originOrdinal<1||c.originOrdinal>4)||
    c.caseOrdinal!==null&&(!Number.isInteger(c.caseOrdinal)||c.caseOrdinal<(a.batch-1)*4+1||c.caseOrdinal>a.batch*4)||
    ['robots','tdmrep','browser-setup','batch-start'].includes(c.stage)&&c.caseOrdinal!==null)invalid();
  return freeze(ids.map((id,i)=>({id,status:i<completed.length?'completed':c.caseOrdinal===(a.batch-1)*4+i+1?'fatal':'not-attempted'})));
}
export function validateEligibilityResult(input,hashes,freezeHash,cases){
  if(!input||types.isProxy(input)||input.schema!=='current-producer-final-result/v2'||input.phase!=='static'||input.status!=='complete'||
    input.sourceHashesRechecked!==true||input.freezeHash!==freezeHash||JSON.stringify(input.sourceHashes)!==JSON.stringify(hashes)||input.denominator!==4||!Array.isArray(input.cases)||input.cases.length!==4)invalid();
  return input.cases.map((r,i)=>{
    const c=cases[i];if(!r||r.id!==c.id||r.url!==c.url||r.groupId!==c.groupId||typeof r.rightsTransportEligible!=='boolean'||!['collected','unavailable'].includes(r.status))invalid();
    if(r.rightsTransportEligible){if(r.originPolicyHash!==sha(JSON.stringify(r.originPolicy))||r.pagePolicy?.domDirectivesChecked!==true||!/^[a-f0-9]{64}$/u.test(r.htmlSha256??''))invalid();}
    else if(r.status==='collected'||r.capture!==undefined)invalid();
    return r.rightsTransportEligible;
  });
}
async function readCompletedBatch(initial,phase,batch){
  const out=batchOutput(phase,batch),paths=[resolve(out,'result.json'),resolve(out,'supervisor.json'),resolve(out,'input.packet.json')];
  const rb=await bytes(paths[0],65536),sb=await bytes(paths[1],65536),pb=await bytes(paths[2],128*1024);
  const result=JSON.parse(rb),supervisor=JSON.parse(sb),packet=JSON.parse(pb),cases=fixedBatch(initial.cases,batch);
  if(supervisor.schema!=='current-producer-final-supervisor/v2'||supervisor.phase!==phase||supervisor.batch!==batch||supervisor.reason!==null||supervisor.exitCode!==0||
    supervisor.ownTreeCleanupConfirmed!==true||supervisor.sourceHashesRechecked!==true||supervisor.resultSha256!==sha(rb)||supervisor.packetSha256!==sha(pb)||
    supervisor.freezeSha256!==initial.freezeSha256||JSON.stringify(supervisor.sourceHashes)!==JSON.stringify(initial.hashes)||
    result.schema!=='current-producer-final-result/v2'||result.phase!==phase||result.batch!==batch||result.status!=='complete'||result.freezeHash!==initial.freezeHash||
    result.freezeSha256!==initial.freezeSha256||result.sourceHashesRechecked!==true||JSON.stringify(result.sourceHashes)!==JSON.stringify(initial.hashes)||
    result.packetSha256!==sha(pb)||result.denominator!==4||result.cases?.length!==4||JSON.stringify(result.cases.map(r=>r.id))!==JSON.stringify(cases.map(c=>c.id)))throw new ControlFatal('source-integrity');
  validateInputPacket(packet,{phase,batch,freezeHash:initial.freezeHash,candidateSha256:initial.hashes[CANDIDATE],labelSealSha256:initial.hashes[LABEL_SEAL],
    artifactReuseReceiptSha256:initial.hashes[REUSE_RECEIPT],producerProfile:initial.targetProfiles[phase==='static'?0:1],cases,
    collectedIds:result.cases.filter(r=>r.status==='collected').map(r=>r.id)});
  return {result,resultSha256:sha(rb),supervisorSha256:sha(sb),packetSha256:sha(pb),paths,hashes:[sha(rb),sha(sb),sha(pb)]};
}
async function priorEvidence(initial,phase,batch){
  const prior=[];
  for(let i=1;i<(phase==='browser'?9:batch);i++)prior.push(await readCompletedBatch(initial,'static',i));
  if(phase==='browser')for(let i=1;i<batch;i++)prior.push(await readCompletedBatch(initial,'browser',i));
  const ownStatic=phase==='browser'?prior[batch-1]:null;
  return {prior,eligible:ownStatic?validateEligibilityResult(ownStatic.result,initial.hashes,initial.freezeHash,fixedBatch(initial.cases,batch)):null};
}
async function withArticleLease(promise, until) {
  let timer; try { return await Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(new ControlUnavailable('article-timeout')), Math.max(0, until - performance.now())); })]); }
  finally { clearTimeout(timer); }
}

async function browserControls({ initial, cases: CONTROLS, eligible, guard, started, output, onInput, onProgress, batch, onDiagnostic, onStage, syntheticDriver=null }) {
  const now=syntheticDriver?.clock??(()=>performance.now()), sleep=syntheticDriver?.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
  const lease=syntheticDriver?async promise=>promise:withArticleLease;
  // Fresh policy work belongs to THIS batch; static eligibility is no freshness grant.
  const policyStarted = now();
  const URLS=CONTROLS.map(c=>c.url), ORIGINS=[...new Set(URLS.map(u=>new URL(u).origin))];
  const policies = syntheticDriver?syntheticDriver.policies:await collectOriginPolicies({ cases: CONTROLS, browser: true, guard,batch,onDiagnostic,onStage });
  const policyElapsedMs = now() - policyStarted;
  if (policyElapsedMs > 60000) throw new ControlFatal('absolute-job-deadline');
  onStage(freeze({phase:'browser',batch,caseOrdinal:null,originOrdinal:null,stage:'browser-setup'}));
  guard();
  let browser,collectPageContent;
  if(syntheticDriver){browser=syntheticDriver.browser;collectPageContent=()=>{};}
  else{
    const profile=resolve(output,'profile');await absent(profile);await mkdir(profile);
    const readerBytes=initial.buffers['spikes/topic-resolution/browser/chromium/page-content-reader.js'];
    if(sha(readerBytes)!==READER_SHA)throw new ControlFatal('source-integrity');
    ({collectPageContent}=await import(pathToFileURL(READER).href));
    if(sha(await bytes(READER))!==READER_SHA)throw new ControlFatal('source-integrity');
    browser=pipe(await executable(),profile);
  }
  const cases=[],operations=new Set();
  let mainSession, expectedMainFrame, setupResolve, setupReject, setupCompleted = false, fatal = null, finishing = false, requests = 0, current = null, navigationMs = 0;
  const setup = new Promise((yes, no) => { setupResolve = yes; setupReject = no; }); setup.catch(() => {});
  const counts = { allowed: 0, blocked: 0, documentResponses: 0, failedResources: 0 };
  const ignoredNetworkIds=new Set();
  const ignoreNetworkId=id=>{if(typeof id==='string'&&id.length>0&&id.length<=160){if(ignoredNetworkIds.size>=4096)throw new ControlFatal('request-capacity');ignoredNetworkIds.add(id);}};
  const step = async (stage, params = {}, session) => {
    guard(); try { return await browser.send(STAGES[stage], params, session); }
    catch (e) { firstFailure ??= projectProtocolFailure({ stage, method: STAGES[stage], code: e instanceof ControlProtocolError ? e.code : null }); throw new ControlFatal('protocol-failed'); }
  };
  const abort = error => { fatal ??= error instanceof ControlFatal ? error : new ControlFatal('callback-failed'); setupReject(fatal); };
  const track = p => { const op = p.catch(abort).finally(() => operations.delete(op)); operations.add(op); };
  const blockPaused=async(p,session)=>{
    // A rejected duplicate must never retire the live admitted request's failure evidence.
    if(current?.admission?.networkId===p.networkId&&!current.refusal&&!current.stopping&&!finishing)
      throw new ControlFatal('response-integrity');
    ignoreNetworkId(p.networkId);await step('block-request',{requestId:p.requestId,errorReason:'BlockedByClient'},session);
  };
  const drain = async () => { const until = now() + 2000; while (operations.size && now() < until) await sleep(10); if (operations.size) throw new ControlFatal('unsettled-callbacks'); };
  browser.on('Target.attachedToTarget', p => track((async () => {
    if (p.targetInfo.type !== 'page' || mainSession || p.targetInfo.url !== 'about:blank') {
      const r = await step('close-extra-target', { targetId: p.targetInfo.targetId }); if (!r.success) throw new ControlFatal('response-integrity'); return;
    }
    mainSession = p.sessionId; for (const command of MAIN_SETUP_PLAN) await step(command.stage, command.params, mainSession);
    setupCompleted = true; setupResolve();
  })()));
  browser.on('Fetch.requestPaused', (p, session) => track((async () => {
    if (session !== mainSession || ++requests > 4096) throw new ControlFatal('request-capacity');
    if (p.responseStatusCode !== undefined || p.responseErrorReason !== undefined) {
      counts.documentResponses++;
      // Coarse errors are fatal before deliberate block/ignored-ID marking.
      if(p.responseErrorReason!==undefined)throw new ControlFatal('unhandled-transport');
      if (!current || finishing || p.resourceType !== 'Document' || !admitDocumentResponse(current.gate,{url:p.request.url,frameId:p.frameId,networkId:p.networkId,requestId:p.requestId})) {
        await blockPaused(p,session); return;
      }
      try {
        if (p.request.url !== current.url || !Number.isInteger(p.responseStatusCode) || p.responseStatusCode < 200 || p.responseStatusCode >= 300 || !p.networkId) throw new ControlUnavailable('document-response-refused');
        browserHeaderPolicy(p.responseHeaders ?? []);
        if (current.paused) throw new ControlFatal('response-integrity');
        current.paused = { url: p.request.url, status: p.responseStatusCode, headers: p.responseHeaders ?? [], networkId: p.networkId, frameId: p.frameId };
        current.fetchResponseId=p.requestId;
        await step('continue-response', { requestId: p.requestId }, session);
      } catch (e) {
        if (!(e instanceof ControlUnavailable)) throw e;
        current.refusal ??= e.code; await blockPaused(p,session);
      } return;
    }
    let verdict = finishing ? 'blocked-finishing' : requestDecision({ url: p.request.url, method: p.request.method, resourceType: p.resourceType }, CONTROLS);
    if (p.resourceType === 'Document' && (!current || p.request.url !== current.url)) verdict = 'blocked-document';
    if(verdict==='allowed'){
      const admitted=admitDocumentRequest(current.gate,{url:p.request.url,method:p.request.method,resourceType:p.resourceType,
        frameId:p.frameId,requestId:p.requestId,networkId:p.networkId});
      if(!admitted)verdict='blocked-document';else current.admission=admitted;
    }
    if (verdict === 'allowed') { counts.allowed++; await step('continue-request', { requestId: p.requestId, headers: safeRequestHeaders(p.request.headers) }, session); }
    else { counts.blocked++; await blockPaused(p,session); }
  })()));
  browser.on('Page.javascriptDialogOpening', (_, session) => track(step('dismiss-dialog', { accept: false }, session)));
  browser.on('Network.loadingFailed', (p, session) => {
    counts.failedResources++;
    const disposition=classifyBrowserLoadingFailure({expectedSession:mainSession,session,expectedFrame:expectedMainFrame,
      admission:current?.admission??null,requestId:p.requestId,resourceType:p.type,errorText:p.errorText,
      teardown:Boolean(finishing||current?.stopping&&current.admission?.networkId===p.requestId),deliberatelyBlocked:ignoredNetworkIds.has(p.requestId)});
    if(disposition.disposition==='ignored')return;
    if(disposition.reason==='response-integrity'){abort(new ControlFatal('response-integrity'));return;}
    const diagnostic=projectBrowserRefusal(p.errorText,current.context);onDiagnostic(diagnostic);
    if(diagnostic.disposition==='unavailable')current.refusal=diagnostic.reason;else abort(new ControlFatal(diagnostic.reason));
  });
  browser.on('Network.responseReceived', (p, session) => {
    if (typeof p.response.remoteIPAddress === 'string' && p.response.remoteIPAddress && !isGlobalPublicAddress(p.response.remoteIPAddress)) { abort(new ControlFatal('response-integrity')); return; }
    if (session !== mainSession || !current || p.type !== 'Document') return;
    if(!matchesDocumentNetworkResponse(current.gate,{url:p.response.url,frameId:p.frameId,networkId:p.requestId}))return;
    current.network = { url: p.response.url, status: p.response.status, requestId: p.requestId, frameId: p.frameId, loaderId: p.loaderId,
      remoteAddress: p.response.remoteIPAddress, securityState: p.response.securityState, mimeType: p.response.mimeType };
  });
  browser.on('Page.frameNavigated', (p, session) => {
    if (session !== mainSession || !current || p.frame.parentId) return;
    if (current.committed) current.changed = true;
    current.committed = { frameId: p.frame.id, loaderId: p.frame.loaderId, url: p.frame.url };
  });
  browser.on('Page.lifecycleEvent', (p, session) => {
    if (session !== mainSession || !current || p.name !== 'DOMContentLoaded') return;
    if (current.dcls.length >= 32) { abort(new ControlFatal('response-integrity')); return; }
    current.dcls.push({ frameId: p.frameId, loaderId: p.loaderId, at: now() });
  });
  const completionFence=article=>{
    guard();if(fatal)throw fatal;
    if(current!==article||article.stopping||finishing)throw new ControlFatal('response-integrity');
    if(article.refusal)throw new ControlUnavailable(article.refusal);
    if(now()>=article.until)throw new ControlUnavailable('article-timeout');
  };
  const publishOutcome=(c,outcome,policy)=>{
    const row={...c,...outcome,originPolicyHash:policy.receiptSha256,observedAtOffsetMs:Math.round(now()-started)};
    cases.push(row);onProgress(row);
  };
  let result;
  try {
    await step('deny-downloads', { behavior: 'deny' }); await step('reset-permissions');
    for (const origin of ORIGINS) await step('empty-permissions', { origin, permissions: [] });
    await step('auto-attach-browser', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await step('create-blank-target', { url: 'about:blank' });
    try { await lease(setup, now() + 10000); }
    catch (e) { if (e instanceof ControlUnavailable) throw new ControlFatal('setup-deadline'); throw e; }
    if (!setupCompleted) throw new ControlFatal('setup-deadline');
    const initialTree=await step('frame-tree',{},mainSession),blank=initialTree.frameTree?.frame;
    if(!blank||typeof blank.id!=='string'||!blank.id||blank.id.length>160||!blank.id.isWellFormed()||/[\p{Cc}\p{Cf}\p{White_Space}]/u.test(blank.id)||blank.parentId||blank.url!=='about:blank')throw new ControlFatal('response-integrity');
    expectedMainFrame=blank.id;
    for (let i = 0; i < 4; i++) {
      guard(); if (fatal) throw fatal;
      const c = CONTROLS[i], policy = policies.entries.get(c.url);
      if (!eligible[i] || policy.status !== 'eligible') { const row={ ...c, status:'unavailable',reason:!eligible[i]?'static-rights-ineligible':'fresh-origin-ineligible',freshPolicyReason:policy.reason??null }; cases.push(row);onProgress(row);continue; }
      try { await policies.beforePage(c.url); } catch(e){const p=failureProjection(e);if(p.kind!=='unavailable')throw e;const row={...c,status:'unavailable',reason:p.reason};cases.push(row);onProgress(row);continue;}
      guard(); const articleStarted = now(), until = articleStarted + 20000;
      const context=freeze({phase:'browser',batch,caseOrdinal:(batch-1)*4+i+1,originOrdinal:ORIGINS.indexOf(new URL(c.url).origin)+1,stage:'browser-document'});onStage(context);
      current = { url: c.url, frameId: expectedMainFrame, loaderId: null, paused: null, network: null, dcls: [], committed: null, changed: false, refusal: null,
        gate:createDocumentRequestGate({expectedUrl:c.url,frameId:expectedMainFrame,setupCompleted}),admission:null,fetchResponseId:null,stopping:false,context,until };
      const article=current;
      let outcome;
      try {
        const nav = await lease(step('navigate', publicNavigationCommand(setupCompleted, c.url, CONTROLS).params, mainSession), until);
        if (nav.errorText) { if (current.refusal) throw new ControlUnavailable(current.refusal);
          onDiagnostic(freeze({...projectBrowserRefusal(nav.errorText,context),disposition:'fatal',reason:'navigation-transport-failure'}));
          throw new ControlFatal('navigation-transport-failure'); }
        if (nav.frameId!==expectedMainFrame || !nav.loaderId) throw new ControlUnavailable('document-identity-unavailable');
        current.frameId = nav.frameId; current.loaderId = nav.loaderId;
        let dcl;
        while (!dcl) {
          guard(); if (fatal) throw fatal; if (current.refusal) throw new ControlUnavailable(current.refusal);
          if (now() >= until - 2000) throw new ControlUnavailable('article-timeout');
          dcl = current.dcls.find(d => d.frameId === nav.frameId && d.loaderId === nav.loaderId);
          if (!dcl) await sleep(10);
        }
        completionFence(article);
        articleObservationDue({ started: articleStarted, dclAt: dcl.at, now: now() });
        if (!current.paused || !current.network) throw new ControlFatal('response-integrity');
        const responseWitness = validateMainResponse({ expectedUrl: c.url, frameId: nav.frameId, loaderId: nav.loaderId, paused: current.paused, network: current.network }, CONTROLS);
        const tree = await lease(step('frame-tree', {}, mainSession), until), f = tree.frameTree?.frame;
        completionFence(article);
        if (!f || f.id !== nav.frameId || f.loaderId !== nav.loaderId || f.url !== c.url || current.changed || current.committed?.loaderId !== nav.loaderId || current.committed?.url !== c.url) throw new ControlUnavailable('document-identity-unavailable');
        const world = await lease(step('isolated-world', { frameId: nav.frameId, worldName: 'current-producer-final-v2', grantUniveralAccess: false }, mainSession), until);
        completionFence(article);
        const due = articleObservationDue({ started: articleStarted, dclAt: dcl.at, now: now() });
        if (due) await sleep(due); completionFence(article);
        articleObservationDue({ started: articleStarted, dclAt: dcl.at, now: now() });
        const expression = `(() => { const robots=[],tdm=[];let canonicalUrl='',n=0,e=document.head?.firstElementChild;for(;e&&n<128;e=e.nextElementSibling,n++){if(e.tagName==='META'){const k=(e.getAttribute('name')||e.getAttribute('http-equiv')||'').toLowerCase();const v=e.getAttribute('content')||'';if(v.length>4096)return {capture:null,document:{url:location.href,canonicalUrl:'',robots:[],tdm:[],complete:false}};if(['robots','x-robots-tag','murmingletopiccrawler'].includes(k))robots.push(v);if(k==='tdm-reservation')tdm.push(v);}if(e.tagName==='LINK'&&(e.getAttribute('rel')||'').toLowerCase()==='canonical'){const h=e.getAttribute('href')||'';if(h.length<=2048)canonicalUrl=h;}}const capture=(${collectPageContent.toString()})(${JSON.stringify(c.url)});return {capture,document:{url:location.href,canonicalUrl,robots,tdm,complete:!e}};})()`;
        const observed = await lease(step('snapshot', { expression, contextId: world.executionContextId, returnByValue: true, timeout: 1000 }, mainSession), until);
        completionFence(article);
        if (observed.exceptionDetails || !observed.result?.value) throw new ControlUnavailable('reader-unsupported');
        // A second exact frame read fences navigation during world creation/evaluation.
        const after = await lease(step('frame-tree', {}, mainSession), until), af = after.frameTree?.frame;
        completionFence(article);
        if (!af || af.id !== nav.frameId || af.loaderId !== nav.loaderId || af.url !== c.url || current.changed) throw new ControlUnavailable('document-identity-unavailable');
        const navigationId = `final-v2-${batch}-${i + 1}`;
        outcome = validateBrowserSnapshot({ expectedUrl: c.url, ...observed.result.value, responseWitness, frameId: nav.frameId, loaderId: nav.loaderId, navigationId }, CONTROLS);
        let retainedInput=null;
        if(outcome.status==='collected'){
          const captured=observed.result.value.capture;
          retainedInput=({id:c.id,groupId:c.groupId,url:c.url,title:captured.title,body:captured.text,extractorVersion:captured.extractorVersion,
            documentWitness:{kind:'browser-document',finalUrlHash:sha(c.url),frameId:nav.frameId,loaderId:nav.loaderId,navigationId,
              documentId:sha(JSON.stringify({frameId:nav.frameId,loaderId:nav.loaderId,navigationId}))},
            originPolicyHash:policy.receiptSha256,pagePolicyHash:sha(JSON.stringify({responseWitness,dom:observed.result.value.document}))});
        }
        if (outcome.documentWitness) outcome = { ...outcome, documentWitness: { ...outcome.documentWitness, documentId: sha(JSON.stringify({ frameId: nav.frameId, loaderId: nav.loaderId, navigationId })), documentIdScope: 'harness-incarnation-not-native-extension-document-id' },
          documentAdmission:{fetchRequestId:current.admission.fetchRequestId,fetchResponseId:current.fetchResponseId,networkId:current.admission.networkId} };
        // Synthetic fault hook has no production caller. No await between this
        // last fence and synchronous retain+collected publication.
        syntheticDriver?.beforeRetain?.();
        completionFence(article);
        if(retainedInput)onInput(retainedInput);
        publishOutcome(c,outcome,policy);
      } catch (e) {
        guard(); if (fatal) throw fatal; const p = failureProjection(e); if (p.kind !== 'unavailable') throw e;
        outcome = { status: 'unavailable', reason: p.reason };
        publishOutcome(c,outcome,policy);
      } finally {
        navigationMs += now() - articleStarted;
        current.stopping = true;
        ignoreNetworkId(current.admission?.networkId);
        closeDocumentRequestGate(current.gate);
        await step('stop-loading', {}, mainSession); current = null;
      }
    }
    if (navigationMs > 80000) throw new ControlFatal('absolute-job-deadline');
    result = { cases, denominator: 4, collectedCases: cases.filter(c => c.status === 'collected').length, policyRequests: policies.requests,
      policyElapsedMs: policyElapsedMs+policies.spacingMs, navigationElapsedMs: navigationMs, requestCounts: counts };
  } finally { finishing = true; try { await drain(); } finally { await browser.close(); } await drain(); }
  if (fatal || firstFailure || operations.size || !result) throw fatal ?? new ControlFatal('unsettled-callbacks');
  if (now() - started - policyElapsedMs - navigationMs > 35000) throw new ControlFatal('absolute-job-deadline');
  return { ...result, protocolCallbacksDrained: true, closeDiagnostic };
}


/** Invented callback fixtures only: same runtime handlers/loop, no filesystem,
 * policy transport, executable lookup or Chrome spawn can run on this path. */
export async function runSyntheticBrowserCallbacks(value){
  const a=record(value,['cases','eligible','browser','clock','sleep','guard','beforeRetain','onInput']);
  const cases=checkedCases(a.cases),eligible=dense(a.eligible,4),browser=record(a.browser,['on','send','close']);
  if(eligible.length!==4||eligible.some(v=>typeof v!=='boolean')||cases.some(c=>!/[.](?:example|invalid)$/u.test(new URL(c.url).hostname)))invalid();
  for(const fn of [a.clock,a.sleep,a.guard,a.beforeRetain,a.onInput,...Object.values(browser)])if(typeof fn!=='function')invalid();
  const policies={entries:new Map(cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64),receipt:{crawlDelayMs:2000}}])),
    requests:[],elapsedMs:0,spacingMs:0,beforePage:async()=>0};
  firstFailure=null;closeDiagnostic=null;
  return browserControls({initial:null,cases,eligible,guard:a.guard,started:a.clock(),output:null,onInput:a.onInput,onProgress:()=>{},batch:1,
    onDiagnostic:()=>{},onStage:()=>{},syntheticDriver:{browser,clock:a.clock,sleep:a.sleep,policies,beforeRetain:a.beforeRetain}});
}

async function run(phase,batch){
  await handshake(phase+':'+batch);
  const started=performance.now(),deadline=started+(phase==='browser'?165000:345000),guard=()=>remaining(deadline,performance.now());
  if(!/^D:/iu.test(HERE))invalid();
  const output=batchOutput(phase,batch);
  if((await lstat(output)).isSymbolicLink()||!(await stat(output)).isDirectory()||resolve(await realpath(output)).toLowerCase()!==output.toLowerCase())invalid();
  for(const name of ['node.started.json','result.json','input.packet.json','profile'])await absent(resolve(output,name));
  const initial=await sourceBuffers(), scope=fixedBatch(initial.cases,batch),prior=await priorEvidence(initial,phase,batch),inputs=[],progress=[],diagnostics=[];
  let diagnosticDropped=0,failureContext=freeze({phase,batch,caseOrdinal:null,originOrdinal:null,stage:'batch-start'});
  const onStage=context=>{failureContext=context;};
  const onDiagnostic=diagnostic=>{if(diagnostics.length<32&&Buffer.byteLength(JSON.stringify([...diagnostics,diagnostic]))<=16384)diagnostics.push(diagnostic);else diagnosticDropped++;};
  await writeFile(resolve(output,'node.started.json'),JSON.stringify({schema:'current-producer-final-started/v2',phase,batch,sourceHashes:initial.hashes,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,noAutomaticRetry:true}),{flag:'wx'});
  const sourceVersion=initial.freezeHash+'|'+phase+'|'+batch;
  const onInput=row=>{if(inputs.length>=4)invalid();inputs.push({...row,sourceVersion});};
  const onProgress=row=>{if(progress.length>=4||row.id!==scope[progress.length].id)invalid();progress.push(row);};
  let data;
  try {data=phase==='static'?await collectStaticControls({cases:scope,guard,onInput,onProgress,batch,onDiagnostic,onStage}):await browserControls({initial,cases:scope,eligible:prior.eligible,guard,started,output,onInput,onProgress,batch,onDiagnostic,onStage});}
  catch(e){
    const projected=failureProjection(e);
    const states=fatalCaseStatuses({ids:scope.map(c=>c.id),completedIds:progress.map(c=>c.id),failureContext,batch});
    const rows=scope.map((c,i)=>progress[i]??{...c,status:states[i].status,reason:states[i].status==='fatal'?projected.reason:null,...(phase==='static'?{rightsTransportEligible:false}:{})});
    data={status:'fatal',failure:projected,protocolFailure:firstFailure,failureContext,denominator:4,cases:rows};
  }
  // No partial/fatal packet may be consumed. Kept successful prefix metadata is not a rescue input.
  const collectedIds=data.status==='fatal'?[]:data.cases.filter(r=>r.status==='collected').map(r=>r.id);
  const packet=buildInputPacket({phase,batch,freezeHash:initial.freezeHash,candidateSha256:initial.hashes[CANDIDATE],labelSealSha256:initial.hashes[LABEL_SEAL],
    artifactReuseReceiptSha256:initial.hashes[REUSE_RECEIPT],producerProfile:initial.targetProfiles[phase==='static'?0:1],rows:inputs.filter(r=>collectedIds.includes(r.id))});
  guard();await recheckSources(initial);
  for(const p of prior.prior)for(let i=0;i<p.paths.length;i++)if(sha(await bytes(p.paths[i],128*1024))!==p.hashes[i])throw new ControlFatal('source-integrity');
  const packetBytes=JSON.stringify(packet);
  const result={schema:'current-producer-final-result/v2',phase,batch,status:'complete',...data,fullProducerDenominator:32,
    sourceHashes:initial.hashes,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,protocolSha256:initial.hashes[BASE+'protocol.json'],
    candidateSha256:initial.hashes[CANDIDATE],labelSealSha256:initial.hashes[LABEL_SEAL],artifactReuseReceiptSha256:initial.hashes[REUSE_RECEIPT],oldSelectionReceiptSha256:initial.hashes[SELECTION],
    artifactReuseReceiptHash:initial.reuseReceipt.receiptHash,transferHash:initial.reuseReceipt.transferHash,profileRecipeHash:initial.reuseReceipt.profileRecipeHash,
    diagnostics,diagnosticDropped,reobservation:true,independentCohort:false,noOldInputSplice:true,
    producerProfile:packet.producerProfile,packetSha256:sha(packetBytes),priorEvidence:prior.prior.map(p=>({resultSha256:p.resultSha256,supervisorSha256:p.supervisorSha256,packetSha256:p.packetSha256})),
    elapsedMs:Math.round(performance.now()-started),sourceHashesRechecked:true,noAutomaticRetry:true,noNativeAttestation:true,
    browserProducerScope:'restricted-single-document-dom-reader/v1',ordinaryDynamicBrowserProducerValidated:false,
    noCanonicalWrites:true,noModelCalls:true,productionValidated:false,assignmentAuthority:false,
    networkScopeLimit:'Fixed reviewed HTTPS hosts and observed remote IP checks do not establish Chrome DNS pinning or complete OS egress isolation.'};
  const resultBytes=JSON.stringify(result);if(Buffer.byteLength(resultBytes)>65536||Buffer.byteLength(packetBytes)>128*1024)invalid();guard();
  await writeFile(resolve(output,'input.packet.json'),packetBytes,{flag:'wx'});
  await writeFile(resolve(output,'result.json'),resultBytes,{flag:'wx'});
  console.log(JSON.stringify({status:result.status,phase,batch,resultSha256:sha(resultBytes),packetSha256:sha(packetBytes)}));
  if(result.status==='fatal')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length===2)console.log('No action. Frozen final batch and explicit supervised approval required.');
  else if(process.argv.length===4&&['--static-batch','--browser-batch'].includes(process.argv[2])&&/^[1-8]$/u.test(process.argv[3])){
    const unhandled=()=>{console.error(JSON.stringify({status:'failed',failure:{kind:'fatal',reason:'callback-failed'}}));process.exit(1);};
    process.once('uncaughtException',unhandled);process.once('unhandledRejection',unhandled);
    await run(process.argv[2]==='--static-batch'?'static':'browser',Number(process.argv[3])).catch(e=>{console.error(JSON.stringify({status:'failed',failure:failureProjection(e),protocolFailure:firstFailure}));process.exitCode=1;});
  }else{console.error('Unsupported fixed final batch');process.exitCode=1;}
}
