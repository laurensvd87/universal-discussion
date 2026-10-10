import { createHash } from 'node:crypto';
export { compareRelativeCoverage, verifyReviewedDigests } from '../real-diagonal-holdout-v1/core.js';

const hash = value => createHash('sha256').update(value).digest('hex');

// Whole-event selection, disjoint from every known scored cohort. Exact
// title/384-lead keys guard against content reuse across different labels.
export function selectBodyTransferEvents(all, previous, preliminary, fresh, budget = 300) {
  if (!Array.isArray(all) || !Array.isArray(previous) || !Array.isArray(preliminary) ||
      !Array.isArray(fresh) || budget !== 300) throw new TypeError('SELECTION_INPUT');
  const cohorts = [[previous, 1192], [preliminary, 298], [fresh, 292]];
  const byId = new Map(all.map(row => [row.id, row]));
  if (all.length !== 4687 || byId.size !== all.length ||
      cohorts.some(([rows, size]) => rows.length !== size ||
        new Set(rows.map(row => row.id)).size !== size ||
        rows.some(row => byId.get(row.id) !== row)))
    throw new TypeError('PREVIOUS_SELECTION_MISMATCH');
  const groups = new Map();
  for (const row of all) {
    if (typeof row?.id !== 'string' || typeof row?.eventKey !== 'string' ||
        typeof row?.duplicateKey !== 'string' || !row.duplicateKey)
      throw new TypeError('ROW_SHAPE');
    const members = groups.get(row.eventKey) ?? [];
    members.push(row); groups.set(row.eventKey, members);
  }
  if (groups.size !== 370 || cohorts.some(([rows]) => {
    const ids = new Set(rows.map(row => row.id));
    return [...groups.values()].some(members =>
      members.some(row => ids.has(row.id)) && !members.every(row => ids.has(row.id)));
  })) throw new TypeError('REMAINDER_MISMATCH');
  const exposedEvents = new Set(cohorts.flatMap(([rows]) => rows.map(row => row.eventKey)));
  const exposedInputs = new Set(cohorts.flatMap(([rows]) => rows.map(row => row.duplicateKey)));
  const available = [...groups].filter(([key, members]) =>
    !exposedEvents.has(key) && members.every(row => !exposedInputs.has(row.duplicateKey)));
  available.sort(([a], [b]) => hash(`body-transfer-v1\0${a}`).localeCompare(hash(`body-transfer-v1\0${b}`)));
  const selected = [];
  for (const [, members] of available)
    if (selected.length + members.length <= budget) selected.push(...members);
  if (selected.length < 250 || selected.length > 300 ||
      new Set(selected.map(row => row.eventKey)).size < 3)
    throw new TypeError('BODY_SELECTION_BOUND');
  selected.sort((a, b) => a.eventKey.localeCompare(b.eventKey) ||
    a.duplicateKey.localeCompare(b.duplicateKey) || a.id.localeCompare(b.id));
  return { documents: selected,
    availableArticles: available.reduce((n, [, members]) => n + members.length, 0),
    availableEvents: available.length,
    exposedEventsExcluded: exposedEvents.size };
}

export function assertAlignedCorpus(shortRows, bodyRows) {
  if (!Array.isArray(shortRows) || !Array.isArray(bodyRows) ||
      shortRows.length !== 4687 || bodyRows.length !== shortRows.length)
    throw new TypeError('CORPUS_ALIGNMENT');
  for (let i = 0; i < shortRows.length; i++) {
    const a = shortRows[i], b = bodyRows[i];
    if (a.id !== b.id || a.eventKey !== b.eventKey || a.duplicateKey !== b.duplicateKey ||
        a.title !== b.title || a.lang !== b.lang || a.category !== b.category ||
        a.split !== b.split || !b.lead.startsWith(a.lead))
      throw new TypeError('CORPUS_ALIGNMENT');
  }
  return true;
}
