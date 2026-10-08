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
  let html = renderDashboardDocument({
    template: readFileSync(path.join(directory, 'index.html'), 'utf8'),
    style: readFileSync(path.join(directory, 'style.css'), 'utf8'),
    script: readFileSync(path.join(directory, 'app.js'), 'utf8'),
    snapshot,
  });
  html = html.replace('</body>', `<script>
    document.querySelector('.topic-row').click();
    document.querySelector('.page-select').click();
    const search = document.getElementById('search-input');
    search.value = 'Erste';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('zoom-in').click();
    setTimeout(() => {
      document.getElementById('reload-button').click();
      document.body.dataset.smokeSearch = search.value;
    }, 300);
  </script></body>`);
  const file = path.join(temporary, 'dashboard.html');
  writeFileSync(file, html, { mode: 0o600 });
  writeFileSync(path.join(temporary, 'snapshot.js'), `globalThis.__topicAtlasSnapshot = ${JSON.stringify({
    ...snapshot,
    // Keep the timestamp identical to prove content changes are not lost on a clock collision.
    generatedAt: snapshot.generatedAt,
    topics: [...snapshot.topics, { id: 'topic-2', title: 'Neues Topic', kind: 'general', pageCount: 1, x: .3, y: .5 }],
    pages: snapshot.pages.map((page) => page.id === 'page-1' ? { ...page, title: 'Neue erste Seite', topicId: 'topic-2' } : page),
  })};\n`, { mode: 0o600 });
  const result = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    `--user-data-dir=${path.join(temporary, 'profile')}`, '--virtual-time-budget=2400', '--dump-dom', pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.slice(-1000));
  assert.match(result.stdout, /1 von 2 Seiten/u);
  assert.match(result.stdout, /Prüft alle 3 s · neue Daten nur bei laufendem Watcher/u);
  assert.match(result.stdout, /Neue erste Seite/u);
  assert.match(result.stdout, /Stand 08\.10\.26, 14:00|Stand 08\.10\.26, 12:00/u);
  assert.match(result.stdout, /class="topic-link"/u);
  assert.match(result.stdout, /href="https:\/\/example\.com\/one" target="_blank" rel="noopener noreferrer" aria-label="Originalseite öffnen: Neue erste Seite"/u);
  assert.match(result.stdout, /id="load-label"[^>]*hidden/u);
  assert.doesNotMatch(result.stdout, /id="reload-button"[^>]*hidden/u);
  assert.match(result.stdout, /data-smoke-search="Erste"/u);
  assert.match(result.stdout, /id="map" viewBox="125 87\.5 750 525"/u);
  assert.match(result.stdout, /class="page-row active"/u);
  assert.match(result.stdout, /id="map-title">Neues Topic/u);
  assert.match(result.stdout, /Kein neuer Datenstand\. Prüfe, ob der Watcher läuft\./u);
  process.stdout.write('Dashboard headless Chrome smoke passed.\n');
} finally {
  // This uniquely named OS-temp directory contains only the synthetic fixture.
  rmSync(temporary, { recursive: true, force: true });
}
