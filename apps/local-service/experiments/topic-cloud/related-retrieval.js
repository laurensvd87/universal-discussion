// Offline proposal only. Inputs are synthetic, caller-supplied Source records.
// The live /v1/related endpoint and Topic assignments do not import this file.
import { rankRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";

function normalizedTitle(title) {
  return title.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function pairCosine(left, right) {
  const a = left.embedding.values;
  const b = right.embedding.values;
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const aLength = Math.hypot(...a);
  const bLength = Math.hypot(...b);
  return dot / (aLength * bLength);
}

// A repeated title is a weak signal on its own. Suppress only a near-identical
// vector plus title pair, and keep every existing same-Topic association visible.
export function proposeRelatedCandidates(query, candidates, { limit = 20, minSimilarity = 0.85 } = {}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new TypeError("Invalid proposal limit");
  // The underlying ranker resolves duplicate IDs by sorted order, while the
  // vector lookup below would otherwise resolve them by input order.
  const ids = new Set();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) throw new TypeError("Duplicate proposal Source ID");
    ids.add(candidate.id);
  }
  const ranked = rankRelatedSources(query, candidates, { limit: 100, minSimilarity });
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const selected = [];
  const copies = [];
  for (const result of ranked) {
    if (selected.length === limit) break;
    if (result.relationship === "same-topic") {
      selected.push(result);
      continue;
    }
    const title = normalizedTitle(result.title);
    const duplicate = copies.some(previous => previous.title === title &&
      pairCosine(byId.get(previous.id), byId.get(result.id)) >= 0.995);
    if (duplicate) continue;
    selected.push(result);
    copies.push({ title, id: result.id });
  }
  return Object.freeze(selected);
}
