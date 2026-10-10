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
    schemaVersion: 1, generatedAt: '2026-10-08T12:00:00.000Z', catalogRevision: 'a'.repeat(64),
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
    document.body.dataset.defaultPreviewHidden = document.getElementById('grouping-preview').hidden;
    document.querySelector('.topic-row').click();
    document.querySelector('.page-select').click();
    const search = document.getElementById('search-input');
    search.value = 'Erste';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('zoom-in').click();
    const previewInput = document.getElementById('file-input');
    const choose = (value) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(value)], 'preview.json', { type: 'application/json' }));
      previewInput.files = transfer.files;
      previewInput.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const status = document.getElementById('status');
    const observer = new MutationObserver(() => {
      if (!status.textContent.includes('doppelte Source-IDs')) return;
      observer.disconnect();
      document.body.dataset.invalidPreviewRejected = document.getElementById('grouping-preview').hidden;
      setTimeout(() => {
      choose({ schemaVersion: 'grouping-preview/v1', catalogRevision: '${'a'.repeat(64)}',
        groups: [{ sourceIds: ['page-1'] }, { sourceIds: ['page-2'] }] });
      }, 0);
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    choose({ schemaVersion: 'grouping-preview/v1', catalogRevision: '${'a'.repeat(64)}',
      groups: [{ sourceIds: ['page-1', 'page-1'] }] });
    setTimeout(() => {
      document.body.dataset.previewStatus = document.getElementById('status').textContent;
      document.body.dataset.previewShown = !document.getElementById('grouping-preview').hidden;
      document.body.dataset.previewTopicCount = document.getElementById('count-topics').textContent;
      document.getElementById('grouping-current').click();
      document.body.dataset.currentTopicCount = document.getElementById('count-topics').textContent;
      document.getElementById('grouping-experimental').click();
    }, 500);
    setTimeout(() => {
      document.getElementById('reload-button').click();
      document.body.dataset.smokeSearch = search.value;
    }, 700);
  </script></body>`);
  const file = path.join(temporary, 'dashboard.html');
  writeFileSync(file, html, { mode: 0o600 });
  writeFileSync(path.join(temporary, 'snapshot.js'), `globalThis.__smokeBridgeReads = (globalThis.__smokeBridgeReads || 0) + 1;
globalThis.__topicAtlasSnapshot = globalThis.__smokeBridgeReads === 1 ? ${JSON.stringify(snapshot)} : ${JSON.stringify({
    ...snapshot,
    // Keep the timestamp identical to prove content changes are not lost on a clock collision.
    generatedAt: snapshot.generatedAt,
    catalogRevision: 'b'.repeat(64),
    topics: [...snapshot.topics, { id: 'topic-2', title: 'Neues Topic', kind: 'general', pageCount: 1, x: .3, y: .5 }],
    pages: snapshot.pages.map((page) => page.id === 'page-1' ? { ...page, title: 'Neue erste Seite', topicId: 'topic-2' } : page),
  })};\n`, { mode: 0o600 });
  const result = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    `--user-data-dir=${path.join(temporary, 'profile')}`, '--virtual-time-budget=3600', '--dump-dom', `${pathToFileURL(file).href}?preview=1`,
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
  assert.match(result.stdout, /data-default-preview-hidden="true"/u);
  assert.match(result.stdout, /data-invalid-preview-rejected="true"/u);
  assert.ok(result.stdout.includes('data-preview-shown="true"'), JSON.stringify({
    body: result.stdout.match(/<body[^>]*>/u)?.[0],
    status: result.stdout.match(/<div id="status"[^>]*>[^<]*/u)?.[0],
    grouping: result.stdout.match(/<div id="grouping-preview"[^>]*>/u)?.[0],
  }));
  assert.match(result.stdout, /data-preview-topic-count="2"/u);
  assert.match(result.stdout, /data-current-topic-count="1"/u);
  assert.match(result.stdout, /id="grouping-preview"[^>]*hidden/u);
  assert.match(result.stdout, /id="map" viewBox="125 87\.5 750 525"/u);
  assert.match(result.stdout, /class="page-row active"/u);
  assert.match(result.stdout, /id="map-title">Alle Seiten/u);
  assert.match(result.stdout, /Kein neuer Datenstand\. Prüfe, ob der Watcher läuft\./u);
  const ordinary = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    `--user-data-dir=${path.join(temporary, 'ordinary-profile')}`, '--virtual-time-budget=3600', '--dump-dom', pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (ordinary.error) throw ordinary.error;
  assert.equal(ordinary.status, 0, ordinary.stderr.slice(-1000));
  assert.match(ordinary.stdout, /id="preview-load-label"[^>]*hidden/u);
  assert.match(ordinary.stdout, /id="grouping-preview"[^>]*hidden/u);
  assert.match(ordinary.stdout, /data-preview-shown="false"/u);
  assert.match(ordinary.stdout, /Neue erste Seite/u);
  process.stdout.write('Dashboard headless Chrome smoke passed.\n');
} finally {
  // This uniquely named OS-temp directory contains only the synthetic fixture.
  rmSync(temporary, { recursive: true, force: true });
}
