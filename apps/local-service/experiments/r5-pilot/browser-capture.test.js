import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import test from 'node:test';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { runChromeCapture } from './browser-capture.js';

const executable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = 'http://127.0.0.1:4173/background-fixture/r5-pilot.html';
const html = '<!doctype html><html><head><title>Invented public article</title></head>' +
  '<body><main><p>A town museum opened a temporary astronomy exhibition on Monday.</p>' +
  '<p>Visitors can view a recently restored telescope and archival photographs.</p></main>' +
  '<img src="https://blocked.example/track.png"></body></html>';

test('both DNS-blocked and pilot pipes read one owned fixture through packaged reader and E5', { timeout: 180000 }, async t => {
  try { if (!(await lstat(executable)).isFile()) return t.skip('Chrome executable unavailable'); }
  catch { return t.skip('Chrome executable unavailable'); }
  for (const usePilotPipeForFixture of [false, true]) {
    const result = await runChromeCapture({ executable, url, fixtureHtml: html, usePilotPipeForFixture });
    assert.equal(result.documentRequests, 1);
    assert.ok(result.blockedRequests >= 1);
    assert.equal(result.finalUrl, url);
    assert.equal(result.captured.title, 'Invented public article');
    assert.equal(result.captured.extractorVersion, 'main-text-prefix/v1');
    assert.equal(result.embedding.modelId, MODEL_ID);
    assert.equal(result.embedding.values.length, 384);
    assert.ok(Math.abs(Math.hypot(...result.embedding.values) - 1) < 1e-6);
  }
});

test('pilot pipe blocks a synthetic document redirect', { timeout: 60000 }, async t => {
  try { if (!(await lstat(executable)).isFile()) return t.skip('Chrome executable unavailable'); }
  catch { return t.skip('Chrome executable unavailable'); }
  await assert.rejects(runChromeCapture({ executable, url, fixtureHtml: html,
    fixtureRedirectUrl: 'http://127.0.0.1:4173/background-fixture/other.html',
    usePilotPipeForFixture: true }), /Redirect blocked|Navigation did not retain/);
});
