// Disposable file-report UI only. Invented counters; no service, database,
// account, provider, public-page fetch or owner dashboard directory is opened.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDashboardDocument, renderSnapshotScript } from '../src/cli.js';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
if (!browser) throw new Error('Local Chromium unavailable');
const temporary = mkdtempSync(path.join(tmpdir(), 'topic-refresh-ui-'));
const template = readFileSync(path.join(web, 'index.html'), 'utf8');
const style = readFileSync(path.join(web, 'style.css'), 'utf8');
const app = readFileSync(path.join(web, 'app.js'), 'utf8');
const snapshot = { schemaVersion: 2, generatedAt: new Date().toISOString(), graphLimited: true,
  counts: { totalSources: 50, learnedSources: 42, topics: 4, totalTopics: 8, multiMemberTopics: 3, singletonTopics: 1 },
  topics: [], pages: [], edges: [] };
try {
  for (const mode of ['fresh', 'stale', 'clock-skew', 'missing', 'invalid', 'timeout', 'static']) {
    const directory = path.join(temporary, mode);
    // mkdtemp keeps all fixture artifacts inside the validated disposable root.
    const fixture = mkdtempSync(`${directory}-`);
    const data = mode === 'stale' ? { ...snapshot, generatedAt: new Date(Date.now() - 240000).toISOString() }
      : mode === 'clock-skew' ? { ...snapshot, generatedAt: new Date(Date.now() + 120000).toISOString() } : snapshot;
    const before = mode === 'timeout' ? `
      const originalAppend = document.head.append.bind(document.head); let bridgeAttempts = 0;
      document.head.append = (...nodes) => {
        if (nodes[0]?.tagName === 'SCRIPT' && nodes[0].src.includes('/snapshot.js?') && ++bridgeAttempts === 1) {
          const late = nodes[0].onload;
          setTimeout(() => { document.body.dataset.timedOut = document.getElementById('snapshot-health').dataset.state;
            globalThis.__topicAtlasSnapshot = {generatedAt:'PRIVATE_DETAIL'}; late();
            document.body.dataset.lateInert = document.getElementById('count-learned').textContent === '42'; }, 10500);
          return;
        }
        originalAppend(...nodes);
      };` : mode === 'static' ? `globalThis.fetch=async()=>({ok:true,json:async()=>(${JSON.stringify(data)})});` : '';
    let html = renderDashboardDocument({ template, style, script: before + app, snapshot: data });
    if (mode === 'static') html = html.replace(/(<script id="dashboard-data" type="application\/json">)[^<]*(<\/script>)/u, '$1$2');
    html = html.replace('</body>', `<script>setTimeout(()=>{
      const health=document.getElementById('snapshot-health');
      document.body.dataset.health=health.dataset.state;
      document.body.dataset.counts=document.getElementById('count-learned').textContent;
      document.body.dataset.accessible=health.getAttribute('role')==='status'&&health.getAttribute('aria-live')==='polite';
      document.body.dataset.overflow=document.documentElement.scrollWidth>innerWidth;
    },${mode === 'timeout' ? 12700 : 3300});</script></body>`);
    const file = path.join(fixture, 'dashboard.html'); writeFileSync(file, html, { mode: 0o600 });
    if (!['missing', 'static'].includes(mode)) writeFileSync(path.join(fixture, 'snapshot.js'),
      mode === 'invalid' ? 'globalThis.__topicAtlasSnapshot={generatedAt:"PRIVATE_DETAIL"};' : renderSnapshotScript(data), { mode: 0o600 });
    const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=390,900', `--user-data-dir=${path.join(fixture, 'profile')}`,
      `--virtual-time-budget=${mode === 'timeout' ? 13200 : 3600}`, '--dump-dom', pathToFileURL(file).href],
    { encoding: 'utf8', timeout: 25000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'synthetic Chrome exits cleanly');
    const expected = { fresh: 'current', stale: 'stale', 'clock-skew': 'clock-skew', missing: 'error', invalid: 'error', timeout: 'current', static: 'static' }[mode];
    assert.match(result.stdout, new RegExp(`data-health="${expected}"`, 'u'), mode);
    assert.match(result.stdout, /data-counts="42"/u, mode);
    assert.match(result.stdout, /data-accessible="true"/u, mode);
    assert.match(result.stdout, /data-overflow="false"/u, mode);
    assert.match(result.stdout, /Karte aus Kapazitätsgründen nicht enthalten/u);
    if (mode === 'timeout') {
      assert.match(result.stdout, /data-timed-out="error"/u);
      assert.match(result.stdout, /data-late-inert="true"/u);
    }
    process.stdout.write(JSON.stringify({ mode, health: expected, countsRetained: true, accessible: true, overflow: false }) + '\n');
  }
} finally {
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  assert.ok(path.basename(temporary).startsWith('topic-refresh-ui-'));
  rmSync(temporary, { recursive: true, force: true });
}
