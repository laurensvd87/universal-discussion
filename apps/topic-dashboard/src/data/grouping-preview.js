import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDiagonalAdapter } from "../../../local-service/src/domain/diagonal-adapter.js";
import { planAlternateTopics } from "../../../local-service/src/domain/alternate-topic-planner.js";
import { LEARNED_SOURCE_PROVENANCE } from "../../../local-service/src/domain/learned-sources.js";

export const LOCAL_ADAPTER_PATH = fileURLToPath(new URL("../../../local-service/data/diagonal-adapter-v1.json", import.meta.url));
const MAX_ADAPTER_BYTES = 16_384;

// This is a local owner artifact. Missing or malformed weights only disable
// the comparison; no parameter is copied into the dashboard export.
export function readOwnerAdapter(filename = LOCAL_ADAPTER_PATH) {
  try {
    const file = lstatSync(filename);
    if (!file.isFile() || file.isSymbolicLink() || file.size < 1 || file.size > MAX_ADAPTER_BYTES) return null;
    const bytes = readFileSync(filename);
    if (bytes.length !== file.size) return null;
    return readDiagonalAdapter(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return null; }
}

export function buildGroupingPreview(state, snapshot, adapter) {
  if (!adapter) return null;
  try {
    const planned = planAlternateTopics({ sources: state.sources, sourceLinks: state.sourceLinks, adapter });
    const displayed = new Set(snapshot.pages.map((page) => page.id));
    const eligible = new Set(state.sources.filter((source) =>
      source.provenance === LEARNED_SOURCE_PROVENANCE &&
      state.sourceLinks.some((link) => link.sourceId === source.id && link.method === "learned-provisional"))
      .map((source) => source.id));
    const seen = new Set();
    const groups = planned.partitions.map((partition) => {
      for (const id of partition.sourceIds) {
        if (!displayed.has(id) || !eligible.has(id) || seen.has(id)) throw new Error("Invalid experimental partition");
        seen.add(id);
      }
      return { sourceIds: partition.sourceIds };
    });
    for (const id of displayed) if (!seen.has(id)) groups.push({ sourceIds: [id] });
    groups.sort((a, b) => a.sourceIds[0].localeCompare(b.sourceIds[0], "en"));
    if (groups.length === 0) return null;
    return { schemaVersion: "grouping-preview/v1", catalogRevision: snapshot.catalogRevision, groups };
  } catch {
    // Capacity or representation failure leaves the canonical view available.
    return null;
  }
}
