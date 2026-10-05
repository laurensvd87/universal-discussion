// Synthetic-only shadow algorithm. No production imports, persistence or I/O.
const DEFAULTS = Object.freeze({ vectorLimit: 8, lexicalLimit: 8, edgeLimit: 12, insightLimit: 4 });
const tokens = title => new Set(title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
const overlap = (a, b) => {
  const intersection = [...a].filter(value => b.has(value)).length;
  return intersection / (a.size + b.size - intersection || 1);
};
const norm = v => Math.hypot(...v);
const cosine = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0) / (norm(a) * norm(b));
const byScore = (a, b) => b.score - a.score || a.id.localeCompare(b.id);

export function validate(documents) {
  if (!Array.isArray(documents) || !documents.length) throw new Error('Synthetic documents required');
  const ids = new Set(), dimensions = documents[0]?.vector?.length;
  if (!Number.isInteger(dimensions) || dimensions < 2) throw new Error('Invalid vector dimension');
  for (const doc of documents) {
    if (typeof doc.id !== 'string' || !doc.id || ids.has(doc.id) ||
        typeof doc.title !== 'string' || !doc.title || typeof doc.domain !== 'string' || !doc.domain ||
        !Array.isArray(doc.vector) || doc.vector.length !== dimensions ||
        doc.vector.some(value => !Number.isFinite(value)) || norm(doc.vector) === 0) {
      throw new Error('Invalid synthetic document');
    }
    ids.add(doc.id);
  }
  return documents;
}

function scored(query, doc) {
  const vector = cosine(query.vector, doc.vector);
  const lexical = overlap(tokens(query.title), tokens(doc.title));
  return { id: doc.id, doc, vector, lexical, score: 0.8 * vector + 0.2 * lexical };
}

// Exact scan is intentionally used at this small synthetic scale. Each query
// returns bounded edges; it never creates a transitive component or Topic ID.
export function neighbors(queryId, documents, options = {}) {
  validate(documents);
  const settings = { ...DEFAULTS, ...options };
  for (const key of ['vectorLimit', 'lexicalLimit', 'edgeLimit']) {
    if (!Number.isInteger(settings[key]) || settings[key] < 1) throw new Error(`Invalid ${key}`);
  }
  const query = documents.find(doc => doc.id === queryId);
  if (!query) throw new Error('Unknown query');
  const rows = documents.filter(doc => doc.id !== queryId).map(doc => scored(query, doc));
  // Syndicated copies cannot consume the entire retrieval budget. This is a
  // similarity/title heuristic, not a fact about shared reporting or opinion.
  const unique = [];
  for (const row of [...rows].sort(byScore)) {
    if (!unique.some(previous => cosine(previous.doc.vector, row.doc.vector) >= 0.995 &&
        overlap(tokens(previous.doc.title), tokens(row.doc.title)) >= 0.7)) unique.push(row);
  }
  const vector = [...unique].sort((a, b) => b.vector - a.vector || a.id.localeCompare(b.id)).slice(0, settings.vectorLimit);
  const lexical = [...unique].sort((a, b) => b.lexical - a.lexical || a.id.localeCompare(b.id)).slice(0, settings.lexicalLimit);
  const candidates = new Map([...vector, ...lexical].map(row => [row.id, row]));
  return [...candidates.values()].sort(byScore).slice(0, settings.edgeLimit).map(({ doc, ...row }) => row);
}

export function selectInsights(queryId, documents, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  if (!Number.isInteger(settings.insightLimit) || settings.insightLimit < 1 || settings.insightLimit > 4) throw new Error('Invalid insightLimit');
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  const available = neighbors(queryId, documents, settings).filter(row => byId.get(row.id).accessible !== false && row.score > 0);
  const selected = [];
  while (selected.length < settings.insightLimit && available.length) {
    const ranked = available.map(row => {
      const doc = byId.get(row.id);
      const redundancy = Math.max(0, ...selected.map(prior => {
        const other = byId.get(prior.id);
        const sameDomain = doc.domain === other.domain ? 0.1 : 0;
        const nearCopy = overlap(tokens(doc.title), tokens(other.title));
        return Math.max(0, cosine(doc.vector, other.vector)) * 0.23 + nearCopy * 0.12 + sameDomain;
      }));
      return { ...row, selectionScore: row.score - redundancy };
    }).sort((a, b) => b.selectionScore - a.selectionScore || byScore(a, b));
    const best = ranked[0];
    // A weak fourth page is not made useful merely by an empty slot.
    if (best.selectionScore < 0.28) break;
    selected.push(best);
    available.splice(available.findIndex(row => row.id === best.id), 1);
  }
  return selected;
}

export function evaluate(queryId, documents, grades, selected = neighbors(queryId, documents)) {
  const relevant = Object.entries(grades).filter(([id, grade]) => id !== queryId && grade > 0);
  const gain = grade => 2 ** grade - 1;
  const dcg = rows => rows.reduce((sum, row, index) => sum + gain(grades[row.id] ?? 0) / Math.log2(index + 2), 0);
  const ideal = relevant.map(([id, grade]) => ({ id, grade })).sort((a, b) => b.grade - a.grade).slice(0, selected.length);
  return {
    recall: relevant.length ? selected.filter(row => (grades[row.id] ?? 0) > 0).length / relevant.length : 1,
    ndcg: ideal.length ? dcg(selected) / ideal.reduce((sum, row, index) => sum + gain(row.grade) / Math.log2(index + 2), 0) : 1,
    falseJoins: null, // Not applicable: no discussion membership or merge is attempted.
  };
}
