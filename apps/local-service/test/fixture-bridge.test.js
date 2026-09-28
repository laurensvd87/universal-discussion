import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RELATED_SOURCE_FIXTURES } from "../../../spikes/topic-resolution/browser/fixtures/related-source-fixtures.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS, BRIDGE_PROVENANCE } from "../src/adapters/fixture-catalog.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { demoService, deterministicDependencies } from "./helpers.js";

test("reserved-domain bridge adds separate synthetic sources without modifying six Harbor fixtures", () => {
  for (let i = 0; i < RELATED_SOURCE_FIXTURES.length; i += 1) {
    const { provenance, ...unchanged } = SYNTHETIC_SOURCES[i];
    assert.deepEqual(unchanged, RELATED_SOURCE_FIXTURES[i]);
  }
  const catalog = demoService().catalog();
  assert.equal(catalog.sources.length, 8);
  const bridge = catalog.sources.filter((source) => source.provenance === BRIDGE_PROVENANCE);
  assert.deepEqual(bridge.map((source) => [source.id, source.url, source.topicId]), [
    ["reserved-example-com", "https://example.com/", "reserved-domain-demo"],
    ["reserved-example-org", "https://example.org/", "reserved-domain-demo"],
  ]);
  assert.ok(SYNTHETIC_SOURCES.slice(6).every((source) => source.embedding === null));
});

test("two reserved-domain bridge sources share one discussion through explicit confirmed links", () => {
  const service = demoService();
  const first = service.catalog().sources.find((source) => source.id === "reserved-example-com");
  const second = service.catalog().sources.find((source) => source.id === "reserved-example-org");
  service.command(service.catalog().version, { type: "create-root", topicId: first.topicId, body: "Explicit synthetic bridge demo" }, "demo-alex");
  assert.equal(service.discussion(second.topicId).roots[0].body, "Explicit synthetic bridge demo");
  assert.equal(service.discussion("harbor-s2").roots.length, 0);
  assert.deepEqual(service.related(first.id).results.map(({ id, relationship, method }) => ({ id, relationship, method })), [
    { id: second.id, relationship: "same-topic", method: "confirmed-topic" },
  ]);
  assert.equal(service.related("harbor-overview").results.some((source) => source.id.startsWith("reserved-")), false);
});

test("reopening pre-bridge database preserves stored catalog until explicit reset", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-bridge-"));
  const databasePath = path.join(directory, "demo.sqlite");
  let application;
  try {
    const dependencies = deterministicDependencies();
    const old = createDemoState({ generation: "pre-bridge", createdAt: dependencies.now(), sources: SYNTHETIC_SOURCES.slice(0, 6), topicSeeds: SYNTHETIC_TOPIC_SEEDS.slice(0, 3) });
    const repository = createSqliteRepository(databasePath, old);
    repository.close();
    application = createSqliteDemoService({ databasePath, ...dependencies });
    assert.equal(application.service.catalog().sources.length, 6);
    application.service.reset(application.service.catalog().version, "RESET DEMO STATE");
    assert.equal(application.service.catalog().sources.length, 8);
  } finally {
    application?.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("udl-bridge-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
