import { isDeepStrictEqual } from "node:util";
import { applyLearnedIngest, ingestionResult, LEARNED_SOURCE_PROVENANCE } from "../domain/learned-sources.js";
import { operationDigestFor } from "../domain/source-threads.js";
import { fail } from "../domain/errors.js";

const keys = { topics: "id", discussions: "id", sources: "id", sourceLinks: "sourceId", contributions: "id" };

// The worker returns only the canonical closure affected by the plan. The
// authoritative repository verifies the revision and exact old rows atomically.
export function ingestionScopes(before, after) {
  const maps = [before, after].map(state => Object.fromEntries(Object.entries(keys)
    .map(([name, key]) => [name, new Map(state[name].map(value => [value[key], value]))])));
  const selected = Object.fromEntries(Object.keys(keys).map(name => [name, new Set()]));
  const changedDiscussions = new Set(), changedSources = new Set();
  for (const [name] of Object.entries(keys)) {
    const [old, next] = maps.map(map => map[name]);
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      if (isDeepStrictEqual(old.get(id), next.get(id))) continue;
      selected[name].add(id);
      for (const value of [old.get(id), next.get(id)].filter(Boolean)) {
        if (name === "discussions") changedDiscussions.add(id);
        if (name === "contributions") changedDiscussions.add(value.discussionId);
        if (name === "sources" || name === "sourceLinks") changedSources.add(id);
      }
    }
  }
  for (const state of [before, after]) for (const value of state.contributions) {
    if (changedDiscussions.has(value.discussionId) || changedSources.has(value.originSourceId) || changedSources.has(value.anchor?.sourceId))
      selected.contributions.add(value.id);
  }
  let expanded;
  do {
    expanded = false;
    const add = (name, id) => {
      if (id && !selected[name].has(id)) { selected[name].add(id); expanded = true; }
    };
    for (const map of maps) {
      for (const id of selected.contributions) {
        const value = map.contributions.get(id);
        if (!value) continue;
        add("discussions", value.discussionId); add("contributions", value.rootId); add("contributions", value.replyToId);
        add("sources", value.originSourceId); add("sources", value.anchor?.sourceId);
      }
      for (const id of selected.sources) add("sourceLinks", id);
      for (const id of selected.sourceLinks) {
        const value = map.sourceLinks.get(id);
        if (value) { add("sources", value.sourceId); add("topics", value.topicId); }
      }
      for (const id of selected.discussions) add("topics", map.discussions.get(id)?.topicId);
      for (const value of map.discussions.values()) if (selected.topics.has(value.topicId)) add("discussions", value.id);
    }
  } while (expanded);
  return [before, after].map(state => ({ schema: state.schema, generation: state.generation, revision: state.revision,
    ...Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, state[name].filter(value => selected[name].has(value[key]))])) }));
}

export function prepareIngestion(state, input, dependencies) {
  if (state.generation !== input.expected.generation) fail("conflict", "State changed");
  const digest = operationDigestFor(input);
  const receipt = state.sources.find(source => source.provenance === LEARNED_SOURCE_PROVENANCE && source.operationId === input.operationId);
  if (receipt) {
    if (receipt.url !== input.url || receipt.operationDigest !== digest) fail("conflict", "Operation changed");
    return { receipt: true, version: { generation: state.generation, revision: state.revision }, result: ingestionResult(state, receipt) };
  }
  if (state.revision !== input.expected.revision) fail("conflict", "State changed");
  const outcome = applyLearnedIngest(state, input, digest, dependencies);
  const [before, after] = ingestionScopes(state, outcome.state);
  return { receipt: false, before, after, result: outcome.result };
}
