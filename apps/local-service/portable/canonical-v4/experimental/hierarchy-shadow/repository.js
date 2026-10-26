// Explicit isolated SHADOW storage. Caller mirrors do NOT prove canonical Source
// existence, ownership, visibility, routes, generation or write/provider authority.
import { readFile } from 'node:fs/promises';
import { types } from 'node:util';

export class HierarchyShadowError extends TypeError {
  constructor(code, message) { super(message); this.name = 'HierarchyShadowError'; this.code = code; }
}
const invalid = message => { throw new HierarchyShadowError('invalid-input', message); };
const capacity = message => { throw new HierarchyShadowError('capacity', message); };
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) invalid('Expected exact plain SHADOW data record');
  const result = {};
  for (const key of fields) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) invalid('Expected SHADOW data fields');
    result[key] = d.value;
  }
  return result;
}
function text(value) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid('Invalid SHADOW identifier/label');
  if (value.length > 160) capacity('SHADOW UTF-16 string capacity');
  return value;
}
const nullable = value => value === null ? null : text(value);
function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid('Invalid SHADOW input hash'); return value; }
function nodes(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid('Expected SHADOW node array');
  if (value.length > 128) capacity('SHADOW node capacity');
  if (Reflect.ownKeys(value).length !== value.length + 1) invalid('Expected dense SHADOW node array');
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) invalid('Expected SHADOW node data');
    const n = record(d.value, ['id', 'parentId', 'label']);
    result.push({ id: text(n.id), parentId: nullable(n.parentId), label: text(n.label) });
  }
  return result;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
async function query(database, sql, values = []) {
  try { return await database.query(sql, values); }
  catch (error) {
    const code = { P2001: 'invalid-input', P2002: 'capacity', P2003: 'immutable' }[error?.code];
    if (code) throw new HierarchyShadowError(code, error.message);
    throw error;
  }
}
async function call(database, name, values) {
  const args = values.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(database, `SELECT hierarchy_shadow.${name}(${args}) AS result`, values);
  return freeze(rows[0].result);
}

/** Opt-in only: does not register a migration or inspect any canonical schema. */
export async function initializeHierarchyShadow(database) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await database.transaction(async tx => tx.exec(sql));
}
export async function publishShadowHierarchy(database, input) {
  const a = record(input, ['expectedRevision', 'revision', 'artifactHash', 'modelHash', 'policyHash', 'nodes']);
  return call(database, 'publish_shadow_hierarchy', [nullable(a.expectedRevision), text(a.revision), hash(a.artifactHash),
    hash(a.modelHash), hash(a.policyHash), JSON.stringify(nodes(a.nodes))]);
}
export async function registerShadowSourceWitness(database, input) {
  const a = record(input, ['sourceId', 'sourceInputHash']);
  return call(database, 'register_shadow_source', [text(a.sourceId), hash(a.sourceInputHash)]);
}
export async function commitShadowDecision(database, input) {
  const a = record(input, ['revision', 'artifactHash', 'modelHash', 'policyHash', 'sourceId', 'sourceInputHash', 'sourceWitnessVersion', 'nodeId']);
  if (typeof a.sourceWitnessVersion !== 'string' || !/^[1-9][0-9]{0,18}$/u.test(a.sourceWitnessVersion)) invalid('Invalid SHADOW witness version');
  return call(database, 'commit_shadow_decision', [text(a.revision), hash(a.artifactHash), hash(a.modelHash), hash(a.policyHash),
    text(a.sourceId), hash(a.sourceInputHash), a.sourceWitnessVersion, nullable(a.nodeId)]);
}
export async function bindShadowRoot(database, input) {
  const a = record(input, ['revision', 'nodeId', 'sourceId', 'sourceInputHash', 'sourceWitnessVersion', 'canonicalRootId', 'canonicalDestinationId']);
  if (typeof a.sourceWitnessVersion !== 'string' || !/^[1-9][0-9]{0,18}$/u.test(a.sourceWitnessVersion)) invalid('Invalid SHADOW binding witness version');
  return call(database, 'bind_shadow_root', [text(a.revision), text(a.nodeId), text(a.sourceId), hash(a.sourceInputHash),
    a.sourceWitnessVersion, text(a.canonicalRootId), text(a.canonicalDestinationId)]);
}
export async function deleteShadowSource(database, input) {
  const a = record(input, ['sourceId']); return call(database, 'delete_shadow_source', [text(a.sourceId)]);
}
export async function deleteShadowRoot(database, input) {
  const a = record(input, ['canonicalRootId']); return call(database, 'delete_shadow_root', [text(a.canonicalRootId)]);
}
export async function revokeShadowRevision(database, input) {
  const a = record(input, ['revision']); return call(database, 'revoke_shadow_revision', [text(a.revision)]);
}

