// Pure final32 identity/packet contracts. No IO, model, browser or capability.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { NODES } from '../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js';

export const CANDIDATE_SHA256 = 'd6843c87347a111277c04baf65062cf246ccd75fc883631d8c69e31563288052';
export const ROOT_IDS = Object.freeze(['games', 'nature', 'cooking', 'vehicles', 'science', 'technology', 'society', 'history', 'culture', 'sports', 'geography', 'health', 'business', 'languages', 'ideas-beliefs', 'education']);
export const BATCHES = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze(Array.from({ length: 4 }, (_, j) => `producer-transfer-${String(i * 4 + j + 1).padStart(3, '0')}`))));
export const sha = value => createHash('sha256').update(value).digest('hex');
export const digest = value => sha(JSON.stringify(value));
export function freeze(v) { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
function invalid() { throw new TypeError('Invalid fixed final producer contract'); }
export function record(v, keys) {
  if (!v || typeof v !== 'object' || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype || Reflect.ownKeys(v).length !== keys.length) invalid();
  const out = {}; for (const key of keys) { const d = Object.getOwnPropertyDescriptor(v, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid(); out[key] = d.value; } return out;
}
export function dense(v, maximum) {
  if (!Array.isArray(v) || types.isProxy(v) || Object.getPrototypeOf(v) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(v, 'length').value;
  if (length > maximum || Reflect.ownKeys(v).length !== length + 1) invalid();
  return Array.from({ length }, (_, i) => { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid(); return d.value; });
}
export function bounded(v, max, nonempty = true) { if (typeof v !== 'string' || !v.isWellFormed() || v.length > max || nonempty && !v.length || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)) invalid(); return v; }
export function hash(v) { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/u.test(v)) invalid(); return v; }
function field(v, key) { if (!v || typeof v !== 'object' || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype) invalid(); const d = Object.getOwnPropertyDescriptor(v, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid(); return d.value; }
export function validateCandidateStructure(candidate) {
  if (field(candidate, 'schema') !== 'hierarchy-current-producer-transfer-candidates/v1' || field(candidate, 'caseCount') !== 32 || field(candidate, 'rootCount') !== 16) invalid();
  const nodes = new Map(NODES.map(n => [n.id, n])), groups = new Set(), urls = new Set();
  const cases = dense(field(candidate, 'cases'), 32).map((raw, i) => {
    const id = bounded(field(raw, 'id'), 160), groupId = bounded(field(raw, 'entityGroup'), 160), url = bounded(field(raw, 'publicUrl'), 2048);
    const language = field(raw, 'language'), expectedRootId = field(raw, 'expectedRootId');
    if (id !== BATCHES.flat()[i] || groups.has(groupId) || urls.has(url) || !['en', 'de', 'nl', 'fr', 'es'].includes(language) || expectedRootId !== ROOT_IDS[Math.floor(i / 2)]) invalid();
    let u; try { u = new URL(url); } catch { invalid(); }
    if (u.href !== url || u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.search || !/^[a-z0-9.-]+$/u.test(u.hostname)) invalid();
    const path = dense(field(raw, 'supportedPathPrefix'), 8); let parentId = null;
    for (const n of path) { if (!nodes.has(n) || nodes.get(n).parentId !== parentId) invalid(); parentId = n; }
    if (path[0] !== expectedRootId || typeof field(raw, 'maximumSpecificityKnown') !== 'boolean') invalid();
    if (field(raw, 'labelScope') !== 'positive-prefix-only' || field(raw, 'split') !== 'current-producer-transfer-proposed') invalid();
    groups.add(groupId); urls.add(url);
    // Gold stays outside capture packets and never filters noisy captured text.
    return freeze({ id, groupId, url, language });
  });
  if (cases.length !== 32) invalid(); return freeze(cases);
}
export function fixedBatch(cases, batch) {
  if (!Number.isInteger(batch) || batch < 1 || batch > 8) invalid();
  const all = dense(cases, 32); if (all.length !== 32 || all.some((c, i) => field(c, 'id') !== BATCHES.flat()[i])) invalid();
  return freeze(all.slice((batch - 1) * 4, batch * 4).map(c => record(c, ['id', 'groupId', 'url', 'language'])));
}
export function validateProducerProfile(value) {
  const p = record(value, ['schema', 'producerId', 'inputConstructionHash', 'extractorVersions', 'producerProfileHash']);
  if (p.schema !== 'root-rank-target-producer-profile/v1' || !['current-static', 'browser-current'].includes(p.producerId)) invalid(); hash(p.inputConstructionHash); hash(p.producerProfileHash);
  const versions = dense(p.extractorVersions, 2);
  const expected = p.producerId === 'current-static' ? ['crawler-static-html-prefix/v1'] : ['article-container-prefix/v1', 'main-text-prefix/v1'];
  if (JSON.stringify(versions) !== JSON.stringify(expected)) invalid();
  const material = { schema: p.schema, producerId: p.producerId, inputConstructionHash: p.inputConstructionHash, extractorVersions: versions };
  if (digest(material) !== p.producerProfileHash) invalid(); return freeze({ ...material, producerProfileHash: p.producerProfileHash });
}
export function validateDocumentWitness(value, producerId) {
  if (producerId === 'current-static') {
    const d = record(value, ['kind', 'finalUrlHash', 'responseWitnessHash']);
    if (d.kind !== 'static-response') invalid(); hash(d.finalUrlHash); hash(d.responseWitnessHash); return freeze(d);
  }
  if (producerId !== 'browser-current') invalid();
  const d = record(value, ['kind', 'finalUrlHash', 'frameId', 'loaderId', 'navigationId', 'documentId']);
  if (d.kind !== 'browser-document') invalid(); hash(d.finalUrlHash);
  for (const k of ['frameId', 'loaderId', 'navigationId', 'documentId']) bounded(d[k], 160); return freeze(d);
}
export function sourceInputIdentity(value) {
  const a = record(value, ['id', 'groupId', 'url', 'sourceVersion', 'producerProfile', 'title', 'body', 'extractorVersion', 'documentWitness', 'originPolicyHash', 'pagePolicyHash']);
  bounded(a.id, 160); bounded(a.groupId, 160); bounded(a.url, 2048); bounded(a.sourceVersion, 160);
  bounded(a.title, 200, false); bounded(a.body, 4096); if (!a.body.trim()) invalid();
  const p = validateProducerProfile(a.producerProfile); if (!p.extractorVersions.includes(a.extractorVersion)) invalid();
  const d = validateDocumentWitness(a.documentWitness, p.producerId); if (d.finalUrlHash !== sha(a.url)) invalid();
  hash(a.originPolicyHash); hash(a.pagePolicyHash);
  return digest({ schema: 'current-producer-final-input/v1', id: a.id, groupId: a.groupId, url: a.url, sourceVersion: a.sourceVersion,
    producerId: p.producerId, producerProfileHash: p.producerProfileHash, titleSha256: sha(a.title), bodySha256: sha(a.body),
    extractorVersion: a.extractorVersion, documentWitness: d, originPolicyHash: a.originPolicyHash, pagePolicyHash: a.pagePolicyHash });
}
const PACKET_HEADER = ['schema', 'phase', 'batch', 'freezeHash', 'candidateSha256', 'labelSealSha256', 'selectionReceiptSha256', 'producerProfile', 'rows'];
export function buildInputPacket(value) {
  const a = record(value, PACKET_HEADER.filter(k => k !== 'schema'));
  if (!['static', 'browser'].includes(a.phase) || !Number.isInteger(a.batch) || a.batch < 1 || a.batch > 8) invalid();
  for (const key of ['freezeHash', 'candidateSha256', 'labelSealSha256', 'selectionReceiptSha256']) hash(a[key]);
  const profile = validateProducerProfile(a.producerProfile);
  if (profile.producerId !== (a.phase === 'static' ? 'current-static' : 'browser-current')) invalid();
  const ids = new Set(); let priorIndex = -1;
  const rows = dense(a.rows, 4).map(raw => {
    const r = record(raw, ['id', 'groupId', 'url', 'sourceVersion', 'title', 'body', 'extractorVersion', 'documentWitness', 'originPolicyHash', 'pagePolicyHash']);
    const index = BATCHES[a.batch - 1].indexOf(r.id); if (index <= priorIndex || ids.has(r.id)) invalid(); priorIndex = index; ids.add(r.id);
    const witness = validateDocumentWitness(r.documentWitness, profile.producerId), sourceInputHash = sourceInputIdentity({ ...r, documentWitness: witness, producerProfile: profile });
    return freeze({ ...r, documentWitness: witness, titleSha256: sha(r.title), bodySha256: sha(r.body), sourceInputHash });
  });
  const packet = freeze({ schema: 'current-producer-final-input-packet/v1', ...a, producerProfile: profile, rows });
  if (Buffer.byteLength(JSON.stringify(packet)) > 128 * 1024) invalid(); return packet;
}
export function validateInputPacket(value, context) {
  const a = record(value, PACKET_HEADER), c = record(context, ['phase', 'batch', 'freezeHash', 'candidateSha256', 'labelSealSha256', 'selectionReceiptSha256', 'producerProfile', 'cases', 'collectedIds']);
  if (a.schema !== 'current-producer-final-input-packet/v1') invalid();
  for (const key of ['phase', 'batch', 'freezeHash', 'candidateSha256', 'labelSealSha256', 'selectionReceiptSha256']) if (a[key] !== c[key]) invalid();
  if (JSON.stringify(validateProducerProfile(a.producerProfile)) !== JSON.stringify(validateProducerProfile(c.producerProfile))) invalid();
  const expected = dense(c.cases, 4).map(r => record(r, ['id', 'groupId', 'url', 'language']));
  if (JSON.stringify(expected.map(r => r.id)) !== JSON.stringify(BATCHES[c.batch - 1])) invalid();
  const rawRows = dense(a.rows, 4).map(raw => {
    const r = record(raw, ['id', 'groupId', 'url', 'sourceVersion', 'title', 'body', 'extractorVersion', 'documentWitness', 'originPolicyHash', 'pagePolicyHash', 'titleSha256', 'bodySha256', 'sourceInputHash']);
    const e = expected.find(c => c.id === r.id); if (!e || e.url !== r.url || e.groupId !== r.groupId) invalid();
    const { titleSha256, bodySha256, sourceInputHash, ...row } = r;
    bounded(row.title, 200, false); bounded(row.body, 4096); hash(titleSha256); hash(bodySha256); hash(sourceInputHash);
    if (sha(row.title) !== titleSha256 || sha(row.body) !== bodySha256 || sourceInputIdentity({ ...row, producerProfile: a.producerProfile }) !== sourceInputHash) invalid(); return row;
  });
  if (JSON.stringify(rawRows.map(r => r.id)) !== JSON.stringify(dense(c.collectedIds, 4))) invalid();
  const { schema, ...rest } = a; return buildInputPacket({ ...rest, rows: rawRows });
}
