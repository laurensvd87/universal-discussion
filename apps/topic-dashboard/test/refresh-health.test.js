import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const at = Date.parse('2026-10-19T12:00:00.000Z');
const snapshot = { schemaVersion: 2, generatedAt: new Date(at).toISOString(), graphLimited: true,
  counts: { totalSources: 50, learnedSources: 42, topics: 4, totalTopics: 8, multiMemberTopics: 3, singletonTopics: 1 },
  topics: [], pages: [], edges: [] };

function fixture({ now = at, embedded = true, data = snapshot } = {}) {
  let clock = now, next = 0;
  const nodes = new Map(), timers = new Map(), scripts = [];
  const element = () => ({ children: [], dataset: {}, hidden: false, textContent: '', value: '', attributes: {}, handlers: {},
    style: { setProperty() {} }, classList: { add() {}, remove() {} },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.handlers[key] = callback; }, remove() { this.removed = true; } });
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  get('dashboard-data').textContent = embedded ? JSON.stringify(data) : '';
  const context = { document: { getElementById: get, createElement: element, createElementNS: element,
    querySelectorAll: () => [], head: { append(script) { assert.match(script.src, /^\.\/snapshot\.js\?refresh=\d+$/u); scripts.push(script); } } },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    URL, Intl, setTimeout(callback, ms) { const id = ++next; timers.set(id, { callback, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, ms) { const id = ++next; timers.set(id, { callback, at: clock + ms, ms }); return id; },
    fetch: async () => ({ ok: true, json: async () => data }) };
  runInNewContext(app, context);
  return { get, context, scripts,
    complete(script = scripts.at(-1), data = snapshot) { context.__topicAtlasSnapshot = data; script.onload(); },
    advance(ms) {
      const end = clock + ms;
      for (let runs = 0; runs < 1000; runs++) {
        const entry = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry; clock = timer.at;
        if (timer.ms) timer.at += timer.ms; else timers.delete(id);
        timer.callback();
      }
      clock = end;
    },
  };
}

test('automatic bridge errors persist beyond transient toast and retain last known counters', () => {
  const ui = fixture(); ui.scripts[0].onerror(); ui.advance(6000);
  assert.equal(ui.get('snapshot-health').dataset.state, 'error');
  assert.match(ui.get('snapshot-health').textContent, /Aktualisierung fehlgeschlagen/u);
  assert.equal(ui.get('count-learned').textContent, '42');
  assert.doesNotMatch(ui.get('snapshot-health').textContent, /Crawler (?:gestoppt|offline)|Datenbank offline/u);
  ui.complete(); assert.equal(ui.get('snapshot-health').dataset.state, 'current');
});

test('identical fresh snapshots are healthy without new ingestion, stale begins at 180 seconds', () => {
  const fresh = fixture({ now: at + 179999 }); fresh.complete();
  assert.equal(fresh.get('snapshot-health').dataset.state, 'current');
  const stale = fixture({ now: at + 180000 }); stale.complete();
  assert.equal(stale.get('snapshot-health').dataset.state, 'stale');
  assert.match(stale.get('snapshot-health').textContent, /mindestens 3 Minuten/u);
  assert.equal(stale.get('count-learned').textContent, '42');
});

test('fresh unchanged snapshot ages even while the bridge is pending', () => {
  const ui = fixture({ now: at + 179000 }); ui.advance(3000);
  assert.equal(ui.get('snapshot-health').dataset.state, 'stale');
});

test('timestamp more than 30 seconds in the future has unknown freshness without losing counts', () => {
  const tolerated = fixture({ now: at - 30000 }); tolerated.complete();
  assert.equal(tolerated.get('snapshot-health').dataset.state, 'current');
  const skewed = fixture({ now: at - 30001 }); skewed.complete();
  assert.equal(skewed.get('snapshot-health').dataset.state, 'clock-skew');
  assert.match(skewed.get('snapshot-health').textContent, /Uhrzeitabweichung; Aktualität nicht prüfbar/u);
  assert.equal(skewed.get('count-learned').textContent, '42');
});

test('unchanged healthy polling does not repeatedly mutate the accessible live region', () => {
  const ui = fixture(), indicator = ui.get('snapshot-health'); let text = indicator.textContent, writes = 0;
  Object.defineProperty(indicator, 'textContent', { get: () => text, set(value) { text = value; writes++; } });
  ui.complete(); ui.advance(3000); ui.complete(); ui.advance(3000); ui.complete();
  assert.equal(writes, 0);
});

test('missing bridge events time out, release the lane, and late saved callbacks are inert', () => {
  const ui = fixture(), first = ui.scripts[0], lateLoad = first.onload, lateError = first.onerror;
  ui.advance(10000);
  assert.equal(first.removed, true); assert.equal(first.onload, null); assert.equal(first.onerror, null);
  assert.match(ui.get('snapshot-health').textContent, /Zeitlimit/u);
  ui.advance(2000); assert.equal(ui.scripts.length, 2);
  ui.context.__topicAtlasSnapshot = { ...snapshot, counts: { ...snapshot.counts, learnedSources: 999 } };
  lateLoad(); lateError();
  assert.equal(ui.get('count-learned').textContent, '42');
  assert.equal(ui.get('snapshot-health').dataset.state, 'error');
  ui.complete(); assert.equal(ui.get('snapshot-health').dataset.state, 'current');
  lateLoad(); lateError();
  assert.equal(ui.get('snapshot-health').dataset.state, 'current', 'obsolete failures cannot replace newer success');
  ui.advance(3000); assert.equal(ui.scripts.length, 3, 'obsolete callback cannot close a newer request');
});

test('invalid automatic snapshot is a fixed private error and cannot replace last good data', () => {
  const ui = fixture(); ui.complete(undefined, { generatedAt: 'PRIVATE_DETAIL', topics: 'PRIVATE_DETAIL' });
  assert.equal(ui.get('snapshot-health').dataset.state, 'error');
  assert.doesNotMatch(ui.get('snapshot-health').textContent, /PRIVATE_DETAIL/u);
  assert.equal(ui.get('count-learned').textContent, '42');
});

test('standalone JSON does not pretend to monitor a watcher or treat age as daemon failure', async () => {
  const ui = fixture({ embedded: false, now: at + 86400000 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.scripts.length, 0);
  assert.equal(ui.get('snapshot-health').dataset.state, 'static');
  assert.match(ui.get('snapshot-health').textContent, /keine automatische Aktualisierung/u);
});

test('stats-only capacity explicitly differs from an empty search', () => {
  const ui = fixture();
  const content = ui.get('empty-state').children.map(child => child.textContent).join(' ');
  assert.match(content, /Kapazitätsgründen/u); assert.match(content, /kein leeres Suchergebnis/u);
  assert.doesNotMatch(content, /Keine passenden Seiten/u);
});
