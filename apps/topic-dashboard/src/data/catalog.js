import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { assertValidPersistedState } from "../../../local-service/src/domain/persisted-state.js";
import { MAX_DOCUMENT_BYTES } from "../../../local-service/src/domain/repository-contract.js";
import { LEARNED_SOURCE_PROVENANCE } from "../../../local-service/src/domain/learned-sources.js";

const MAX_GRAPH_PAGES = 1_000;
const NEIGHBORS_PER_PAGE = 3;

// Opens the existing service database without creating, migrating, or writing it.
export function loadDashboardData(databasePath, { now = () => new Date() } = {}) {
  if (!statSync(databasePath).isFile()) throw new Error("Dashboard database is not a file");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const objects = database.prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (objects.length !== 1 || objects[0].name !== "demo_state" || objects[0].type !== "table") {
      throw new Error("Unsupported dashboard database schema");
    }
    const columns = database.prepare("PRAGMA table_info(demo_state)").all().map((column) => column.name);
    if (columns.join(",") !== "singleton,schema,generation,revision,document") {
      throw new Error("Unsupported dashboard database schema");
    }
    const row = database.prepare("SELECT schema, generation, revision, document FROM demo_state WHERE singleton = 1").get();
    if (!row || row.schema !== "demo-state/v2" || typeof row.document !== "string" ||
        Buffer.byteLength(row.document, "utf8") > MAX_DOCUMENT_BYTES) {
      throw new Error("Unsupported or incomplete dashboard snapshot");
    }
    let state;
    try { state = JSON.parse(row.document); }
    catch { throw new Error("Dashboard snapshot is unreadable"); }
    if (state.schema !== row.schema || state.generation !== row.generation || state.revision !== row.revision) {
      throw new Error("Dashboard snapshot metadata is inconsistent");
    }
    assertValidPersistedState(state);
    return buildDashboardSnapshot(state, { now });
  } finally {
    database.close();
  }
}

// State remains private in memory. The returned allowlisted DTO contains no
// embeddings, comments, account identifiers, operation IDs, or page extracts.
export function buildDashboardSnapshot(state, { now = () => new Date() } = {}) {
  assertValidPersistedState(state);
  const learned = state.sources.filter((source) => source.provenance === LEARNED_SOURCE_PROVENANCE)
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (learned.length > MAX_GRAPH_PAGES) {
    throw new Error(`Dashboard capacity exceeded: ${learned.length} pages; maximum ${MAX_GRAPH_PAGES}`);
  }
  const links = new Map(state.sourceLinks.map((link) => [link.sourceId, link.topicId]));
  const unitVectors = learned.map((source) => {
    const values = source.embedding.values;
    const length = Math.hypot(...values);
    return values.map((value) => value / length);
  });
  const positions = principalCoordinates(unitVectors);
  const pages = learned.map((source, index) => ({
    id: source.id, title: source.title, url: source.url, host: new URL(source.url).hostname,
    topicId: links.get(source.id), x: positions[index].x, y: positions[index].y,
  }));
  const byTopic = new Map();
  for (const page of pages) {
    if (!byTopic.has(page.topicId)) byTopic.set(page.topicId, []);
    byTopic.get(page.topicId).push(page);
  }
  const topics = state.topics.filter((topic) => byTopic.has(topic.id)).map((topic) => {
    const members = byTopic.get(topic.id);
    return { id: topic.id, title: topic.title, kind: topic.kind, pageCount: members.length,
      x: mean(members.map((page) => page.x)), y: mean(members.map((page) => page.y)) };
  });
  const edges = nearestNeighborEdges(learned, unitVectors);
  const catalogRevision = createHash("sha256")
    .update(JSON.stringify([state.generation, state.revision]), "utf8").digest("hex");
  return { schemaVersion: 1, generatedAt: now().toISOString(), catalogRevision,
    counts: { totalSources: state.sources.length, learnedSources: learned.length,
      displayedPages: pages.length, topics: topics.length, totalTopics: state.topics.length }, topics, pages, edges };
}

function mean(numbers) { return numbers.reduce((sum, value) => sum + value, 0) / numbers.length; }

function principalCoordinates(vectors) {
  if (vectors.length === 0) return [];
  const dimensions = vectors[0].length;
  const center = Array(dimensions).fill(0);
  for (const vector of vectors) for (let d = 0; d < dimensions; d++) center[d] += vector[d] / vectors.length;
  const centered = vectors.map((vector) => vector.map((value, d) => value - center[d]));
  const axes = [];
  for (let axisIndex = 0; axisIndex < 2; axisIndex++) {
    let axis = Array(dimensions).fill(0);
    let bestVariance = 0;
    for (let d = 0; d < dimensions; d++) {
      const seed = Array(dimensions).fill(0);
      seed[d] = 1;
      for (const prior of axes) {
        const projection = dot(seed, prior);
        for (let k = 0; k < dimensions; k++) seed[k] -= prior[k] * projection;
      }
      const length = Math.hypot(...seed);
      if (length < 1e-12) continue;
      const unit = seed.map((value) => value / length);
      const variance = centered.reduce((sum, vector) => sum + dot(vector, unit) ** 2, 0);
      if (variance > bestVariance) { bestVariance = variance; axis = unit; }
    }
    if (bestVariance < 1e-20) { axes.push(axis); continue; }
    for (let iteration = 0; iteration < 80; iteration++) {
      const next = Array(dimensions).fill(0);
      for (const vector of centered) {
        const weight = dot(vector, axis);
        for (let d = 0; d < dimensions; d++) next[d] += vector[d] * weight;
      }
      for (const prior of axes) {
        const projection = dot(next, prior);
        for (let d = 0; d < dimensions; d++) next[d] -= prior[d] * projection;
      }
      const length = Math.hypot(...next);
      if (length < 1e-12) break;
      axis = next.map((value) => value / length);
    }
    const first = axis.find((value) => Math.abs(value) > 1e-12);
    if (first < 0) axis = axis.map((value) => -value);
    axes.push(axis);
  }
  const raw = centered.map((vector) => ({ x: dot(vector, axes[0]), y: dot(vector, axes[1]) }));
  const extent = Math.max(1e-12, ...raw.map(({ x, y }) => Math.max(Math.abs(x), Math.abs(y))));
  return raw.map(({ x, y }) => ({ x: 0.5 + x / (2 * extent), y: 0.5 + y / (2 * extent) }));
}

function dot(left, right) {
  let value = 0;
  for (let d = 0; d < left.length; d++) value += left[d] * right[d];
  return value;
}

function nearestNeighborEdges(sources, unitVectors) {
  const neighbors = sources.map(() => []);
  for (let a = 0; a < sources.length; a++) for (let b = a + 1; b < sources.length; b++) {
    const score = Math.max(-1, Math.min(1, dot(unitVectors[a], unitVectors[b])));
    neighbors[a].push({ index: b, score });
    neighbors[b].push({ index: a, score });
  }
  const edges = new Map();
  for (let a = 0; a < sources.length; a++) {
    neighbors[a].sort((left, right) => right.score - left.score ||
      sources[left.index].id.localeCompare(sources[right.index].id, "en"));
    for (const neighbor of neighbors[a].slice(0, NEIGHBORS_PER_PAGE)) {
      const b = neighbor.index;
      const sourceId = sources[Math.min(a, b)].id;
      const targetId = sources[Math.max(a, b)].id;
      edges.set(`${sourceId}\0${targetId}`, { sourceId, targetId, score: neighbor.score });
    }
  }
  return [...edges.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId, "en") ||
    a.targetId.localeCompare(b.targetId, "en"));
}
