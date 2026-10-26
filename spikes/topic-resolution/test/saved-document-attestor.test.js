import assert from 'node:assert/strict';
import test from 'node:test';
import { createSavedDocumentAttestor, attestContentDocument } from '../browser/chromium/page-content-reader.js';

const witness = () => ({ tabId: 4, windowId: 2, documentId: 'document-original',
  documentUrl: 'https://example.org/article?edition=public', sourceUrl: 'https://example.org/article?edition=public',
  origin: 'https://example.org', sessionRevision: 'session-1', blockedOrigins: [] });
const active = () => ({ tabId: 4, windowId: 2, url: witness().documentUrl + '#section' });
const response = () => [{ frameId: 0, documentId: 'document-original', result: {
  contractVersion: 'page-content-attestation/1', status: 'attested', url: witness().sourceUrl } }];

test('saved identity uses exact native document target and rechecks the owning foreground after attestation', async () => {
  let reads = 0; const calls = [];
  const attest = createSavedDocumentAttestor({ readActiveTab: async () => { reads++; return active(); },
    scriptingApi: { async executeScript(options) { calls.push(options); return response(); } } });
  assert.equal(await attest(witness()), true);
  assert.equal(reads, 2); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].target, { tabId: 4, documentIds: ['document-original'] });
  assert.equal(calls[0].world, 'ISOLATED'); assert.equal(calls[0].func, attestContentDocument);
  assert.deepEqual(calls[0].args, [witness().sourceUrl]);
});

test('same URL in a replacement document, changed foreground and malformed proof cannot authorize saved posting', async () => {
  for (const mode of ['document', 'frame', 'truthy', 'window-before', 'window-after', 'url-after', 'script-rejected', 'no-scripting']) {
    let reads = 0, scripts = 0;
    const attest = createSavedDocumentAttestor({
      readActiveTab: async () => { reads++; const value = active();
        if (mode === 'window-before' || mode === 'window-after' && reads === 2) value.windowId++;
        if (mode === 'url-after' && reads === 2) value.url = 'https://example.org/other'; return value; },
      scriptingApi: mode === 'no-scripting' ? undefined : { async executeScript() {
        scripts++; if (mode === 'script-rejected') throw Error('document no longer exists');
        const value = response(); if (mode === 'document') value[0].documentId = 'replacement';
        if (mode === 'frame') value[0].frameId = 1;
        if (mode === 'truthy') value[0].result = { status: 'attested' }; return value;
      } },
    });
    assert.equal(await attest(witness()), false, mode);
    if (mode === 'window-before') assert.equal(scripts, 0);
  }
});

test('unsupported, blocked or missing document witnesses do not execute page scripts', async () => {
  let capabilities = 0;
  const attest = createSavedDocumentAttestor({ readActiveTab: async () => { capabilities++; return active(); },
    scriptingApi: { async executeScript() { capabilities++; return response(); } } });
  const values = [ { ...witness(), documentId: null }, { ...witness(), blockedOrigins: ['https://example.org'] },
    { ...witness(), sourceUrl: 'https://other.example/article' }, { ...witness(), documentUrl: 'chrome://settings/' } ];
  for (const value of values) assert.equal(await attest(value), false);
  assert.equal(capabilities, 0);
});
