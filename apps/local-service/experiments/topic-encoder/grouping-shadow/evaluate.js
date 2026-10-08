// Offline synthetic comparison. The event labels below are evaluation truth only.
import { planAdaptiveTopics } from '../../../src/domain/adaptive-topics.js';

const FLOOR = 0.90;
const EPS = 1e-12;
const sorted = ids => [...ids].sort();
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const score = (a, b) => dot(a.embedding.values, b.embedding.values);

export function page(id, event, title, angle) {
  const vector = [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
  return { id, event, title, url: `https://${id}.example.test/article`,
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: vector } };
}

// A deliberately narrow, visible title cue. It uses no hidden event label.
// This is a comparator, not a production extraction proposal.
export function titleCue(title) {
  const text = title.toLowerCase();
  const date = text.match(/\bapril (2|9),? 2025\b/u)?.[1];
  const action = /\b(exemption|exemptions)\b/u.test(text) ? 'exemptions' :
    /\b(announcement|announces|announced)\b/u.test(text) ? 'announcement' : null;
  return date && action && /\btariffs?\b/u.test(text) ? `tariff:${action}:april-${date}-2025` : null;
}

function greedyCompleteLink(pages, { cue = false, floor = FLOOR } = {}) {
  const byId = new Map(pages.map(item => [item.id, item]));
  const groups = pages.map(item => [item.id]).sort((a, b) => a[0].localeCompare(b[0]));
  const minimum = (a, b) => Math.min(...a.flatMap(id => b.map(other => score(byId.get(id), byId.get(other)))));
  const compatible = (a, b) => !cue || [...a, ...b].every(id => {
    const key = titleCue(byId.get(id).title);
    return key !== null && key === titleCue(byId.get(a[0]).title);
  });
  for (;;) {
    const candidates = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (!compatible(groups[i], groups[j])) continue;
      const similarity = minimum(groups[i], groups[j]);
      if (similarity + EPS >= floor) candidates.push({ i, j, similarity,
        key: `${groups[i].join(',')}|${groups[j].join(',')}` });
    }
    candidates.sort((a, b) => b.similarity - a.similarity || a.key.localeCompare(b.key));
    if (!candidates.length) break;
    const { i, j } = candidates[0];
    groups[i] = sorted([...groups[i], ...groups[j]]);
    groups.splice(j, 1);
    groups.sort((a, b) => a.join(',').localeCompare(b.join(',')));
  }
  return groups;
}

export function compare(pages) {
  const baseline = planAdaptiveTopics({ sources: pages, sourceLinks: [] }).partitions.map(p => p.sourceIds);
  const alternatives = {
    current: baseline,
    completeLink90: greedyCompleteLink(pages),
    completeLink94: greedyCompleteLink(pages, { floor: 0.94 }),
    titleCueCompleteLink90: greedyCompleteLink(pages, { cue: true })
  };
  const metrics = Object.fromEntries(Object.entries(alternatives).map(([name, groups]) => {
    const joined = new Set(groups.flatMap(ids => ids.flatMap((id, i) => ids.slice(i + 1).map(other => [id, other].sort().join('|')))));
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
      const same = pages[i].event === pages[j].event;
      const predicted = joined.has([pages[i].id, pages[j].id].sort().join('|'));
      if (same && predicted) tp++;
      else if (same) fn++;
      else if (predicted) fp++;
      else tn++;
    }
    return [name, { tp, fp, fn, tn, groups: groups.length }];
  }));
  return { alternatives, metrics };
}

export function fixtures() {
  const near = Math.acos(0.90963);
  const competitor = near + Math.acos(0.91400);
  const a = page('announcement-a', 'announcement',
    'Trump tariff announcement April 2, 2025 raises economic fears', 0);
  const b = page('announcement-b', 'announcement',
    'Trump announces tariffs April 2, 2025 and American Dream', near);
  const c = page('exemption-neighbor', 'exemptions',
    'Tariff exemptions April 9, 2025 reshape trade', competitor);
  const views = [
    ['guardian', 'Trump tariff announcement April 2, 2025 endangers economy', -0.20],
    ['fox', 'Trump announces tariffs April 2, 2025 and American Dream', 0.20],
    ['wire', 'Tariff announcement April 2, 2025 details reciprocal rates', 0],
    ['economist', 'Tariff announcement April 2, 2025 alarms trading partners', -0.10],
    ['business', 'Trump tariff announcement April 2, 2025 lifts manufacturers', 0.10],
    ['global', 'Tariff announcement April 2, 2025 draws world reaction', 0.05],
    ['finance', 'Tariff announcement April 2, 2025 weighs on markets', -0.05]
  ];
  const same = views.map(([id, title, angle]) => page(id, 'announcement', title, angle));
  const adjacent = [
    page('exemption-a', 'exemptions', 'Trump tariff exemptions April 9, 2025 announced', 0.38),
    page('exemption-b', 'exemptions', 'Tariff exemptions April 9, 2025 surprise importers', 0.42)
  ];
  return {
    strongerWrongNeighbor: [a, b, c],
    threeSameEvent: [
      page('three-a', 'announcement', 'Tariff announcement April 2, 2025 view A', -0.20),
      page('three-b', 'announcement', 'Tariff announcement April 2, 2025 view B', 0),
      page('three-c', 'announcement', 'Tariff announcement April 2, 2025 view C', 0.20)
    ],
    twoViews: [same[0], same[1]],
    crowd: same,
    adjacent: [...same, ...adjacent]
  };
}
