import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDashboardDocument, renderSnapshotScript } from '../src/cli.js';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const browser = (process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
  : ['/usr/bin/chromium', '/usr/bin/google-chrome']).find(existsSync);
if (!browser) throw new Error('No local Chrome/Chromium found for growth smoke');
const temporary = mkdtempSync(path.join(tmpdir(), 'topic-growth-web-'));
const seriesId = 'a'.repeat(64);
const point = (at, learnedPages, activeTopics, revision, series = seriesId) => ({
  at, seriesId: series, revision, totalSources: 1500, learnedPages, activeTopics, totalTopics: 500,
});
const history = points => ({ schemaVersion: 'catalog-growth/v1', retention: { minuteHours: 24, hourlyDays: 90, maxPoints: 4096 }, points });
const snapshot = { schemaVersion: 1, generatedAt: '2026-10-12T12:00:00.000Z', catalogRevision: 'b'.repeat(64),
  growthSeriesId: seriesId, graphLimited: false,
  counts: { totalSources: 1500, learnedSources: 1010, displayedPages: 0, topics: 0, totalTopics: 500 }, topics: [], pages: [], edges: [] };
const good = history([
  point('2026-10-12T09:00:00.000Z', 900, 390, 1, 'c'.repeat(64)),
  point('2026-10-12T10:00:00.000Z', 1000, 400, 1),
  point('2026-10-12T10:01:00.000Z', 1020, 410, 2),
  point('2026-10-12T11:30:00.000Z', 1010, 400, 3),
]);

function run(name, growth, { next = growth, data = snapshot, interaction = '' } = {}) {
  let html = renderDashboardDocument({ template: readFileSync(path.join(web, 'index.html'), 'utf8'),
    style: readFileSync(path.join(web, 'style.css'), 'utf8'), script: readFileSync(path.join(web, 'app.js'), 'utf8'),
    snapshot: data, growth });
  html = html.replace('</body>', `<script>
    setTimeout(() => {
      ${interaction}
      document.body.dataset.initialGrowth = document.getElementById('growth-status').textContent;
      document.body.dataset.initialPaths = document.querySelectorAll('.growth-line').length;
      document.body.dataset.overflow = document.documentElement.scrollWidth > window.innerWidth;
    }, 200);
    setTimeout(() => {
      document.body.dataset.finalPoints = document.getElementById('growth-chart-description').textContent;
      document.body.dataset.finalView = document.querySelector('[data-growth-view][aria-pressed="true"]').dataset.growthView;
      document.body.dataset.finalX = document.querySelector('[data-growth-axis="x"]')?.textContent || '';
      document.body.dataset.finalY = document.querySelector('[data-growth-axis="y"]')?.textContent || '';
    }, 3500);
  </script></body>`);
  assert.ok(html.includes('catalog-growth/v1') || growth === null, 'renderer embeds growth');
  const file = path.join(temporary, `${name}.html`);
  writeFileSync(file, html, { mode: 0o600 });
  // The existing local script bridge carries history changes without changing graph data.
  writeFileSync(path.join(temporary, 'snapshot.js'), `globalThis.__growthSmokeReads = (globalThis.__growthSmokeReads || 0) + 1;
    if (globalThis.__growthSmokeReads === 1) { ${renderSnapshotScript(data, null, growth)} }
    else { ${renderSnapshotScript(data, null, next)} }`, { mode: 0o600 });
  const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    '--window-size=390,900', `--user-data-dir=${path.join(temporary, `${name}-profile`)}`,
    '--virtual-time-budget=3800', '--dump-dom', pathToFileURL(file).href],
  { encoding: 'utf8', timeout: 20000, maxBuffer: 3 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.slice(-1000));
  assert.match(result.stdout, /data-overflow="false"/u);
  return result.stdout;
}

try {
  const valid = run('valid', good, { interaction: `document.querySelector('[data-growth-window="all"]').click();` });
  assert.match(valid, /data-initial-paths="6"/u); // Three separated segments in each of two series.
  assert.match(valid, /Δ \+10 im Messzeitraum/u);
  assert.match(valid, /Δ 0 im Messzeitraum/u);
  assert.match(valid, /Topics gesamt \(inkl\. leerer\)/u);
  assert.match(valid, /2,53/u);
  const hour = run('hour', good, { interaction: `document.querySelector('[data-growth-window="1h"]').click();` });
  assert.match(hour, /data-initial-paths="2"/u);
  assert.match(hour, /Erster Messpunkt/u);
  const decreasing = history([point('2026-10-12T11:30:00.000Z', 1020, 410, 3), point('2026-10-12T11:31:00.000Z', 1010, 400, 4)]);
  const refresh = run('refresh', history([decreasing.points[0]]), { next: decreasing });
  assert.match(refresh, /data-final-points="2 Messpunkte/u);
  assert.match(refresh, /Δ -10 im Messzeitraum/u);
  const relationship = run('topics-over-pages', history([decreasing.points[0]]), { next: decreasing,
    interaction: `document.querySelector('[data-growth-view="pages"]').click();` });
  assert.match(relationship, /data-final-view="pages"/u);
  assert.match(relationship, /data-final-x="Gelernte Seiten \(x\)"/u);
  assert.match(relationship, /data-final-y="Aktive kanonische Topics \(y\)"/u);
  assert.match(relationship, /data-final-points="2 Messpunkte/u);
  // Deletion sends the actual temporal line left and down; no x sorting or monotonic smoothing.
  assert.match(relationship, /d="M814\.00,28\.00 L806\.59,30\.73" class="growth-line growth-line-topics"/u);
  assert.doesNotMatch(relationship, /class="growth-line growth-line-pages"/u);
  const relationshipGaps = run('topics-over-pages-gaps', good, {
    interaction: `document.querySelector('[data-growth-view="pages"]').click(); document.querySelector('[data-growth-window="all"]').click();` });
  assert.match(relationshipGaps, /data-initial-paths="3"/u);
  const limited = run('limited', good, { data: { ...snapshot, graphLimited: true } });
  assert.match(limited, /Karte pausiert: mehr als 1\.000 gelernte Seiten/u);
  assert.match(limited, /id="count-learned">1\.010</u);
  assert.match(limited, /class="growth-line growth-line-pages"/u);
  const empty = run('empty', history([]));
  assert.match(empty, /data-initial-growth="Verlauf wird ab jetzt aufgezeichnet\."/u);
  for (const [name, invalid] of [
    ['unknown', { ...good, secret: '<img src=https://example.com>' }],
    ['counter', history([{ ...good.points.at(-1), learnedPages: -1 }])],
    ['timestamp', history([{ ...good.points.at(-1), at: '2026-02-30T11:30:00.000Z' }])],
    ['revision', history([point('2026-10-12T11:30:00.000Z', 1010, 400, 3), point('2026-10-12T11:31:00.000Z', 1010, 400, 2)])],
    ['oversized', history(Array(4097).fill(good.points.at(-1)))],
    ['mismatch', history([point('2026-10-12T11:30:00.000Z', 1010, 400, 3, 'd'.repeat(64))])],
    ['unavailable', null],
  ]) {
    const rejected = run(name, invalid);
    assert.match(rejected, /data-initial-growth="Verlauf derzeit nicht verfügbar\."/u);
    assert.match(rejected, /id="growth-plot"><\/g>/u);
    assert.doesNotMatch(rejected, /<img src=/u);
  }
  process.stdout.write('Growth dashboard isolated Chrome smoke passed.\n');
} finally {
  // Only synthetic fixtures and isolated browser profiles live in this unique temp directory.
  rmSync(temporary, { recursive: true, force: true });
}
