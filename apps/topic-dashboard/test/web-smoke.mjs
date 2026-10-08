import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDashboardDocument } from '../src/cli.js';

const directory = fileURLToPath(new URL('../web/', import.meta.url));
const browser = process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync)
  : ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
if (!browser) throw new Error('No local Chrome/Chromium found for browser smoke');

const temporary = mkdtempSync(path.join(tmpdir(), 'topic-dashboard-smoke-'));
try {
  const snapshot = {
    schemaVersion: 1, generatedAt: '2026-10-08T12:00:00.000Z',
    counts: { totalSources: 3, learnedSources: 2, displayedPages: 2, topics: 1, totalTopics: 2 },
    topics: [{ id: 'topic-1', title: 'Beispieltopic', kind: 'general', pageCount: 2, x: .5, y: .5 }],
    pages: [
      { id: 'page-1', title: 'Erste Seite', url: 'https://example.com/one', host: 'example.com', topicId: 'topic-1', x: .35, y: .4 },
      { id: 'page-2', title: 'Zweite Seite', url: 'https://example.org/two', host: 'example.org', topicId: 'topic-1', x: .7, y: .6 },
    ],
    edges: [{ sourceId: 'page-1', targetId: 'page-2', score: .92 }],
  };
  const html = renderDashboardDocument({
    template: readFileSync(path.join(directory, 'index.html'), 'utf8'),
    style: readFileSync(path.join(directory, 'style.css'), 'utf8'),
    script: readFileSync(path.join(directory, 'app.js'), 'utf8'),
    snapshot,
  });
  const file = path.join(temporary, 'dashboard.html');
  writeFileSync(file, html, { mode: 0o600 });
  const result = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    `--user-data-dir=${path.join(temporary, 'profile')}`, '--virtual-time-budget=1000', '--dump-dom', pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.slice(-1000));
  assert.match(result.stdout, /2 von 2 Seiten/u);
  assert.match(result.stdout, /Für neue Daten Dashboard erneut starten/u);
  assert.match(result.stdout, /Erste Seite/u);
  assert.match(result.stdout, /class="map-edge/u);
  assert.match(result.stdout, /href="https:\/\/example\.com\/one" target="_blank" rel="noopener noreferrer" aria-label="Originalseite öffnen: Erste Seite"/u);
  assert.match(result.stdout, /id="load-label"[^>]*hidden/u);
  process.stdout.write('Dashboard headless Chrome smoke passed.\n');
} finally {
  // This uniquely named OS-temp directory contains only the synthetic fixture.
  rmSync(temporary, { recursive: true, force: true });
}