export async function readShadowPath(database, input) {
  const a = record(input, ['sourceId']); text(a.sourceId);
  const { rows } = await query(database, `SELECT s.current_revision AS revision,d.node_id,
    d.source_id IS NOT NULL AS decided,r.artifact_hash,r.model_hash,r.policy_hash,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.node_id,'label',n.label) ORDER BY c.distance DESC)
      FROM hierarchy_shadow.ancestors c JOIN hierarchy_shadow.nodes n ON n.revision=c.revision AND n.node_id=c.ancestor_id
      WHERE c.revision=d.revision AND c.node_id=d.node_id),'[]'::jsonb) AS path
    FROM hierarchy_shadow.state s
    LEFT JOIN hierarchy_shadow.source_witnesses w ON w.source_id=$1
    LEFT JOIN hierarchy_shadow.decisions d ON d.source_id=w.source_id AND d.input_hash=w.input_hash
      AND d.witness_version=w.witness_version AND d.revision=s.current_revision
      AND NOT EXISTS(SELECT 1 FROM hierarchy_shadow.revoked_revisions v WHERE v.revision=d.revision)
    LEFT JOIN hierarchy_shadow.revisions r ON r.revision=d.revision WHERE s.singleton`, [a.sourceId]);
  const row = rows[0];
  return freeze({ status: !row.decided ? 'unassigned' : row.node_id === null ? 'unresolved' : 'assigned',
    revision: row.revision, artifactHash: row.artifact_hash, modelHash: row.model_hash, policyHash: row.policy_hash,
    nodeId: row.node_id, path: row.path });
}

/** IDs only. One snapshot fences both taxonomy and scoped membership changes. */
export async function readShadowParentRoots(database, input) {
  const a = record(input, ['nodeId', 'expectedRevision', 'expectedFeedVersion', 'afterRootId', 'limit']);
  text(a.nodeId); nullable(a.expectedRevision); nullable(a.afterRootId);
  if (a.expectedFeedVersion !== null && (typeof a.expectedFeedVersion !== 'string' ||
      !/^[1-9][0-9]{0,18}$/u.test(a.expectedFeedVersion))) invalid('Invalid scoped SHADOW feed version');
  if (a.expectedFeedVersion !== null && a.expectedRevision === null) invalid('SHADOW feed version requires exact revision');
  if (!Number.isInteger(a.limit) || a.limit < 1 || a.limit > 100) invalid('SHADOW page limit must be 1..100');
  if (a.afterRootId !== null && (a.expectedRevision === null || a.expectedFeedVersion === null)) invalid('SHADOW pagination requires exact revision and scoped feed version');
  const { rows } = await query(database, `SELECT s.current_revision AS revision,f.version::text AS feed_version,
    EXISTS(SELECT 1 FROM hierarchy_shadow.nodes n WHERE n.revision=s.current_revision AND n.node_id=$1) AS node_exists,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('canonicalRootId',q.canonical_root_id,
      'canonicalDestinationId',q.canonical_destination_id) ORDER BY q.canonical_root_id COLLATE "C") FROM (
      SELECT r.canonical_root_id COLLATE "C" AS canonical_root_id,r.canonical_destination_id FROM hierarchy_shadow.root_registry r
      JOIN hierarchy_shadow.ancestors c ON c.revision=r.semantic_revision AND c.node_id=r.semantic_node_id AND c.ancestor_id=$1
      WHERE r.semantic_revision=s.current_revision AND ($2::text IS NULL OR $2=s.current_revision)
        AND ($5::text IS NULL OR $5=f.version::text)
        AND NOT EXISTS(SELECT 1 FROM hierarchy_shadow.revoked_revisions v WHERE v.revision=r.semantic_revision)
        AND EXISTS(SELECT 1 FROM hierarchy_shadow.source_root_bindings b
          JOIN hierarchy_shadow.source_witnesses w ON w.source_id=b.source_id WHERE b.canonical_root_id=r.canonical_root_id)
        AND ($3::text IS NULL OR r.canonical_root_id COLLATE "C">$3::text COLLATE "C")
      ORDER BY r.canonical_root_id COLLATE "C" LIMIT $4
    ) q),'[]'::jsonb) AS roots FROM hierarchy_shadow.state s
      LEFT JOIN hierarchy_shadow.feed_versions f ON f.revision=s.current_revision AND f.node_id=$1 WHERE s.singleton`,
  [a.nodeId, a.expectedRevision, a.afterRootId, a.limit + 1, a.expectedFeedVersion]);
  const r = rows[0], stale = a.expectedRevision !== null && a.expectedRevision !== r.revision;
  const staleFeed = a.expectedFeedVersion !== null && a.expectedFeedVersion !== r.feed_version;
  const refs = r.roots.slice(0, a.limit);
  return freeze({ status: stale ? 'stale-revision' : !r.node_exists ? 'missing-node' : staleFeed ? 'stale-feed' : 'ready',
    revision: r.revision, feedVersion: r.feed_version,
    rootRefs: refs, nextAfterRootId: r.roots.length > a.limit ? refs.at(-1).canonicalRootId : null });
}
