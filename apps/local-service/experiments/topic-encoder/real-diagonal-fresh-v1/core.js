import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');

// Domain-separated order over whole, formerly unselected event groups. The
// original 1,192-document selection is reconstructed, never changed.
export function selectFreshEvents(all, previous, preliminary, budget = 300) {
  if (!Array.isArray(all) || !Array.isArray(previous) || !Array.isArray(preliminary) || budget !== 300)
    throw new TypeError('SELECTION_INPUT');
  const old = new Set(previous.map(row => row.id));
  const early = new Set(preliminary.map(row => row.id));
  const exposedEvents = new Set([...previous, ...preliminary].map(row => row.eventKey));
  const exposedInputs = new Set([...previous, ...preliminary].map(row => row.duplicateKey));
  if (old.size !== 1192 || all.length !== 4687 ||
      all.filter(row => old.has(row.id)).length !== 1192 ||
      early.size !== 298 || all.filter(row => early.has(row.id)).length !== 298)
    throw new TypeError('PREVIOUS_SELECTION_MISMATCH');
  const groups = new Map();
  for (const row of all) {
    if (typeof row?.eventKey !== 'string' || typeof row?.familyKey !== 'string' ||
        typeof row?.id !== 'string') throw new TypeError('ROW_SHAPE');
    const members = groups.get(row.eventKey) ?? [];
    members.push(row);
    groups.set(row.eventKey, members);
  }
  const available = [...groups].filter(([eventKey, members]) =>
    !exposedEvents.has(eventKey) &&
    members.every(row => !old.has(row.id) && !early.has(row.id) &&
      !exposedInputs.has(row.duplicateKey)));
  if (groups.size !== 370 ||
      [...groups.values()].some(members =>
        members.some(row => old.has(row.id)) && !members.every(row => old.has(row.id)) ||
        members.some(row => early.has(row.id)) && !members.every(row => early.has(row.id))))
    throw new TypeError('REMAINDER_MISMATCH');
  available.sort(([a], [b]) => hash(`fresh-v1\0${a}`).localeCompare(hash(`fresh-v1\0${b}`)));
  const selected = [];
  for (const [, members] of available)
    if (selected.length + members.length <= budget) selected.push(...members);
  if (selected.length < 200 || selected.length > budget ||
      new Set(selected.map(row => row.eventKey)).size < 3)
    throw new TypeError('FRESH_SELECTION_BOUND');
  selected.sort((a, b) => a.eventKey.localeCompare(b.eventKey) ||
    a.duplicateKey.localeCompare(b.duplicateKey) || a.id.localeCompare(b.id));
  return { documents: selected,
    availableArticles: available.reduce((n, [, members]) => n + members.length, 0),
    availableEvents: available.length,
    exposedEventsExcluded: exposedEvents.size,
    excludedPreliminaryArticles: early.size,
    excludedPriorArticles: old.size };
}

export { compareRelativeCoverage, verifyReviewedDigests } from '../real-diagonal-holdout-v1/core.js';
