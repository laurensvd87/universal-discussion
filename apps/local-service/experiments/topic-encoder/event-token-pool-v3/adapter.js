// Hash-pinned, aggregate-only event-level research adapter. No file IO here.
import { createHash } from 'node:crypto';

const fail = code => { throw new TypeError(code); };
const LANGUAGES = new Set(['en', 'nl', 'de', 'fr', 'es']);
const KEYS = 'body,eventKey,family,id,lang,title,viewpoint';
export const PINS = Object.freeze({
  A: '6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B',
  B: '2762DA5CE908A2E67092958BEAF3F6CD4F56515AA29D61962AA7C3F870CA2908',
  C1: '20BAB9B116C6F32C2FB7058C3D822AF333503EC36CBCF9CBB7365E9F45BAC581',
  C2: '44AC29625DFBD86F7AF2C278EAB991E042D0E6E0FA64A92D95D3B1F7951BBF6F',
  C3: '659F2E9A27651B6577D2686F8B3849E56E6A36984471620980BCCA68B880F1FE',
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

const expectedFamilies = chunk => {
  const prefix = chunk === 'A' || chunk === 'B' ? chunk : `C${chunk[1]}`;
  const number = chunk === 'A' || chunk === 'B' ? 6 : 2;
  return Array.from({ length: number }, (_, i) =>
    `${prefix}${String(i + 1).padStart(2, '0')}`);
};

export function parsePinnedBytes(bytes, chunk) {
  if (!(bytes instanceof Buffer) || !Object.hasOwn(PINS, chunk) ||
      bytes.length < 1 || bytes.length > 2_000_000 || sha256(bytes) !== PINS[chunk])
    fail('INPUT_DIGEST');
  const content = bytes.toString('utf8');
  if (!content.endsWith('\n')) fail('INPUT_FORMAT');
  const lines = content.trimEnd().split(/\r?\n/u);
  if (lines.length !== (chunk === 'A' || chunk === 'B' ? 108 : 36)) fail('INPUT_COUNT');
  try { return lines.map(line => JSON.parse(line)); }
  catch { fail('INPUT_FORMAT'); }
}

export function validateChunk(rows, chunk) {
  if (!Object.hasOwn(PINS, chunk) || !Array.isArray(rows) ||
      rows.length !== (chunk === 'A' || chunk === 'B' ? 108 : 36)) fail('ROW_COUNT');
  const allowedFamilies = new Set(expectedFamilies(chunk));
  const ids = new Set(), events = new Map(), families = new Map();
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join(',') !== KEYS ||
        typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
        !allowedFamilies.has(row.family) ||
        typeof row.eventKey !== 'string' ||
        !new RegExp(`^${row.family}-E[1-3]$`, 'u').test(row.eventKey) ||
        !LANGUAGES.has(row.lang) ||
        typeof row.viewpoint !== 'string' || !row.viewpoint ||
        typeof row.title !== 'string' || row.title.trim().length < 20 ||
        typeof row.body !== 'string' || row.body.trim().length < 220 ||
        row.body.length > 8192) fail('ROW_SCHEMA');
    ids.add(row.id);
    const members = events.get(row.eventKey) ?? [];
    members.push(row); events.set(row.eventKey, members);
    const familyEvents = families.get(row.family) ?? new Set();
    familyEvents.add(row.eventKey); families.set(row.family, familyEvents);
  }
  if (families.size !== allowedFamilies.size ||
      events.size !== allowedFamilies.size * 3 ||
      [...families.values()].some(labels => labels.size !== 3)) fail('EVENT_STRUCTURE');
  for (const members of events.values()) {
    const languageCounts = new Map();
    for (const row of members)
      languageCounts.set(row.lang, (languageCounts.get(row.lang) ?? 0) + 1);
    if (members.length !== 6 || languageCounts.size !== 5 ||
        [...languageCounts.values()].filter(count => count === 2).length !== 1 ||
        [...languageCounts.values()].some(count => count < 1 || count > 2) ||
        new Set(members.map(row => row.viewpoint)).size !== 6) fail('EVENT_STRUCTURE');
  }
  return rows.map(row => ({ id: row.id, eventKey: row.eventKey,
    categories: [row.family], lang: row.lang,
    title: row.title, lead: row.body.slice(0, 384) }));
}

export function combinePartitions(a, b, c1, c2, c3) {
  const train = a.concat(b), development = c1.concat(c2, c3);
  const all = train.concat(development);
  if (train.length !== 216 || development.length !== 108 ||
      new Set(all.map(row => row.id)).size !== 324 ||
      new Set(train.map(row => row.categories[0])).size !== 12 ||
      new Set(development.map(row => row.categories[0])).size !== 6 ||
      new Set(train.map(row => row.eventKey)).size !== 36 ||
      new Set(development.map(row => row.eventKey)).size !== 18 ||
      train.some(row => development.some(other =>
        row.categories[0] === other.categories[0] ||
        row.eventKey === other.eventKey))) fail('SPLIT_LEAKAGE');
  return { train, development };
}

export function partitionTrain(train) {
  if (!Array.isArray(train) || train.length !== 216) fail('TRAIN_COUNT');
  const names = [...new Set(train.map(doc => doc.categories[0]))].sort((a, b) => {
    const left = sha256(Buffer.from(a)), right = sha256(Buffer.from(b));
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (names.length !== 12) fail('FAMILY_COUNT');
  const fitNames = new Set(names.slice(0, 9));
  const fit = train.filter(doc => fitNames.has(doc.categories[0]));
  const calibration = train.filter(doc => !fitNames.has(doc.categories[0]));
  if (fit.length !== 162 || calibration.length !== 54 ||
      new Set(fit.map(doc => doc.eventKey)).size !== 27 ||
      new Set(calibration.map(doc => doc.eventKey)).size !== 9)
    fail('FAMILY_SPLIT');
  return { fit, calibration };
}
