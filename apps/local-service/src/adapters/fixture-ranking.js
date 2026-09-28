import { rankRelatedSources } from "../../../../spikes/topic-resolution/browser/core/related-sources.js";

export function createFixtureRankingAdapter() {
  return Object.freeze({
    model: Object.freeze({ id: "hand-authored-demo-vectors/1", status: "fixture-only" }),
    rank(source, candidates, limit) {
      return rankRelatedSources(source, candidates, { limit, minSimilarity: 0.65 });
    },
  });
}

export function createUnavailableRankingAdapter() {
  return Object.freeze({
    model: Object.freeze({ id: null, status: "model-unavailable" }),
    rank() { return Object.freeze([]); },
  });
}
